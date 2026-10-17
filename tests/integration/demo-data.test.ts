import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { clearDemoSection, demoDataOverview, seedDemoSection } from "@/server/modules/settings/demo-data.service";
import { runInTransaction, lockLocations } from "@/server/db/transaction";
import { moveStock } from "@/server/modules/inventory/stock-ledger";
import { resetDatabase } from "../support/world";

const actor = "Demo Test <demo@example.test> [test-user]";

beforeEach(resetDatabase);

async function primaryCount(section: "PRODUCTS" | "CUSTOMERS" | "FLEET" | "INVENTORY" | "DISPATCH" | "RESTOCKING", entityType: string) {
  return prisma.demoRecord.count({ where: { entityType: entityType as never, claims: { some: { section, kind: "PRIMARY" } } } });
}

describe("Settings demo data", () => {
  it("seeds each section idempotently without duplicate records", async () => {
    for (const section of ["PRODUCTS", "CUSTOMERS", "FLEET", "INVENTORY", "DISPATCH", "RESTOCKING"] as const) {
      await seedDemoSection(section, actor);
      const firstRecords = await prisma.demoRecord.count();
      const firstClaims = await prisma.demoRecordClaim.count();
      await seedDemoSection(section, actor);
      expect(await prisma.demoRecord.count()).toBe(firstRecords);
      expect(await prisma.demoRecordClaim.count()).toBe(firstClaims);
    }
    for (const [section, type, expected] of [
      ["PRODUCTS", "PRODUCT", 10], ["CUSTOMERS", "CUSTOMER", 10], ["CUSTOMERS", "BRANCH", 20],
      ["FLEET", "VAN", 10], ["FLEET", "TECHNICIAN", 10], ["FLEET", "LOCATION", 10],
      ["INVENTORY", "STOCK_BALANCE", 10], ["DISPATCH", "JOB", 10], ["DISPATCH", "JOB_ITEM", 10],
      ["RESTOCKING", "RESTOCK_JOB", 10], ["RESTOCKING", "RESTOCK_ITEM", 10],
    ] as const) expect(await primaryCount(section, type)).toBe(expected);
    expect(await prisma.product.count()).toBe(10);
    expect(await prisma.customer.count()).toBe(10);
    expect(await prisma.branch.count()).toBe(20);
    expect(await prisma.van.count()).toBe(10);
    expect(await prisma.technician.count()).toBe(10);
    expect((await prisma.customer.findMany({ include: { branches: true } })).every((customer) => customer.branches.length === 2)).toBe(true);
    expect((await prisma.van.findMany({ include: { currentTechnician: true, location: true } })).every((van) => van.currentTechnician !== null && van.location.kind === "VAN")).toBe(true);
    expect((await prisma.job.findMany({ include: { branch: true, items: { include: { product: true } } } })).every((job) => job.branch.customerId && job.items.length === 1 && job.items[0].product.name.length > 0)).toBe(true);
    expect((await prisma.restockJob.findMany({ include: { van: true, items: { include: { product: true } } } })).every((job) => job.van.currentTechnicianId && job.items.length === 1 && job.items[0].outstandingQuantity > 0)).toBe(true);
    expect(await prisma.job.count({ where: { reference: { startsWith: "REQ-2026-10" } } })).toBe(10);
    expect(await prisma.stockMovement.count({ where: { type: "OPENING_BALANCE", toLocationId: { not: null } } })).toBe(10);
    expect(await prisma.stockMovement.count({ where: { operationKey: "demo:inventory:paper:opening:v1" } })).toBe(1);
    const balances = await prisma.stockBalance.findMany();
    expect(balances).toHaveLength(10);
    expect(balances.reduce((sum, balance) => sum + balance.quantity, 0)).toBe(180);
    expect(new Set(balances.map((balance) => balance.locationId)).size).toBe(10);
    expect(new Set(balances.map((balance) => balance.productId)).size).toBe(10);
    const seededPreview = await demoDataOverview();
    expect(seededPreview.sections.map((section) => section.section)).toEqual([
      "PRODUCTS", "CUSTOMERS", "FLEET", "INVENTORY", "DISPATCH", "RESTOCKING",
    ]);
    expect(seededPreview.sections.flatMap((section) => section.seedPlan).every((item) => item.willAdd === 0)).toBe(true);
    expect(seededPreview.sections.flatMap((section) => section.seedPlan).map((item) => item.resultingTotal)).toEqual([10, 10, 20, 10, 10, 10, 10, 10, 10, 10, 10]);
    expect(await prisma.product.findUnique({ where: { sku: "THERMAL-PAPER-80" } })).toMatchObject({ name: "Thermal Paper Rolls" });
    expect(await prisma.product.findUnique({ where: { sku: "ETHERNET-CAT6" } })).toMatchObject({ name: "Cat6 Ethernet Cable" });
    expect(await prisma.customer.findUnique({ where: { name: "Juniper Table Group" } })).not.toBeNull();
    expect(await prisma.van.findUnique({ where: { code: "V-12" } })).not.toBeNull();
    const businessValues = [
      ...(await prisma.product.findMany({ select: { sku: true, name: true } })).flatMap((row) => [row.sku, row.name]),
      ...(await prisma.customer.findMany({ select: { name: true } })).map((row) => row.name),
      ...(await prisma.branch.findMany({ select: { name: true } })).map((row) => row.name),
      ...(await prisma.van.findMany({ select: { code: true, plate: true } })).flatMap((row) => [row.code, row.plate ?? ""]),
      ...(await prisma.technician.findMany({ select: { name: true } })).map((row) => row.name),
      ...(await prisma.location.findMany({ select: { name: true } })).map((row) => row.name),
      ...(await prisma.job.findMany({ select: { reference: true, notes: true } })).flatMap((row) => [row.reference, row.notes ?? ""]),
      ...(await prisma.stockMovement.findMany({ select: { note: true } })).map((row) => row.note ?? ""),
    ];
    expect(businessValues.join(" ")).not.toMatch(/\bdemo\b/i);
  });

  it("shows and fills only the missing primary records in a partially seeded section", async () => {
    await seedDemoSection("PRODUCTS", actor);
    const removeKeys = ["product.catalog.07", "product.catalog.08", "product.catalog.09", "product.catalog.10"];
    const remove = await prisma.demoRecord.findMany({ where: { fixtureKey: { in: removeKeys } } });
    const ids = remove.map((record) => record.entityId);
    await prisma.demoRecordClaim.deleteMany({ where: { recordId: { in: remove.map((record) => record.id) } } });
    await prisma.demoRecord.deleteMany({ where: { id: { in: remove.map((record) => record.id) } } });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    const before = (await demoDataOverview()).sections.find((section) => section.section === "PRODUCTS")!;
    expect(before.seedPlan).toEqual([{ category: "Products", willAdd: 4, resultingTotal: 10 }]);

    await seedDemoSection("PRODUCTS", actor);
    await seedDemoSection("PRODUCTS", actor);

    expect(await primaryCount("PRODUCTS", "PRODUCT")).toBe(10);
    expect(await prisma.product.count()).toBe(10);
    expect((await demoDataOverview()).sections.find((section) => section.section === "PRODUCTS")?.seedPlan).toEqual([{ category: "Products", willAdd: 0, resultingTotal: 10 }]);
  });

  it("previews declared dependencies and does not seed unrelated domains", async () => {
    const initial = await demoDataOverview();
    const inventory = initial.sections.find((section) => section.section === "INVENTORY")!;
    const dispatch = initial.sections.find((section) => section.section === "DISPATCH")!;
    expect(inventory.seedPlan).toEqual([{ category: "Stock balances", willAdd: 10, resultingTotal: 10 }]);
    expect(inventory.dependencyAdditions).toEqual([
      { category: "Products", count: 10 }, { category: "Vans", count: 10 },
      { category: "Technicians", count: 10 }, { category: "Locations", count: 10 },
    ]);
    expect(dispatch.dependencyAdditions).toEqual([
      { category: "Products", count: 10 }, { category: "Customers", count: 10 }, { category: "Branches", count: 20 },
    ]);

    await seedDemoSection("INVENTORY", actor);
    expect(await prisma.product.count()).toBe(10);
    expect(await prisma.van.count()).toBe(10);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
    expect(await prisma.restockJob.count()).toBe(0);

    await seedDemoSection("DISPATCH", actor);
    expect(await prisma.customer.count()).toBe(10);
    expect(await prisma.branch.count()).toBe(20);
    expect(await prisma.job.count()).toBe(10);
    expect(await prisma.restockJob.count()).toBe(0);
  });

  it("restores a missing tracked product in place without replacing provenance or touching real records", async () => {
    const marker = await prisma.demoRecord.create({ data: { fixtureKey: "product.paper", entityType: "PRODUCT", entityId: "missing-product", label: "Thermal Paper Rolls" } });
    await prisma.demoRecordClaim.create({ data: { recordId: marker.id, section: "PRODUCTS", kind: "PRIMARY" } });
    const real = await prisma.product.create({ data: { sku: "REAL-KEEP", name: "Real product", serialised: false } });

    const preview = (await demoDataOverview()).sections.find((section) => section.section === "PRODUCTS")!;
    expect(preview.seedBlockers).toEqual([]);
    expect(preview.seedPlan).toEqual([{ category: "Products", willAdd: 10, resultingTotal: 10 }]);

    await seedDemoSection("PRODUCTS", actor);

    const repaired = await prisma.demoRecord.findUniqueOrThrow({ where: { id: marker.id }, include: { claims: true } });
    expect(repaired.entityId).not.toBe("missing-product");
    expect(repaired.claims).toHaveLength(1);
    expect(await prisma.product.findUnique({ where: { id: repaired.entityId } })).toMatchObject({ sku: "THERMAL-PAPER-80", name: "Thermal Paper Rolls" });
    expect(await prisma.product.findUnique({ where: { id: real.id } })).toMatchObject({ sku: "REAL-KEEP", name: "Real product" });
    expect(await primaryCount("PRODUCTS", "PRODUCT")).toBe(10);
  });

  it("preserves existing tracked and untracked product values when filling to ten", async () => {
    await seedDemoSection("PRODUCTS", actor);
    const paper = await prisma.product.findUniqueOrThrow({ where: { sku: "THERMAL-PAPER-80" } });
    const other = await prisma.product.create({ data: { sku: "REAL-KEEP", name: "Real product", serialised: false } });
    await prisma.product.update({ where: { id: paper.id }, data: { sku: "THERMAL-PAPER-CUSTOM", name: "Premium Thermal Paper" } });

    await seedDemoSection("PRODUCTS", actor);

    expect(await prisma.product.findUnique({ where: { id: paper.id } })).toMatchObject({ sku: "THERMAL-PAPER-CUSTOM", name: "Premium Thermal Paper" });
    expect(await prisma.product.findUnique({ where: { id: other.id } })).toMatchObject({ sku: "REAL-KEEP", name: "Real product" });
  });

  it("tracks dependencies by section and preserves a shared product during selective clear", async () => {
    await seedDemoSection("INVENTORY", actor);
    await seedDemoSection("PRODUCTS", actor);
    const paperRecord = await prisma.demoRecord.findUniqueOrThrow({ where: { fixtureKey: "product.paper" }, include: { claims: true } });
    expect(new Set(paperRecord.claims.map((claim) => claim.section))).toEqual(new Set(["INVENTORY", "PRODUCTS"]));

    await clearDemoSection("INVENTORY");

    expect(await prisma.product.findUnique({ where: { id: paperRecord.entityId } })).not.toBeNull();
    expect(await prisma.van.findUnique({ where: { code: "V-12" } })).toBeNull();
    expect(await prisma.stockMovement.findUnique({ where: { operationKey: "demo:inventory:paper:opening:v1" } })).toBeNull();
    expect((await demoDataOverview()).sections.find((section) => section.section === "PRODUCTS")?.seeded.length).toBeGreaterThan(0);
  });

  it("clears only provenance-tracked products and preserves unrelated real records", async () => {
    const real = await prisma.product.create({ data: { sku: "REAL-KEEP", name: "Real product", serialised: false } });
    const imported = await prisma.importBatch.create({ data: { fileName: "existing-import.xlsx", summary: { rows: 12 } } });
    await seedDemoSection("PRODUCTS", actor);

    await clearDemoSection("PRODUCTS");

    expect(await prisma.product.findUnique({ where: { id: real.id } })).toMatchObject({ name: "Real product" });
    expect(await prisma.importBatch.findUnique({ where: { id: imported.id } })).toMatchObject({ fileName: "existing-import.xlsx" });
    expect(await prisma.product.findUnique({ where: { sku: "THERMAL-PAPER-80" } })).toBeNull();
    expect(await prisma.product.findUnique({ where: { sku: "ETHERNET-CAT6" } })).toBeNull();
    expect(await prisma.demoRecord.count()).toBe(0);
  });

  it("selectively clears all ten-record sections in dependency order", async () => {
    for (const section of ["PRODUCTS", "CUSTOMERS", "FLEET", "INVENTORY", "DISPATCH", "RESTOCKING"] as const) await seedDemoSection(section, actor);
    const real = await prisma.product.create({ data: { sku: "REAL-KEEP", name: "Real product", serialised: false } });

    for (const section of ["RESTOCKING", "DISPATCH", "INVENTORY", "FLEET", "CUSTOMERS", "PRODUCTS"] as const) await clearDemoSection(section);

    expect(await prisma.demoRecord.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.product.findMany()).toEqual([expect.objectContaining({ id: real.id, sku: "REAL-KEEP" })]);
    expect(await prisma.van.count()).toBe(0);
    expect(await prisma.technician.count()).toBe(0);
    expect(await prisma.location.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
    expect(await prisma.restockJob.count()).toBe(0);
  });

  it("blocks clearing changed demo stock and preserves its non-demo movement history", async () => {
    await seedDemoSection("INVENTORY", actor);
    const van = await prisma.van.findUniqueOrThrow({ where: { code: "V-12" } });
    const product = await prisma.product.findUniqueOrThrow({ where: { sku: "THERMAL-PAPER-80" } });
    await runInTransaction(async (tx) => {
      await lockLocations(tx, [van.locationId]);
      await moveStock(tx, { type: "OPENING_BALANCE", productId: product.id, condition: "WORKING", quantity: 2, to: { locationId: van.locationId }, performedBy: "real operator", note: "Operational count received outside demo settings" });
    });

    await expect(clearDemoSection("INVENTORY")).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: expect.stringContaining("non-demo movement history"),
    });
    expect(await prisma.stockMovement.count({ where: { productId: product.id } })).toBe(2);
    expect(await prisma.stockBalance.findUnique({ where: { locationId_productId_condition: { locationId: van.locationId, productId: product.id, condition: "WORKING" } } })).toMatchObject({ quantity: 27 });
    expect(await prisma.demoRecord.findUnique({ where: { fixtureKey: "inventory.paper.balance" } })).not.toBeNull();
  });
});
