import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { clearDemoSection, demoDataOverview, seedDemoSection } from "@/server/modules/settings/demo-data.service";
import { runInTransaction, lockLocations } from "@/server/db/transaction";
import { moveStock } from "@/server/modules/inventory/stock-ledger";
import { resetDatabase } from "../support/world";

const actor = "Demo Test <demo@example.test> [test-user]";

beforeEach(resetDatabase);

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
    expect(await prisma.stockMovement.count({ where: { operationKey: "demo:inventory:paper:opening:v1" } })).toBe(1);
    expect(await prisma.job.count({ where: { reference: "DEMO-REQ-001" } })).toBe(1);
    expect((await demoDataOverview()).sections.map((section) => section.section)).toEqual([
      "PRODUCTS", "CUSTOMERS", "FLEET", "INVENTORY", "DISPATCH", "RESTOCKING",
    ]);
  });

  it("tracks dependencies by section and preserves a shared product during selective clear", async () => {
    await seedDemoSection("INVENTORY", actor);
    await seedDemoSection("PRODUCTS", actor);
    const paperRecord = await prisma.demoRecord.findUniqueOrThrow({ where: { fixtureKey: "product.paper" }, include: { claims: true } });
    expect(new Set(paperRecord.claims.map((claim) => claim.section))).toEqual(new Set(["INVENTORY", "PRODUCTS"]));

    await clearDemoSection("INVENTORY");

    expect(await prisma.product.findUnique({ where: { id: paperRecord.entityId } })).not.toBeNull();
    expect(await prisma.van.findUnique({ where: { code: "DEMO-V1" } })).toBeNull();
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
    expect(await prisma.product.count({ where: { sku: { startsWith: "DEMO-" } } })).toBe(0);
    expect(await prisma.demoRecord.count()).toBe(0);
  });

  it("blocks clearing changed demo stock and preserves its non-demo movement history", async () => {
    await seedDemoSection("INVENTORY", actor);
    const van = await prisma.van.findUniqueOrThrow({ where: { code: "DEMO-V1" } });
    const product = await prisma.product.findUniqueOrThrow({ where: { sku: "DEMO-PAPER" } });
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
