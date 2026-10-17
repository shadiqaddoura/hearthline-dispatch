import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createWarehouse } from "@/server/modules/inventory/warehouse.service";
import { deleteWarehouse } from "@/server/modules/inventory/warehouse-delete.service";
import { correctStock, getInventoryDetail, listInventoryLocations, receiveStock, transferStock } from "@/server/modules/inventory/inventory.service";
import { confirmRestockCollection, listRestockJobs, recalculateAllRestockJobs } from "@/server/modules/restocking/restock.service";
import { getHubLocation } from "@/server/modules/fleet/fleet.repository";
import { createWarehouseRequest } from "@/lib/contracts/inventory";
import { balance, createWorld, stockVan, type World } from "../support/world";

let w: World;
beforeEach(async () => { w = await createWorld(); });
const setup = (openingStock: { productId: string; quantity: number; condition: "WORKING" | "BROKEN" }[] = []) =>
  createWarehouse({ name: "Main warehouse", performedBy: "Nadia", note: "Physical opening count", openingStock });

describe("warehouse setup", () => {
  it("reuses the canonical location, preserves history and records opening stock through the ledger", async () => {
    await stockVan(w.north.locationId, w.cable.id, 3);
    const before = await prisma.stockMovement.findMany();
    const result = await setup([{ productId: w.cable.id, quantity: 12, condition: "WORKING" }, { productId: w.printer.id, quantity: 2, condition: "BROKEN" }]);
    expect(result.locationId).toBe(w.hub.id);
    expect(await balance(w.hub.id, w.cable.id)).toBe(12);
    expect(await balance(w.hub.id, w.printer.id, "BROKEN")).toBe(2);
    expect(await prisma.product.count()).toBe(4);
    for (const movement of before) expect(await prisma.stockMovement.findUnique({ where: { id: movement.id } })).toEqual(movement);
    const detail = await getInventoryDetail(w.hub.id, w.cable.id);
    expect(detail.movements).toEqual([expect.objectContaining({ type: "OPENING_BALANCE", fromLocationId: null, toLocationId: w.hub.id, quantity: 12, performedBy: "Nadia", note: "Physical opening count" })]);
    expect(await prisma.equipmentUnit.count({ where: { locationId: w.hub.id, status: "IN_STOCK", verification: "NEEDS_VERIFICATION", condition: "BROKEN" } })).toBe(2);
    expect(await getHubLocation(prisma)).toMatchObject({ id: w.hub.id, name: "Main warehouse" });
    expect((await listInventoryLocations()).find((l) => l.locationId === w.hub.id)).toMatchObject({ kind: "HUB", inventoryTracked: true });
  });

  it("creates a warehouse from scratch without inventing stock", async () => {
    await prisma.location.delete({ where: { id: w.hub.id } });
    const result = await setup();
    expect(await prisma.location.findUnique({ where: { id: result.locationId } })).toMatchObject({ kind: "HUB", inventoryTracked: true });
    expect(await prisma.stockBalance.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.equipmentUnit.count()).toBe(0);
  });

  it("zero quantities create no stock or movements", async () => {
    await setup([{ productId: w.printer.id, quantity: 0, condition: "WORKING" }]);
    expect(await prisma.stockBalance.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("rejects sequential and concurrent duplicate setup without double counting", async () => {
    const results = await Promise.allSettled([setup([{ productId: w.cable.id, quantity: 8, condition: "WORKING" }]), setup([{ productId: w.cable.id, quantity: 8, condition: "WORKING" }])]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    await expect(setup()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.location.count({ where: { kind: "HUB" } })).toBe(1);
    expect(await balance(w.hub.id, w.cable.id)).toBe(8);
    expect(await prisma.stockMovement.count()).toBe(1);
  });

  it("rolls back location setup and earlier opening lines if any product is invalid", async () => {
    await expect(setup([{ productId: w.cable.id, quantity: 8, condition: "WORKING" }, { productId: "missing", quantity: 1, condition: "WORKING" }])).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.location.findUnique({ where: { id: w.hub.id } })).toMatchObject({ name: w.hub.name, inventoryTracked: false });
    expect(await prisma.stockBalance.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it("rejects invalid quantities and duplicate product/condition input", () => {
    const base = { name: "Warehouse", performedBy: "Nadia", note: "Counted" };
    for (const quantity of [-1, 1.5, 100001]) expect(createWarehouseRequest.safeParse({ ...base, openingStock: [{ productId: "x", quantity }] }).success).toBe(false);
    expect(createWarehouseRequest.safeParse({ ...base, openingStock: [{ productId: "x", quantity: 1 }, { productId: "x", quantity: 2 }] }).success).toBe(false);
  });

  it("preserves returned serial identities during setup", async () => {
    await stockVan(w.north.locationId, w.printer.id, 1, { serials: ["RETURNED"] });
    await transferStock({ fromLocationId: w.north.locationId, toLocationId: w.hub.id, productId: w.printer.id, quantity: 1, condition: "WORKING", performedBy: "Nadia" });
    const before = await prisma.equipmentUnit.findUniqueOrThrow({ where: { serialNumber: "RETURNED" } });
    await setup([{ productId: w.printer.id, quantity: 2, condition: "WORKING" }]);
    expect(await prisma.equipmentUnit.findUnique({ where: { id: before.id } })).toMatchObject({ serialNumber: "RETURNED", locationId: w.hub.id, status: "IN_STOCK" });
    expect(await prisma.equipmentUnit.count({ where: { locationId: w.hub.id, status: "IN_STOCK" } })).toBe(2);
  });

  it("adopts returned unidentified devices without duplicating them", async () => {
    await stockVan(w.north.locationId, w.printer.id, 1);
    await transferStock({ fromLocationId: w.north.locationId, toLocationId: w.hub.id, productId: w.printer.id, quantity: 1, condition: "WORKING", performedBy: "Nadia" });
    const before = await prisma.equipmentUnit.findFirstOrThrow({ where: { locationId: w.hub.id } });
    await setup([{ productId: w.printer.id, quantity: 1, condition: "WORKING" }]);
    expect(await prisma.equipmentUnit.count()).toBe(1);
    expect(await prisma.equipmentUnit.findUnique({ where: { id: before.id } })).toMatchObject({ locationId: w.hub.id, status: "IN_STOCK", verification: "NEEDS_VERIFICATION" });
  });

  it("uses the same configured warehouse for restock collections and broken returns", async () => {
    await stockVan(w.north.locationId, w.printer.id, 1, { serials: ["BROKEN"], condition: "BROKEN" });
    await setup([{ productId: w.cable.id, quantity: 5, condition: "WORKING" }]);
    await recalculateAllRestockJobs();
    const job = (await listRestockJobs({ status: "OPEN" })).find((job) => job.van.id === w.north.id)!;
    await confirmRestockCollection(job.id, { collectedBy: "Nadia", collected: [{ productId: w.cable.id, quantity: 2 }], brokenReturned: [{ productId: w.printer.id, quantity: 1, serials: ["BROKEN"] }] });
    expect(await balance(w.hub.id, w.cable.id)).toBe(3);
    expect(await balance(w.hub.id, w.printer.id, "BROKEN")).toBe(1);
    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "BROKEN" } })).toMatchObject({ locationId: w.hub.id, status: "IN_STOCK" });
    expect(await prisma.location.count({ where: { kind: "HUB" } })).toBe(1);
  });

  it("debits configured warehouse receipts, rejects shortages and supports audited corrections", async () => {
    await setup([{ productId: w.cable.id, quantity: 5, condition: "WORKING" }]);
    const input = { operationKey: crypto.randomUUID(), locationId: w.north.locationId, productId: w.cable.id, quantity: 3, condition: "WORKING" as const, performedBy: "Nadia", note: "Collected" };
    await receiveStock(input);
    await receiveStock(input);
    expect(await balance(w.hub.id, w.cable.id)).toBe(2);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(3);
    await expect(receiveStock({ ...input, operationKey: crypto.randomUUID() })).rejects.toMatchObject({ code: "NEGATIVE_STOCK" });
    await correctStock({ locationId: w.hub.id, productId: w.cable.id, condition: "WORKING", countedQuantity: 4, correctedBy: "Nadia", reason: "Recounted shelf" });
    expect(await balance(w.hub.id, w.cable.id)).toBe(4);
  });
});

describe("warehouse deletion safety", () => {
  it("deletes an unused warehouse location", async () => {
    await expect(deleteWarehouse(w.hub.id)).resolves.toEqual({ locationId: w.hub.id });
    expect(await prisma.location.findUnique({ where: { id: w.hub.id } })).toBeNull();
  });

  it("retains a warehouse with zero stock and dependent ledger history", async () => {
    await setup([{ productId: w.cable.id, quantity: 4, condition: "WORKING" }]);
    await correctStock({ locationId: w.hub.id, productId: w.cable.id, condition: "WORKING", countedQuantity: 0, correctedBy: "Nadia", reason: "Shelf is empty" });
    const movementCount = await prisma.stockMovement.count({ where: { OR: [{ fromLocationId: w.hub.id }, { toLocationId: w.hub.id }] } });
    expect(await balance(w.hub.id, w.cable.id)).toBe(0);

    await expect(deleteWarehouse(w.hub.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: expect.stringContaining("stock movements"),
    });
    expect(await prisma.location.findUnique({ where: { id: w.hub.id } })).not.toBeNull();
    expect(await prisma.stockMovement.count({ where: { OR: [{ fromLocationId: w.hub.id }, { toLocationId: w.hub.id }] } })).toBe(movementCount);
    expect(await balance(w.hub.id, w.cable.id)).toBe(0);
  });
});
