import "server-only";
import { lockUnitsBySerial, type Tx } from "@/server/db/transaction";
import { AppError } from "@/server/http/errors";
import { Prisma } from "@/generated/prisma/client";
import type { StockCondition, StockMovementType, UnitStatus } from "@/generated/prisma/enums";

// The only code that changes stock balances and serialised unit rows.
//
// moveStock() writes, in the caller's transaction:
//   1. the balance change at each tracked end (vans and configured warehouses),
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
  operationKey?: string;
}

export async function moveStock(tx: Tx, input: MovementInput) {
  if (input.quantity <= 0) throw new AppError("VALIDATION_FAILED", "Quantity must be positive");

  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
  const fromLocation = await trackedLocationId(tx, input.from);
  const toLocation = await trackedLocationId(tx, input.to);
  // Before any write: a bad serial list must not reach the balances.
  if (product.serialised) assertSerialsMatchQuantity(input, fromLocation);
  if (product.serialised && toLocation && !fromLocation) await assertArrivingUnitsValid(tx, input, product.sku);

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
      operationKey: input.operationKey,
      serials,
      performedBy: input.performedBy,
      note: input.note,
    },
  });
}

export interface CountInput {
  locationId: string;
  productId: string;
  condition: StockCondition;
  countedQuantity: number;
  performedBy: string;
  note: string;
  correctionId: string;
}

/**
 * Applies a physical count at a tracked location. The count is the resulting quantity, not a
 * movement of particular units, so:
 *   1. serialised unit rows are reconciled to the counted number (not to the
 *      difference: an imported negative balance has no unit rows behind it),
 *   2. the balance becomes the counted number,
 *   3. one CORRECTION movement records the difference.
 * Units with a recorded serial are never written off here; a count below them is refused.
 */
export async function applyCount(tx: Tx, input: CountInput) {
  if (input.countedQuantity < 0) throw new AppError("VALIDATION_FAILED", "A counted quantity cannot be negative");
  const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
  if (!(await trackedLocationId(tx, input))) throw new AppError("VALIDATION_FAILED", "Only tracked location stock can be counted");

  const key = { locationId: input.locationId, productId: input.productId, condition: input.condition };
  const previous = (await tx.stockBalance.findUnique({ where: { locationId_productId_condition: key } }))?.quantity ?? 0;

  if (product.serialised) await reconcileUnitsToCount(tx, product.sku, input);

  await tx.stockBalance.upsert({
    where: { locationId_productId_condition: key },
    create: { ...key, quantity: input.countedQuantity },
    update: { quantity: input.countedQuantity },
  });

  const delta = input.countedQuantity - previous;
  if (delta === 0) return null;
  const here = input.locationId;
  return tx.stockMovement.create({
    data: {
      type: "CORRECTION",
      productId: input.productId,
      condition: input.condition,
      quantity: Math.abs(delta),
      fromLocationId: delta < 0 ? here : null,
      toLocationId: delta > 0 ? here : null,
      correctionId: input.correctionId,
      serials: [],
      performedBy: input.performedBy,
      note: input.note,
    },
  });
}

/**
 * Makes the IN_STOCK unit rows here number exactly the count. Missing units are added
 * as needing verification; surplus units without a serial are written off. Rows with a
 * serial keep their identity, condition and verification: if the count is below them,
 * nobody can say which device is missing, so the correction is refused for review.
 */
async function reconcileUnitsToCount(tx: Tx, sku: string, input: CountInput) {
  const units = await tx.equipmentUnit.findMany({
    where: { locationId: input.locationId, productId: input.productId, condition: input.condition, status: "IN_STOCK" },
    orderBy: { createdAt: "desc" },
    select: { id: true, serialNumber: true, verification: true },
  });
  const identified = units.filter((u) => u.serialNumber !== null);
  const unidentified = units.filter((u) => u.serialNumber === null);

  if (input.countedQuantity < identified.length) {
    throw new AppError(
      "CONFLICT",
      `Counted ${input.countedQuantity} ${sku} but ${identified.length} here have recorded serials; ` +
        "the missing-device reporting and recovery workflow is not available here; no inventory was changed",
      { countedQuantity: input.countedQuantity, serials: identified.map((u) => u.serialNumber) },
    );
  }

  const surplus = units.length - input.countedQuantity;
  if (surplus > 0) {
    await tx.equipmentUnit.updateMany({
      where: { id: { in: unidentified.slice(0, surplus).map((u) => u.id) } },
      data: { status: "WRITTEN_OFF", locationId: null },
    });
  } else if (surplus < 0) {
    await tx.equipmentUnit.createMany({
      data: Array.from({ length: -surplus }, () => ({
        productId: input.productId,
        verification: "NEEDS_VERIFICATION" as const,
        condition: input.condition,
        status: "IN_STOCK" as const,
        locationId: input.locationId,
      })),
    });
  }
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
  const location = await tx.location.findUniqueOrThrow({ where: { id: locationId }, select: { kind: true, inventoryTracked: true } });
  return location.kind === "VAN" || location.inventoryTracked ? locationId : null;
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
    assertDistinctUnits(units, input);
    await tx.equipmentUnit.updateMany({ where: { id: { in: units.map((u) => u.id) } }, data: destination });
    return units.flatMap((u) => (u.serialNumber ? [u.serialNumber] : []));
  }

  if (toLocation) {
    // Arriving from outside the tracked locations (hub, customer branch, or a count).
    // Known serials were checked and locked by assertArrivingUnitsValid.
    const serials = input.serials ?? [];
    for (const serialNumber of serials) {
      const known = await tx.equipmentUnit.findUnique({ where: { serialNumber } });
      // Only where it is and its condition change; product and serial are its identity.
      const arrival = { verification: "VERIFIED" as const, condition: input.condition, ...destination };
      if (known) await tx.equipmentUnit.update({ where: { id: known.id }, data: arrival });
      else await createUnit(tx, { ...arrival, productId: input.productId, serialNumber });
    }
    let unidentified = input.quantity - serials.length;
    // Setup adopts unidentified devices already returned to this legacy hub;
    // preserve their ids instead of creating duplicate physical units.
    if (input.type === "OPENING_BALANCE" && !input.from && unidentified > 0) {
      const returned = await tx.equipmentUnit.findMany({
        where: { locationId: toLocation, productId: input.productId, condition: input.condition, status: "AT_HUB", serialNumber: null },
        take: unidentified,
        select: { id: true },
      });
      if (returned.length) await tx.equipmentUnit.updateMany({ where: { id: { in: returned.map((unit) => unit.id) } }, data: destination });
      unidentified -= returned.length;
    }
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

/**
 * Serials name physical units, so each may appear once, and never more than the
 * quantity. Units leaving a van are either all named or all chosen by preference:
 * a partial list would move fewer unit rows than the balance change.
 */
function assertSerialsMatchQuantity(input: MovementInput, fromLocation: string | null) {
  const serials = input.serials ?? [];
  const duplicates = [...new Set(serials.filter((serial, index) => serials.indexOf(serial) !== index))];
  if (duplicates.length > 0) {
    throw new AppError("VALIDATION_FAILED", `Serial number listed more than once: ${duplicates.join(", ")}`, {
      duplicateSerials: duplicates,
    });
  }
  const mustMatch = fromLocation !== null && serials.length > 0;
  if (serials.length > input.quantity || (mustMatch && serials.length !== input.quantity)) {
    throw new AppError("VALIDATION_FAILED", `${serials.length} serial number(s) given for a quantity of ${input.quantity}; give one per unit`, {
      serials: serials.length,
      quantity: input.quantity,
    });
  }
}

/**
 * A serial arriving at a van from outside the vans must be new, or a known device of
 * the same product that is where this movement says it comes from: at that hub for a
 * collection or hub transfer, installed at that branch for a unit pulled out on site.
 * Checked before anything is written, with the device rows locked so two receipts of
 * the same device cannot both pass.
 */
async function assertArrivingUnitsValid(tx: Tx, input: MovementInput, sku: string) {
  const serials = input.serials ?? [];
  if (serials.length === 0) return;
  // A device in stock in a van belongs to that van's lock: refuse it without waiting on
  // its row, so this transaction never locks another van's units out of order.
  const inVan = await tx.equipmentUnit.findFirst({ where: { serialNumber: { in: serials }, status: "IN_STOCK" } });
  if (inVan) {
    throw new AppError("CONFLICT", `Unit ${inVan.serialNumber} is recorded as ${UNIT_WHEREABOUTS.IN_STOCK}, so it cannot be received`, {
      serialNumber: inVan.serialNumber,
      status: inVan.status,
    });
  }
  await lockUnitsBySerial(tx, serials);
  const known = await tx.equipmentUnit.findMany({
    where: { serialNumber: { in: serials } },
    include: { product: { select: { sku: true } } },
  });

  const from = input.from;
  const source = from && "branchId" in from ? "this customer branch" : from ? "the hub" : "a count";
  for (const unit of known) {
    if (unit.productId !== input.productId) {
      throw new AppError("VALIDATION_FAILED", `Serial ${unit.serialNumber} belongs to a ${unit.product.sku}, not a ${sku}; check the serial and product`, {
        serialNumber: unit.serialNumber,
        recordedProduct: unit.product.sku,
        submittedProduct: sku,
      });
    }
    const comesFromSource =
      from && "branchId" in from
        ? unit.status === "INSTALLED" && unit.branchId === from.branchId
        : from && "locationId" in from
          ? unit.status === "AT_HUB" && unit.locationId === from.locationId
          : input.type === "OPENING_BALANCE" && unit.status === "AT_HUB" && unit.locationId === locationOf(input.to);
    if (!comesFromSource) {
      throw new AppError("CONFLICT", `Unit ${unit.serialNumber} is recorded as ${UNIT_WHEREABOUTS[unit.status]}, so it cannot arrive from ${source}`, {
        serialNumber: unit.serialNumber,
        status: unit.status,
      });
    }
  }
}

const UNIT_WHEREABOUTS: Record<UnitStatus, string> = {
  IN_STOCK: "in stock at a tracked location (transfer it instead)",
  INSTALLED: "installed at a customer branch",
  AT_HUB: "at the hub",
  WRITTEN_OFF: "written off",
};

/** Creates a device; a concurrent receipt of the same new serial loses on the unique constraint. */
async function createUnit(tx: Tx, data: Prisma.EquipmentUnitUncheckedCreateInput) {
  try {
    await tx.equipmentUnit.create({ data });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", `Unit ${data.serialNumber} was recorded by another operation at the same time; check where it is and retry`, {
        serialNumber: data.serialNumber,
      });
    }
    throw error;
  }
}

/** The unit rows about to move must be distinct and as many as the balance change. */
function assertDistinctUnits(units: { id: string }[], input: MovementInput) {
  const distinct = new Set(units.map((u) => u.id)).size;
  // The import may move fewer rows than its quantity when a balance goes negative.
  const countMatches = units.length === input.quantity || (input.allowNegative && units.length < input.quantity);
  if (distinct !== units.length || !countMatches) {
    throw new AppError("CONFLICT", "The units selected do not match the quantity being moved; nothing was changed", {
      selectedUnits: units.length,
      distinctUnits: distinct,
      quantity: input.quantity,
    });
  }
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
