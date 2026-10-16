import "server-only";
import { prisma } from "@/server/db/prisma";
import { lockLocations, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, invalidState, notFound } from "@/server/http/errors";
import { recalculateRestockForLocations } from "@/server/modules/restocking/restock.service";
import { refreshBlockingReasons } from "@/server/modules/dispatch/dispatch.service";
import type {
  CorrectStockRequest,
  EquipmentUnitDto,
  LocationStockDto,
  StockCorrectionDto,
  StockMovementDto,
  TransferStockRequest,
  VerifyUnitRequest,
} from "@/lib/contracts/inventory";
import type { ProductDto } from "@/lib/contracts/products";
import type { StockMovement } from "@/generated/prisma/client";
import { assignableQuantity } from "./availability";
import { buildStockLines, getBalance, loadStockFigures } from "./inventory.repository";
import { applyCount, moveStock } from "./stock-ledger";

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listProducts(): Promise<ProductDto[]> {
  return prisma.product.findMany({
    orderBy: { sku: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      serialised: true,
      baseUnit: true,
      packUnit: true,
      packSize: true,
      vanMinimum: true,
      autoRestock: true,
      restockPolicyNeedsReview: true,
      restockPolicyNote: true,
    },
  });
}

export async function getLocationStock(locationId: string): Promise<LocationStockDto> {
  const location = await prisma.location.findUnique({ where: { id: locationId }, include: { van: true } });
  if (!location) throw notFound("Location", locationId);
  return {
    locationId,
    locationName: location.name,
    vanId: location.van?.id ?? null,
    lines: await buildStockLines(prisma, locationId),
  };
}

export async function getVanStock(vanId: string): Promise<LocationStockDto> {
  const van = await prisma.van.findUnique({ where: { id: vanId } });
  if (!van) throw notFound("Van", vanId);
  return getLocationStock(van.locationId);
}

export async function listMovements(filter: { locationId?: string; productId?: string; limit?: number }) {
  const location = filter.locationId;
  const movements = await prisma.stockMovement.findMany({
    where: {
      productId: filter.productId,
      ...(location ? { OR: [{ fromLocationId: location }, { toLocationId: location }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: filter.limit ?? 100,
  });
  return movements.map(toMovementDto);
}

// ─── Writes ─────────────────────────────────────────────────────────────────

/**
 * Moves stock between two places in one movement that records both ends.
 * At least one end must be a van; the other may be another van or the hub.
 * Working stock that is reserved for assigned jobs cannot be moved away.
 */
export async function transferStock(input: TransferStockRequest): Promise<StockMovementDto> {
  const movement = await runInTransaction(async (tx) => {
    const locations = await tx.location.findMany({ where: { id: { in: [input.fromLocationId, input.toLocationId] } } });
    if (locations.length !== 2) throw notFound("Location", `${input.fromLocationId} / ${input.toLocationId}`);
    if (!locations.some((l) => l.kind === "VAN")) throw invalidState("A transfer must start or end at a van");
    await requireProduct(tx, input.productId);

    await lockLocations(tx, [input.fromLocationId, input.toLocationId]);
    const moved = await moveStock(tx, {
      type: "TRANSFER",
      productId: input.productId,
      condition: input.condition,
      quantity: input.quantity,
      from: { locationId: input.fromLocationId },
      to: { locationId: input.toLocationId },
      serials: input.serials,
      // Leave verified (assignable) units where they are unless serials say otherwise.
      unitPreference: "UNVERIFIED_FIRST",
      performedBy: input.performedBy,
      note: input.note,
    });
    if (input.condition === "WORKING") await assertReservationsCovered(tx, input.fromLocationId, input.productId);
    await recalculateRestockForLocations(tx, [input.fromLocationId, input.toLocationId]);
    return moved;
  });

  await refreshBlockingReasons();
  return toMovementDto(movement);
}

/**
 * Records a physical count that differs from the balance. Keeps who counted, when,
 * the previous and the corrected value, and why. A count equal to the balance is
 * still recorded (it confirms the figure) but creates no movement.
 */
export async function correctStock(input: CorrectStockRequest): Promise<StockCorrectionDto> {
  const correction = await runInTransaction(async (tx) => {
    const location = await tx.location.findUnique({ where: { id: input.locationId } });
    if (!location) throw notFound("Location", input.locationId);
    if (location.kind !== "VAN") throw invalidState("Only van stock is counted in this milestone");
    await requireProduct(tx, input.productId);

    await lockLocations(tx, [input.locationId]);
    const previous = await getBalance(tx, input.locationId, input.productId, input.condition);
    const record = await tx.stockCorrection.create({
      data: {
        locationId: input.locationId,
        productId: input.productId,
        condition: input.condition,
        previousQuantity: previous,
        correctedQuantity: input.countedQuantity,
        reason: input.reason,
        correctedBy: input.correctedBy,
      },
    });

    // The count is the resulting quantity: balance, unit rows and movement are set from it.
    await applyCount(tx, {
      locationId: input.locationId,
      productId: input.productId,
      condition: input.condition,
      countedQuantity: input.countedQuantity,
      performedBy: input.correctedBy,
      note: input.reason,
      correctionId: record.id,
    });
    if (input.countedQuantity !== previous) await recalculateRestockForLocations(tx, [input.locationId]);
    return record;
  });

  await refreshBlockingReasons();
  return toCorrectionDto(correction);
}

/**
 * Records the serial of one unit counted at a location without one, which makes it
 * assignable. No stock moves, so there is no movement record.
 */
export async function verifyUnit(input: VerifyUnitRequest): Promise<EquipmentUnitDto> {
  const unit = await runInTransaction(async (tx) => {
    const product = await requireProduct(tx, input.productId);
    if (!product.serialised) throw invalidState(`${product.sku} is not serialised`);
    await lockLocations(tx, [input.locationId]);

    const existing = await tx.equipmentUnit.findUnique({ where: { serialNumber: input.serialNumber } });
    if (existing) {
      throw new AppError("CONFLICT", `Serial ${input.serialNumber} is already recorded`, { unitId: existing.id });
    }
    const placeholder = await tx.equipmentUnit.findFirst({
      where: {
        locationId: input.locationId,
        productId: input.productId,
        status: "IN_STOCK",
        verification: "NEEDS_VERIFICATION",
      },
      // Working units first: those are the ones that unblock jobs.
      orderBy: [{ condition: "asc" }, { createdAt: "asc" }],
    });
    if (!placeholder) {
      throw invalidState(`No ${product.sku} awaiting verification at this location; record a stock correction if one was found`);
    }
    return tx.equipmentUnit.update({
      where: { id: placeholder.id },
      data: {
        serialNumber: input.serialNumber,
        verification: "VERIFIED",
        verifiedAt: new Date(),
        verifiedBy: input.verifiedBy,
      },
    });
  });

  await refreshBlockingReasons();
  return {
    id: unit.id,
    productId: unit.productId,
    serialNumber: unit.serialNumber,
    verification: unit.verification,
    condition: unit.condition,
    locationId: unit.locationId,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function requireProduct(tx: Tx, productId: string) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound("Product", productId);
  return product;
}

/** Refuses a change that would leave assigned jobs relying on stock that is no longer there. */
async function assertReservationsCovered(tx: Tx, locationId: string, productId: string) {
  const product = await tx.product.findUniqueOrThrow({ where: { id: productId } });
  const figures = (await loadStockFigures(tx, [locationId])).get(locationId, productId);
  const assignable = assignableQuantity(product.serialised, figures);
  if (figures.reserved > assignable) {
    throw new AppError(
      "INSUFFICIENT_STOCK",
      `Moving this would leave ${product.sku} short for assigned jobs (${figures.reserved} reserved, ${assignable} left)`,
      { productId, reserved: figures.reserved, assignableAfterMove: assignable },
    );
  }
}

export function toMovementDto(m: StockMovement): StockMovementDto {
  return {
    id: m.id,
    type: m.type,
    productId: m.productId,
    condition: m.condition,
    quantity: m.quantity,
    fromLocationId: m.fromLocationId,
    toLocationId: m.toLocationId,
    branchId: m.branchId,
    jobId: m.jobId,
    restockJobId: m.restockJobId,
    serials: m.serials,
    performedBy: m.performedBy,
    note: m.note,
    createdAt: m.createdAt.toISOString(),
  };
}

function toCorrectionDto(c: {
  id: string;
  locationId: string;
  productId: string;
  condition: "WORKING" | "BROKEN";
  previousQuantity: number;
  correctedQuantity: number;
  reason: string;
  correctedBy: string;
  correctedAt: Date;
}): StockCorrectionDto {
  return { ...c, correctedAt: c.correctedAt.toISOString() };
}
