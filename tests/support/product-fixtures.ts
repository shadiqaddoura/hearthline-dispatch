import { prisma } from "@/server/db/prisma";
import type { ProductInput } from "@/lib/contracts/products";
import type { World } from "./world";

/** A valid request body with ordinary defaults. */
export function productInput(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    sku: "NEW-01",
    name: "New product",
    serialised: false,
    baseUnit: "each",
    packUnit: null,
    packSize: null,
    vanMinimum: 0,
    autoRestock: true,
    ...overrides,
  };
}

export async function productRecordCounts(productId: string) {
  const where = { productId };
  return {
    balances: await prisma.stockBalance.count({ where }),
    movements: await prisma.stockMovement.count({ where }),
    units: await prisma.equipmentUnit.count({ where }),
    reservations: await prisma.reservation.count({ where }),
    jobItems: await prisma.jobItem.count({ where }),
    restockItems: await prisma.restockItem.count({ where }),
  };
}

/** The way each kind of record can come to refer to a product, written directly so each is tested alone. */
export const referenceMakers: Record<string, (w: World, productId: string) => Promise<unknown>> = {
  "a stock balance": (w, productId) =>
    prisma.stockBalance.create({ data: { locationId: w.north.locationId, productId, condition: "WORKING", quantity: 0 } }),
  "a stock movement": (w, productId) =>
    prisma.stockMovement.create({
      data: { type: "OPENING_BALANCE", productId, condition: "WORKING", quantity: 1, toLocationId: w.north.locationId, performedBy: "test" },
    }),
  "a stock count correction": (w, productId) =>
    prisma.stockCorrection.create({
      data: { locationId: w.north.locationId, productId, condition: "WORKING", previousQuantity: 0, correctedQuantity: 0, reason: "test", correctedBy: "test" },
    }),
  "an equipment unit": (w, productId) =>
    prisma.equipmentUnit.create({
      data: { productId, verification: "NEEDS_VERIFICATION", condition: "WORKING", status: "IN_STOCK", locationId: w.north.locationId },
    }),
  "a job line": async (w, productId) => {
    await prisma.job.create({
      data: { reference: "J-REF", type: "INSTALLATION", branchId: w.branch.id, items: { create: [{ productId, quantity: 1 }] } },
    });
  },
  "a reservation": async (w, productId) => {
    const job = await prisma.job.create({ data: { reference: "J-RES", type: "INSTALLATION", branchId: w.branch.id } });
    await prisma.reservation.create({ data: { jobId: job.id, locationId: w.north.locationId, productId, quantity: 1 } });
  },
  "a job completion line": async (w, productId) => {
    const job = await prisma.job.create({ data: { reference: "J-DONE", type: "INSTALLATION", branchId: w.branch.id, status: "COMPLETED" } });
    await prisma.jobCompletion.create({
      data: { jobId: job.id, completedBy: "test", lines: { create: [{ productId, kind: "DELIVERED", quantity: 1, serials: [] }] } },
    });
  },
  "a line on a closed restock list": async (w, productId) => {
    await prisma.restockJob.create({
      data: { vanId: w.north.id, status: "CLOSED", closedAt: new Date(), items: { create: [{ productId, outstandingQuantity: 0 }] } },
    });
  },
  "a collected restock line": async (w, productId) => {
    await prisma.restockJob.create({
      data: { vanId: w.north.id, items: { create: [{ productId, outstandingQuantity: 1, collectedQuantity: 2 }] } },
    });
  },
  "a broken-unit return": async (w, productId) => {
    const restock = await prisma.restockJob.create({ data: { vanId: w.north.id, status: "CLOSED", closedAt: new Date() } });
    await prisma.restockReturn.create({ data: { restockJobId: restock.id, productId, quantity: 1, serials: [], returnedBy: "test" } });
  },
};
