import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runInTransaction } from "@/server/db/transaction";
import { moveStock } from "@/server/modules/inventory/stock-ledger";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import { updateVan } from "@/server/modules/fleet/fleet.service";
import { correctStock, getVanStock, transferStock } from "@/server/modules/inventory/inventory.service";
import { getJob } from "@/server/modules/jobs/jobs.service";
import { listRestockJobs } from "@/server/modules/restocking/restock.service";
import { correctStockRequest } from "@/lib/contracts/inventory";
import { balance, createWorld, newJob, stockVan, type World } from "../support/world";

let w: World;
beforeEach(async () => {
  w = await createWorld();
  await stockVan(w.north.locationId, w.cable.id, 12);
});

const transfer = (quantity: number, extra: Partial<Parameters<typeof transferStock>[0]> = {}) =>
  transferStock({
    fromLocationId: w.north.locationId,
    toLocationId: w.south.locationId,
    productId: w.cable.id,
    quantity,
    condition: "WORKING",
    performedBy: "Nadia",
    ...extra,
  });

describe("physical transfers", () => {
  it("records the source and destination together in one movement", async () => {
    const movement = await transfer(5);

    expect(movement).toMatchObject({ type: "TRANSFER", fromLocationId: w.north.locationId, toLocationId: w.south.locationId, quantity: 5 });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(7);
    expect(await balance(w.south.locationId, w.cable.id)).toBe(5);
    expect(await prisma.stockMovement.count({ where: { type: "TRANSFER" } })).toBe(1);
  });

  it("cannot create negative stock, and changes nothing when refused", async () => {
    await expect(transfer(13)).rejects.toMatchObject({ code: "NEGATIVE_STOCK" });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(12);
    expect(await balance(w.south.locationId, w.cable.id)).toBe(0);
    expect(await prisma.stockMovement.count({ where: { type: "TRANSFER" } })).toBe(0);
  });

  it("cannot move stock reserved for an assigned job", async () => {
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 10 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    await expect(transfer(5)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(transfer(2)).resolves.toMatchObject({ quantity: 2 });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
  });

  it("moves serialised units with their serial numbers", async () => {
    await stockVan(w.north.locationId, w.printer.id, 2, { serials: ["P-1", "P-2"] });
    await transfer(1, { productId: w.printer.id, serials: ["P-2"] });

    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "P-2" } })).toMatchObject({
      locationId: w.south.locationId,
      status: "IN_STOCK",
    });
    expect(await balance(w.south.locationId, w.printer.id)).toBe(1);
  });
});

describe("serial numbers on stock movements", () => {
  const printers = async () =>
    prisma.equipmentUnit.findMany({ where: { productId: w.printer.id }, orderBy: { serialNumber: "asc" } });

  beforeEach(async () => {
    await stockVan(w.north.locationId, w.printer.id, 2, { serials: ["P-1", "P-2"] });
  });

  it("rejects a serial listed twice and changes nothing", async () => {
    const unitsBefore = await printers();

    await expect(transfer(2, { productId: w.printer.id, serials: ["P-1", "P-1"] })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { duplicateSerials: ["P-1"] },
    });

    expect(await balance(w.north.locationId, w.printer.id)).toBe(2);
    expect(await balance(w.south.locationId, w.printer.id)).toBe(0);
    expect(await printers()).toEqual(unitsBefore);
    expect(await prisma.stockMovement.count({ where: { type: "TRANSFER" } })).toBe(0);
  });

  it("moves two distinct devices", async () => {
    const movement = await transfer(2, { productId: w.printer.id, serials: ["P-1", "P-2"] });

    expect(movement.serials.sort()).toEqual(["P-1", "P-2"]);
    expect(await balance(w.north.locationId, w.printer.id)).toBe(0);
    expect(await balance(w.south.locationId, w.printer.id)).toBe(2);
    expect((await printers()).map((u) => u.locationId)).toEqual([w.south.locationId, w.south.locationId]);
  });

  it("rejects fewer serials than units leaving a van, and changes nothing", async () => {
    await expect(transfer(2, { productId: w.printer.id, serials: ["P-1"] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    expect(await balance(w.north.locationId, w.printer.id)).toBe(2);
    expect((await printers()).every((u) => u.locationId === w.north.locationId)).toBe(true);
  });

  it("protects every caller: duplicates arriving from the hub are rejected too", async () => {
    const arrive = runInTransaction((tx) =>
      moveStock(tx, {
        type: "RESTOCK_COLLECTION",
        productId: w.printer.id,
        condition: "WORKING",
        quantity: 2,
        from: { locationId: w.hub.id },
        to: { locationId: w.south.locationId },
        serials: ["NEW-1", "NEW-1"],
        performedBy: "Daniel",
      }),
    );

    await expect(arrive).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await balance(w.south.locationId, w.printer.id)).toBe(0);
    expect(await prisma.equipmentUnit.count({ where: { serialNumber: "NEW-1" } })).toBe(0);
    expect(await prisma.stockMovement.count({ where: { type: "RESTOCK_COLLECTION" } })).toBe(0);
  });
});

describe("stock corrections", () => {
  it("keeps who corrected the count, when, the previous and corrected values, and why", async () => {
    const correction = await correctStock({
      locationId: w.north.locationId,
      productId: w.cable.id,
      condition: "WORKING",
      countedQuantity: 9,
      reason: "Monday count: three cables missing",
      correctedBy: "Daniel",
    });

    expect(correction).toMatchObject({ previousQuantity: 12, correctedQuantity: 9, correctedBy: "Daniel", reason: "Monday count: three cables missing" });
    expect(correction.correctedAt).toBeTruthy();
    expect(await balance(w.north.locationId, w.cable.id)).toBe(9);
    expect(await prisma.stockMovement.findFirst({ where: { correctionId: correction.id } })).toMatchObject({
      type: "CORRECTION",
      quantity: 3,
      fromLocationId: w.north.locationId,
    });
  });

  it("requires a reason", () => {
    const body = { locationId: "x", productId: "y", condition: "WORKING", countedQuantity: 1, reason: "", correctedBy: "Daniel" };
    expect(correctStockRequest.safeParse(body).success).toBe(false);
  });

  it("can bring an imported negative balance back to a real count", async () => {
    await prisma.stockBalance.update({
      where: { locationId_productId_condition: { locationId: w.north.locationId, productId: w.cable.id, condition: "WORKING" } },
      data: { quantity: -2 },
    });
    const correction = await correctStock({
      locationId: w.north.locationId,
      productId: w.cable.id,
      condition: "WORKING",
      countedQuantity: 4,
      reason: "Counted after car-park transfer",
      correctedBy: "Noor",
    });
    expect(correction.previousQuantity).toBe(-2);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(4);
  });
});

describe("correcting serialised counts", () => {
  /** What the import does when the book says -2: a negative balance with no unit rows behind it. */
  const importNegativePrinters = (quantity: number) =>
    runInTransaction((tx) =>
      moveStock(tx, {
        type: "OPENING_BALANCE",
        productId: w.printer.id,
        condition: "WORKING",
        quantity,
        from: { locationId: w.north.locationId },
        allowNegative: true,
        performedBy: "stock-book import",
      }),
    );
  const count = (countedQuantity: number) =>
    correctStock({
      locationId: w.north.locationId,
      productId: w.printer.id,
      condition: "WORKING",
      countedQuantity,
      reason: "Monday count",
      correctedBy: "Daniel",
    });
  const unitsHere = () =>
    prisma.equipmentUnit.findMany({
      where: { productId: w.printer.id, locationId: w.north.locationId, status: "IN_STOCK" },
      orderBy: [{ serialNumber: "asc" }, { createdAt: "asc" }],
    });
  const printerLine = async () => (await getVanStock(w.north.id)).lines.find((l) => l.productId === w.printer.id)!;

  it("corrects -2 to a count of 4 with four unit records, not six", async () => {
    await importNegativePrinters(2);

    const correction = await count(4);

    expect(correction).toMatchObject({ previousQuantity: -2, correctedQuantity: 4, correctedBy: "Daniel", reason: "Monday count" });
    expect(await balance(w.north.locationId, w.printer.id)).toBe(4);
    const units = await unitsHere();
    expect(units).toHaveLength(4);
    expect(units.every((u) => u.serialNumber === null && u.verification === "NEEDS_VERIFICATION")).toBe(true);
    expect(await prisma.equipmentUnit.count({ where: { productId: w.printer.id } })).toBe(4);
    // Unverified units stay visible but cannot be assigned.
    expect(await printerLine()).toMatchObject({ working: 4, needsVerification: 4, available: 0 });
    // History still adds up: the movement is the balance change.
    expect(await prisma.stockMovement.findFirst({ where: { correctionId: correction.id } })).toMatchObject({
      type: "CORRECTION",
      quantity: 6,
      toLocationId: w.north.locationId,
    });
  });

  it("corrects -2 to zero without creating any units", async () => {
    await importNegativePrinters(2);

    const correction = await count(0);

    expect(await balance(w.north.locationId, w.printer.id)).toBe(0);
    expect(await prisma.equipmentUnit.count({ where: { productId: w.printer.id } })).toBe(0);
    expect(await prisma.stockMovement.findFirst({ where: { correctionId: correction.id } })).toMatchObject({ quantity: 2 });
  });

  it("keeps existing units and serials when the count goes up or down", async () => {
    await stockVan(w.north.locationId, w.printer.id, 2, { serials: ["P-1", "P-2"] });
    await stockVan(w.north.locationId, w.printer.id, 1); // counted, no serial yet
    const before = await unitsHere();

    await count(5);
    const raised = await unitsHere();
    expect(await balance(w.north.locationId, w.printer.id)).toBe(5);
    expect(raised).toHaveLength(5);
    for (const unit of before) expect(raised).toContainEqual(unit);

    await count(2);
    const lowered = await unitsHere();
    expect(await balance(w.north.locationId, w.printer.id)).toBe(2);
    expect(lowered.map((u) => [u.serialNumber, u.verification, u.condition])).toEqual([
      ["P-1", "VERIFIED", "WORKING"],
      ["P-2", "VERIFIED", "WORKING"],
    ]);
    expect(lowered.map((u) => u.id)).toEqual(before.filter((u) => u.serialNumber).map((u) => u.id));
  });

  it("refuses a count below the units with recorded serials, and changes nothing", async () => {
    await stockVan(w.north.locationId, w.printer.id, 2, { serials: ["P-1", "P-2"] });
    const before = await unitsHere();

    await expect(count(1)).rejects.toMatchObject({ code: "CONFLICT", details: { serials: expect.arrayContaining(["P-1", "P-2"]) } });

    expect(await balance(w.north.locationId, w.printer.id)).toBe(2);
    expect(await unitsHere()).toEqual(before);
    expect(await prisma.stockCorrection.count()).toBe(0);
    expect(await prisma.stockMovement.count({ where: { type: "CORRECTION" } })).toBe(0);
  });
});

describe("fleet changes", () => {
  it("changing a van's driver does not move its equipment", async () => {
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 2 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    await updateVan(w.north.id, { technicianId: w.spare.id, updatedBy: "Faris" });

    expect(await balance(w.north.locationId, w.cable.id)).toBe(12);
    expect(await prisma.stockMovement.count({ where: { type: "TRANSFER" } })).toBe(0);
    expect((await getJob(job.id)).technician?.name).toBe("Tariq");
  });

  it("a van with assigned jobs cannot go to the garage until they are reassigned", async () => {
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 2 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    await expect(updateVan(w.north.id, { status: "GARAGE", updatedBy: "Faris" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("kitchen displays", () => {
  it("are recorded and assignable, but not restocked automatically", async () => {
    await stockVan(w.north.locationId, w.display.id, 1, { serials: ["KDS-1"] });
    const job = await newJob(w, [{ productId: w.display.id, quantity: 1 }]);
    await expect(assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" })).resolves.toMatchObject({ status: "ASSIGNED" });

    await correctStock({
      locationId: w.south.locationId,
      productId: w.display.id,
      condition: "WORKING",
      countedQuantity: 0,
      reason: "Confirmed none on board",
      correctedBy: "Sam",
    });
    const lists = await listRestockJobs({ status: "OPEN" });
    expect(lists.flatMap((l) => l.items).some((i) => i.sku === "KDS-15")).toBe(false);
  });
});
