import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { transferStock } from "@/server/modules/inventory/inventory.service";
import { listRestockJobs, recalculateAllRestockJobs } from "@/server/modules/restocking/restock.service";
import { createProduct, deleteProduct, getProduct, listProducts, updateProduct } from "@/server/modules/products/products.service";
import { productInput, productRecordCounts, referenceMakers } from "../support/product-fixtures";
import { balance, createWorld, stockVan, type World } from "../support/world";

let w: World;
beforeEach(async () => {
  w = await createWorld();
});

const openLists = async () => listRestockJobs({ status: "OPEN" });
const line = async (vanCode: string, sku: string) =>
  (await openLists()).find((list) => list.van.code === vanCode)?.items.find((item) => item.sku === sku);
const totalStock = async () => (await prisma.stockBalance.aggregate({ _sum: { quantity: true } }))._sum.quantity ?? 0;

describe("creating, reading, editing and deleting an unused product", () => {
  it("goes through the whole life of a product", async () => {
    const created = await createProduct(productInput({ sku: "LBL-58", name: "Label roll", baseUnit: "roll", vanMinimum: 0 }));
    expect(created).toMatchObject({ sku: "LBL-58", name: "Label roll", baseUnit: "roll", restockPolicyNeedsReview: false, restockPolicyNote: null });
    expect((await listProducts()).map((p) => p.sku)).toContain("LBL-58");

    const detail = await getProduct(created.id);
    expect(detail.deletion).toEqual({ allowed: true, reason: null });
    expect(detail.locked).toEqual({ sku: null, baseUnit: null, serialised: null });

    const updated = await updateProduct(created.id, productInput({ sku: "LBL-60", name: "Label roll 60mm", baseUnit: "reel", serialised: true, vanMinimum: 2 }));
    expect(updated).toMatchObject({ id: created.id, sku: "LBL-60", baseUnit: "reel", serialised: true, vanMinimum: 2 });

    expect(await deleteProduct(created.id)).toEqual({ id: created.id, sku: "LBL-60", name: "Label roll 60mm" });
    expect(await prisma.product.findUnique({ where: { id: created.id } })).toBeNull();
    await expect(getProduct(created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates no stock, equipment or movements", async () => {
    const stockBefore = await totalStock();
    const created = await createProduct(productInput({ sku: "SER-01", serialised: true, vanMinimum: 3 }));

    expect(await productRecordCounts(created.id)).toMatchObject({ balances: 0, movements: 0, units: 0, reservations: 0, jobItems: 0 });
    expect(await totalStock()).toBe(stockBefore);
  });

  it("reports and deletes nothing for a product that does not exist", async () => {
    await expect(updateProduct("missing", productInput())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteProduct("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("SKU uniqueness", () => {
  it("canonicalises the SKU at the service boundary's schema and rejects a duplicate in any case", async () => {
    await createProduct(productInput({ sku: "ABC-1" }));
    await expect(createProduct(productInput({ sku: "ABC-1", name: "Other" }))).rejects.toMatchObject({
      code: "CONFLICT",
      details: { fieldErrors: { sku: [expect.stringContaining("ABC-1")] } },
    });
    expect(await prisma.product.count({ where: { sku: "ABC-1" } })).toBe(1);
  });

  it("refuses to rename onto another product's SKU and leaves the product as it was", async () => {
    const other = await createProduct(productInput({ sku: "TAKEN-1" }));
    const mine = await createProduct(productInput({ sku: "MINE-1", name: "Mine" }));

    await expect(updateProduct(mine.id, productInput({ sku: "TAKEN-1", name: "Renamed" }))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ sku: "MINE-1", name: "Mine" });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: other.id } })).sku).toBe("TAKEN-1");
  });

  it("lets only one of several simultaneous creations with the same SKU succeed", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => createProduct(productInput({ sku: "RACE-1", name: `Racer ${i}`, vanMinimum: i }))),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "CONFLICT", details: { fieldErrors: { sku: expect.any(Array) } } });
    }
    expect(await prisma.product.count({ where: { sku: "RACE-1" } })).toBe(1);
  });

  it("is enforced by the database: a lower-case, padded or malformed SKU cannot be stored", async () => {
    const insert = (sku: string) => prisma.product.create({ data: { sku, name: "Raw", serialised: false } });
    await expect(insert("prn-80")).rejects.toThrow();
    await expect(insert(" PRN-80")).rejects.toThrow();
    await expect(insert("PRN 80")).rejects.toThrow();
    await expect(insert("")).rejects.toThrow();
    // With canonical form enforced, the unique index is case-insensitive in effect.
    await insert("RAW-1");
    await expect(insert("RAW-1")).rejects.toThrow();
  });

  it("is enforced by the database: negative minimums and half-defined packs cannot be stored", async () => {
    const insert = (data: object) => prisma.product.create({ data: { sku: "CHK-1", name: "Raw", serialised: false, ...data } });
    await expect(insert({ vanMinimum: -1 })).rejects.toThrow();
    await expect(insert({ packUnit: "box" })).rejects.toThrow();
    await expect(insert({ packSize: 10 })).rejects.toThrow();
    await expect(insert({ packUnit: "box", packSize: 1 })).rejects.toThrow();
    await expect(insert({ packUnit: "box", packSize: 10 })).resolves.toBeTruthy();
  });
});

describe("editing a product that is in use", () => {
  beforeEach(async () => {
    await stockVan(w.north.locationId, w.paper.id, 120);
  });

  const edit = (overrides: Parameters<typeof productInput>[0]) =>
    updateProduct(w.paper.id, productInput({ sku: "PAP-80", name: "Paper", baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 100, ...overrides }));

  it("allows descriptive, pack and policy changes without touching stock", async () => {
    const before = await balance(w.north.locationId, w.paper.id);
    const saved = await edit({ name: "Thermal paper 80mm", packUnit: "carton", packSize: 100, vanMinimum: 150 });

    expect(saved).toMatchObject({ name: "Thermal paper 80mm", packUnit: "carton", packSize: 100, vanMinimum: 150, baseUnit: "roll" });
    expect(await balance(w.north.locationId, w.paper.id)).toBe(before);
  });

  it.each([
    ["sku", { sku: "PAP-81" }],
    ["baseUnit", { baseUnit: "each", packUnit: null, packSize: null }],
    ["serialised", { serialised: true }],
  ])("refuses to change %s and saves nothing, even alongside safe changes", async (field, change) => {
    const before = await prisma.product.findUniqueOrThrow({ where: { id: w.paper.id } });

    await expect(edit({ name: "Should not be saved", vanMinimum: 999, ...change })).rejects.toMatchObject({
      code: "INVALID_STATE",
      details: { fieldErrors: { [field]: [expect.stringMatching(/stock balance|movement/)] } },
    });
    expect(await prisma.product.findUniqueOrThrow({ where: { id: w.paper.id } })).toEqual(before);
  });

  it("explains which fields are locked, and why, in the product detail", async () => {
    const detail = await getProduct(w.paper.id);
    expect(detail.references).toMatchObject({ stockBalances: 1, stockMovements: 1 });
    expect(detail.locked.baseUnit).toContain("rolls");
    expect(detail.locked.sku).toContain("PAP-80");
    expect(detail.deletion.allowed).toBe(false);
  });

  it("accepts a save that leaves the locked fields as they are", async () => {
    await expect(edit({})).resolves.toMatchObject({ sku: "PAP-80", baseUnit: "roll" });
  });

  it("keeps a unit change locked when only history refers to the product", async () => {
    const lonely = await createProduct(productInput({ sku: "HIST-1" }));
    await referenceMakers["a stock movement"](w, lonely.id);

    await expect(updateProduct(lonely.id, productInput({ sku: "HIST-1", baseUnit: "metre" }))).rejects.toMatchObject({
      code: "INVALID_STATE",
      details: { fieldErrors: { baseUnit: [expect.any(String)] } },
    });
  });

  it("locks serial tracking for a serialised product with units", async () => {
    await stockVan(w.north.locationId, w.printer.id, 2, { serials: ["P-1", "P-2"] });
    await expect(
      updateProduct(w.printer.id, productInput({ sku: "PRN-80", name: "Receipt printer", serialised: false, vanMinimum: 3 })),
    ).rejects.toMatchObject({ details: { fieldErrors: { serialised: [expect.stringContaining("switched off")] } } });
    expect(await prisma.equipmentUnit.count({ where: { productId: w.printer.id } })).toBe(2);
  });
});

describe("restock pick lists after a policy change", () => {
  beforeEach(async () => {
    await stockVan(w.north.locationId, w.cable.id, 4); // minimum 10
    await stockVan(w.south.locationId, w.cable.id, 10); // at minimum
    await recalculateAllRestockJobs();
  });

  const editCable = (overrides: Parameters<typeof productInput>[0]) =>
    updateProduct(w.cable.id, productInput({ sku: "CBL-ETH", name: "Ethernet cable", vanMinimum: 10, ...overrides }));

  it("recalculates every van when the minimum rises or falls", async () => {
    expect((await line("V-N", "CBL-ETH"))?.outstanding).toBe(6);
    expect(await line("V-S", "CBL-ETH")).toBeUndefined();

    await editCable({ vanMinimum: 15 });
    expect((await line("V-N", "CBL-ETH"))?.outstanding).toBe(11);
    expect((await line("V-S", "CBL-ETH"))?.outstanding).toBe(5);

    await editCable({ vanMinimum: 2 });
    expect(await line("V-N", "CBL-ETH")).toBeUndefined();
    expect(await line("V-S", "CBL-ETH")).toBeUndefined();
    expect(await balance(w.north.locationId, w.cable.id)).toBe(4);
  });

  it("removes the product from pick lists when automatic restocking is switched off, and restores it when on", async () => {
    await editCable({ autoRestock: false });
    expect(await line("V-N", "CBL-ETH")).toBeUndefined();

    await editCable({ autoRestock: true });
    expect((await line("V-N", "CBL-ETH"))?.outstanding).toBe(6);
  });

  it("keeps quantities already collected on a pick list line", async () => {
    const list = await prisma.restockJob.findFirstOrThrow({ where: { vanId: w.north.id, status: "OPEN" } });
    await prisma.restockItem.update({
      where: { restockJobId_productId: { restockJobId: list.id, productId: w.cable.id } },
      data: { collectedQuantity: 3 },
    });

    await editCable({ autoRestock: false });
    const item = await prisma.restockItem.findUniqueOrThrow({ where: { restockJobId_productId: { restockJobId: list.id, productId: w.cable.id } } });
    expect(item).toMatchObject({ outstandingQuantity: 0, collectedQuantity: 3 });
  });

  it("does not recalculate for a change that does not affect policy", async () => {
    const before = await prisma.restockItem.findMany({ orderBy: { id: "asc" } });
    await editCable({ name: "Cat6 cable" });
    expect(await prisma.restockItem.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("shows a newly created product on lists of vans below its minimum, without creating stock", async () => {
    const created = await createProduct(productInput({ sku: "NEW-9", name: "Brand new", vanMinimum: 4 }));
    expect((await line("V-N", "NEW-9"))?.outstanding).toBe(4);
    expect((await line("V-S", "NEW-9"))?.outstanding).toBe(4);
    expect(await balance(w.north.locationId, created.id)).toBe(0);
    expect((await listRestockJobs({ status: "OPEN" })).some((l) => l.van.code === "V-G")).toBe(false);
  });

  it("keeps a flagged policy flagged, with its note, through any edit", async () => {
    await prisma.product.update({ where: { id: w.display.id }, data: { restockPolicyNote: "Hub says these ship direct." } });
    const saved = await updateProduct(w.display.id, productInput({ sku: "KDS-15", name: "Kitchen display 15in", serialised: true, vanMinimum: 2, autoRestock: true }));

    expect(saved).toMatchObject({ autoRestock: true, restockPolicyNeedsReview: true, restockPolicyNote: "Hub says these ship direct." });
  });

  it("is consistent with a stock movement made afterwards", async () => {
    await editCable({ vanMinimum: 12 });
    await transferStock({
      fromLocationId: w.south.locationId,
      toLocationId: w.north.locationId,
      productId: w.cable.id,
      quantity: 2,
      condition: "WORKING",
      performedBy: "Nadia",
    });
    expect((await line("V-N", "CBL-ETH"))?.outstanding).toBe(6);
  });
});

describe("deleting products", () => {
  it.each(Object.keys(referenceMakers))("is refused when the product has %s", async (kind) => {
    const product = await createProduct(productInput({ sku: "USED-1", autoRestock: false }));
    await referenceMakers[kind](w, product.id);
    const before = await productRecordCounts(product.id);

    await expect(deleteProduct(product.id)).rejects.toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("USED-1") });

    expect(await prisma.product.findUnique({ where: { id: product.id } })).not.toBeNull();
    expect(await productRecordCounts(product.id)).toEqual(before);
    expect((await getProduct(product.id)).deletion.allowed).toBe(false);
  });

  it("names every kind of record that blocks it", async () => {
    const product = await createProduct(productInput({ sku: "USED-2", autoRestock: false }));
    await referenceMakers["a stock movement"](w, product.id);
    await referenceMakers["a job line"](w, product.id);

    await expect(deleteProduct(product.id)).rejects.toMatchObject({
      message: expect.stringMatching(/1 stock movement and 1 job line/),
    });
  });

  it("never cascades: stock, jobs and movements of a used product survive a refused delete", async () => {
    await stockVan(w.north.locationId, w.cable.id, 5);
    const jobsBefore = await prisma.job.count();
    const movementsBefore = await prisma.stockMovement.count();

    await expect(deleteProduct(w.cable.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(5);
    expect(await prisma.stockMovement.count()).toBe(movementsBefore);
    expect(await prisma.job.count()).toBe(jobsBefore);
  });

  it("is backed by the database: a direct delete of a referenced product is refused", async () => {
    await stockVan(w.north.locationId, w.cable.id, 1);
    await expect(prisma.product.delete({ where: { id: w.cable.id } })).rejects.toMatchObject({ code: "P2003" });
  });

  it("removes open pick-list lines nothing was collected against, and refreshes the list", async () => {
    await stockVan(w.north.locationId, w.cable.id, 4);
    const created = await createProduct(productInput({ sku: "TMP-1", name: "Temporary", vanMinimum: 2 }));
    await recalculateAllRestockJobs();
    expect((await line("V-N", "TMP-1"))?.outstanding).toBe(2);

    await deleteProduct(created.id);

    expect(await line("V-N", "TMP-1")).toBeUndefined();
    expect((await line("V-N", "CBL-ETH"))?.outstanding).toBe(6);
  });

  it("closes a pick list that is left with nothing to collect", async () => {
    await prisma.product.updateMany({ data: { vanMinimum: 0 } });
    await recalculateAllRestockJobs();
    const created = await createProduct(productInput({ sku: "ONLY-1", vanMinimum: 2 }));
    expect((await openLists()).length).toBeGreaterThan(0);
    await deleteProduct(created.id);
    expect(await openLists()).toHaveLength(0);
  });
});
