import "server-only";
import { prisma } from "@/server/db/prisma";
import { lockLocations, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, invalidState, notFound } from "@/server/http/errors";
import { recalculateRestockForLocations } from "@/server/modules/restocking/restock.service";
import { refreshBlockingReasons } from "@/server/modules/dispatch/dispatch.service";
import type {
  CorrectStockRequest,
  EquipmentUnitDto,
  InventoryDetailDto,
  InventoryLocationDto,
  ReceiveStockRequest,
  LocationStockDto,
  StockCorrectionDto,
  StockMovementDto,
  TransferStockRequest,
  VerifyUnitRequest,
} from "@/lib/contracts/inventory";
import type { StockMovement } from "@/generated/prisma/client";
import { assignableQuantity } from "./availability";
import { buildStockLines, getBalance, loadStockFigures } from "./inventory.repository";
import { applyCount, moveStock } from "./stock-ledger";
import { isRetryableConflict } from "@/server/db/transaction";

// ─── Reads ──────────────────────────────────────────────────────────────────

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

/** All locations, including warehouses awaiting their first physical count. */
export async function listInventoryLocations(): Promise<InventoryLocationDto[]> {
  const locations = await prisma.location.findMany({
    include: { van: true },
    orderBy: { name: "asc" },
  });
  return Promise.all(locations.map(async (location) => ({
    locationId: location.id,
    locationName: location.name,
    kind: location.kind,
    inventoryTracked: location.kind === "VAN" || location.inventoryTracked,
    vanId: location.van?.id ?? null,
    lines: location.kind === "VAN" || location.inventoryTracked ? await buildStockLines(prisma, location.id) : [],
  })));
}

export async function getInventoryDetail(locationId: string, productId: string): Promise<InventoryDetailDto> {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true, kind: true, inventoryTracked: true } });
  if (!location) throw notFound("Location", locationId);
  if (location.kind !== "VAN" && !location.inventoryTracked) throw invalidState("Configure the warehouse physical count first");
  await requireProduct(prisma, productId);
  const [units, reservations, movements] = await Promise.all([
    prisma.equipmentUnit.findMany({
      where: { locationId, productId, status: "IN_STOCK" },
      orderBy: [{ condition: "asc" }, { verification: "asc" }, { createdAt: "asc" }],
    }),
    prisma.reservation.findMany({
      where: { locationId, productId },
      include: { job: { include: { branch: { include: { customer: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    listMovements({ locationId, productId, limit: 100 }),
  ]);
  return {
    locationId,
    productId,
    units: units.map((unit) => ({
      id: unit.id,
      productId: unit.productId,
      serialNumber: unit.serialNumber,
      verification: unit.verification,
      condition: unit.condition,
      locationId: unit.locationId,
      verifiedAt: unit.verifiedAt?.toISOString() ?? null,
      verifiedBy: unit.verifiedBy,
    })),
    reservations: reservations.map((reservation) => ({
      id: reservation.id,
      jobReference: reservation.job.reference,
      customer: reservation.job.branch.customer.name,
      branch: reservation.job.branch.name,
      quantity: reservation.quantity,
      status: reservation.status,
    })),
    movements,
  };
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

/** Receives stock through the hub endpoint using the shared stock ledger. */
export async function receiveStock(input: ReceiveStockRequest): Promise<StockMovementDto> {
  const previous = await prisma.stockMovement.findUnique({ where: { operationKey: input.operationKey } });
  if (previous) return matchReceipt(previous, input);
  try {
    const movement = await runInTransaction(async (tx) => {
      const [location, hub] = await Promise.all([
        tx.location.findUnique({ where: { id: input.locationId } }),
        tx.location.findFirst({ where: { kind: "HUB" } }),
      ]);
      if (!location) throw notFound("Location", input.locationId);
      if (location.kind !== "VAN") throw invalidState("Receipts can only be added to a counted van location");
      if (!hub) throw invalidState("No warehouse location is configured for receipts");
      await requireProduct(tx, input.productId);
      await lockLocations(tx, [location.id, hub.id]);
      const received = await moveStock(tx, {
        type: "RESTOCK_COLLECTION",
        productId: input.productId,
        condition: input.condition,
        quantity: input.quantity,
        from: { locationId: hub.id },
        to: { locationId: location.id },
        serials: input.serials,
        performedBy: input.performedBy,
        note: input.note,
        operationKey: input.operationKey,
      });
      await recalculateRestockForLocations(tx, [location.id]);
      return received;
    });
    await refreshBlockingReasons();
    return toMovementDto(movement);
  } catch (error) {
    // Concurrent repeat with the same operation key: the unique index rolls back
    // the losing transaction, then the committed movement is returned to the caller.
    const committed = await prisma.stockMovement.findUnique({ where: { operationKey: input.operationKey } });
    if (committed) return matchReceipt(committed, input);
    if (isRetryableConflict(error)) throw error;
    throw error;
  }
}

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
    if (location.kind !== "VAN" && !location.inventoryTracked) throw invalidState("Configure the warehouse physical count first");
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

function matchReceipt(movement: StockMovement, input: ReceiveStockRequest): StockMovementDto {
  const sameSerials = movement.serials.length === (input.serials ?? []).length &&
    movement.serials.every((serial, index) => serial === (input.serials ?? [])[index]);
  if (
    movement.type !== "RESTOCK_COLLECTION" || movement.toLocationId !== input.locationId ||
    movement.productId !== input.productId || movement.condition !== input.condition ||
    movement.quantity !== input.quantity || movement.performedBy !== input.performedBy ||
    movement.note !== input.note || !sameSerials
  ) {
    throw new AppError("CONFLICT", "This receipt key was already used for a different stock operation; refresh inventory and start a new receipt");
  }
  return toMovementDto(movement);
}
