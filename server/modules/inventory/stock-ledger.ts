import "server-only";
import type { Tx } from "@/server/db/transaction";
import { AppError } from "@/server/http/errors";
import type { StockCondition, StockMovementType, UnitStatus } from "@/generated/prisma/enums";

// The only code that changes stock balances and serialised unit rows.
//
// moveStock() writes, in the caller's transaction:
//   1. the balance change at each tracked end (VAN locations),
//   2. for serialised products, the matching EquipmentUnit rows,
//   3. one StockMovement recording both ends.
//
// Callers must already hold the location locks (see server/db/transaction.ts).

export type Endpoint = { locationId: string } | { branchId: string };

export interface MovementInput {
  type: StockMovementType;
  productId: string;
  condition: StockCondition;
  quantity: number;
  from?: Endpoint;
  to?: Endpoint;
  /** Serial numbers of the units moved, when known. One per unit. */
  serials?: string[];
  /** Which units leave a location when no serials are given. */
  unitPreference?: "VERIFIED_FIRST" | "UNVERIFIED_FIRST";
  /** Only the import may create a negative balance (and it raises an issue when it does). */
  allowNegative?: boolean;
  performedBy: string;
  note?: string;
  jobId?: string;
  restockJobId?: string;
  correctionId?: string;
  importRowId?: string;
}

export async function moveStock(tx: Tx, input: MovementInput) {
  if (input.quantity <= 0) throw new AppError("VALIDATION_FAILED", "Quantity must be positive");

  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
  const fromLocation = await trackedLocationId(tx, input.from);
  const toLocation = await trackedLocationId(tx, input.to);

  if (fromLocation) {
    const after = await changeBalance(tx, fromLocation, input.productId, input.condition, -input.quantity);
    if (after < 0 && !input.allowNegative) {
      throw new AppError(
        "NEGATIVE_STOCK",
        `Not enough ${product.sku} (${input.condition.toLowerCase()}) at this location: this would leave ${after}`,
        { productId: input.productId, shortBy: -after },
      );
    }
  }
  if (toLocation) await changeBalance(tx, toLocation, input.productId, input.condition, input.quantity);

  let serials = input.serials ?? [];
  if (product.serialised) {
    serials = await moveUnits(tx, input, fromLocation, toLocation);
  }

  return tx.stockMovement.create({
    data: {
      type: input.type,
      productId: input.productId,
      condition: input.condition,
      quantity: input.quantity,
      fromLocationId: locationOf(input.from),
      toLocationId: locationOf(input.to),
      branchId: branchOf(input.from) ?? branchOf(input.to),
      jobId: input.jobId,
      restockJobId: input.restockJobId,
      correctionId: input.correctionId,
      importRowId: input.importRowId,
      serials,
      performedBy: input.performedBy,
      note: input.note,
    },
  });
}

async function changeBalance(tx: Tx, locationId: string, productId: string, condition: StockCondition, delta: number) {
  const row = await tx.stockBalance.upsert({
    where: { locationId_productId_condition: { locationId, productId, condition } },
    create: { locationId, productId, condition, quantity: delta },
    update: { quantity: { increment: delta } },
  });
  return row.quantity;
}

/** Returns the location id if the endpoint is a location whose balances we track. */
async function trackedLocationId(tx: Tx, endpoint: Endpoint | undefined): Promise<string | null> {
  const locationId = locationOf(endpoint);
  if (!locationId) return null;
  const location = await tx.location.findUniqueOrThrow({ where: { id: locationId }, select: { kind: true } });
  return location.kind === "VAN" ? locationId : null;
}

function locationOf(endpoint: Endpoint | undefined) {
  return endpoint && "locationId" in endpoint ? endpoint.locationId : null;
}

function branchOf(endpoint: Endpoint | undefined) {
  return endpoint && "branchId" in endpoint ? endpoint.branchId : null;
}

// ─── Serialised units ───────────────────────────────────────────────────────

/** Moves (or creates) unit rows so they mirror the balance change. Returns the serials involved. */
async function moveUnits(tx: Tx, input: MovementInput, fromLocation: string | null, toLocation: string | null) {
  const destination = unitDestination(input, toLocation);

  if (fromLocation) {
    const units = await takeUnits(tx, fromLocation, input);
    await tx.equipmentUnit.updateMany({ where: { id: { in: units.map((u) => u.id) } }, data: destination });
    return units.flatMap((u) => (u.serialNumber ? [u.serialNumber] : []));
  }

  if (toLocation) {
    // Arriving from outside the tracked locations (hub, customer branch, or a count).
    const serials = input.serials ?? [];
    for (const serialNumber of serials) {
      const known = await tx.equipmentUnit.findUnique({ where: { serialNumber } });
      if (known?.status === "IN_STOCK") {
        // Already counted in a van: arriving here without leaving there would double-count it.
        throw new AppError("CONFLICT", `Unit ${serialNumber} is already in stock in another van; transfer it instead`);
      }
      const unit = { productId: input.productId, verification: "VERIFIED" as const, condition: input.condition, ...destination };
      if (known) await tx.equipmentUnit.update({ where: { id: known.id }, data: unit });
      else await tx.equipmentUnit.create({ data: { ...unit, serialNumber } });
    }
    const unidentified = input.quantity - serials.length;
    if (unidentified > 0) {
      await tx.equipmentUnit.createMany({
        data: Array.from({ length: unidentified }, () => ({
          productId: input.productId,
          verification: "NEEDS_VERIFICATION" as const,
          condition: input.condition,
          ...destination,
        })),
      });
    }
    return serials;
  }

  return input.serials ?? [];
}

function unitDestination(input: MovementInput, toLocation: string | null) {
  const to = input.to;
  let status: UnitStatus;
  if (toLocation) status = "IN_STOCK";
  else if (to && "branchId" in to) status = "INSTALLED";
  else if (to && "locationId" in to) status = "AT_HUB";
  else status = "WRITTEN_OFF";
  return { status, locationId: toLocation ?? locationOf(to), branchId: branchOf(to) };
}

/**
 * Picks the unit rows leaving a location. Named serials are taken exactly; a serial
 * not yet known here is attached to one of the location's unverified units (the
 * technician has just identified it). Otherwise units are taken by preference.
 */
async function takeUnits(tx: Tx, locationId: string, input: MovementInput) {
  const inStockHere = { locationId, productId: input.productId, condition: input.condition, status: "IN_STOCK" as const };

  if (input.serials?.length) {
    const taken: { id: string; serialNumber: string | null }[] = [];
    for (const serialNumber of input.serials) {
      const known = await tx.equipmentUnit.findUnique({ where: { serialNumber } });
      if (known) {
        const isHere =
          known.locationId === locationId &&
          known.productId === input.productId &&
          known.condition === input.condition &&
          known.status === "IN_STOCK";
        if (!isHere) throw new AppError("CONFLICT", `Unit ${serialNumber} is not in stock at this location`);
        taken.push(known);
        continue;
      }
      const placeholder = await tx.equipmentUnit.findFirst({
        where: { ...inStockHere, verification: "NEEDS_VERIFICATION", id: { notIn: taken.map((t) => t.id) } },
        orderBy: { createdAt: "asc" },
      });
      if (!placeholder) throw new AppError("CONFLICT", `Unit ${serialNumber} is not in stock at this location`);
      const identified = await tx.equipmentUnit.update({
        where: { id: placeholder.id },
        data: { serialNumber, verification: "VERIFIED", verifiedAt: new Date(), verifiedBy: input.performedBy },
      });
      taken.push(identified);
    }
    return taken;
  }

  const units = await tx.equipmentUnit.findMany({
    where: inStockHere,
    // Postgres orders enums by declaration: VERIFIED before NEEDS_VERIFICATION.
    orderBy: [{ verification: input.unitPreference === "UNVERIFIED_FIRST" ? "desc" : "asc" }, { createdAt: "asc" }],
    take: input.quantity,
    select: { id: true, serialNumber: true },
  });
  if (units.length < input.quantity && !input.allowNegative) {
    throw new AppError("CONFLICT", "Unit records do not match the stock balance; correct the count first");
  }
  return units;
}
