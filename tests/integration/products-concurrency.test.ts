import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createProduct, deleteProduct, updateProduct } from "@/server/modules/products/products.service";
import { productInput } from "../support/product-fixtures";
import { createWorld, stockVan, type World } from "../support/world";

// Product changes racing with the operations that add records to a product.
// The product row lock makes the winner unambiguous: whichever commits first decides.

let w: World;
let warn: MockInstance;

beforeEach(async () => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  w = await createWorld();
});

afterEach(() => {
  // The lock order should make database-aborted (deadlocked) transactions unnecessary.
  const retries = warn.mock.calls.filter((call) => String(call[0]).includes("Transaction aborted by the database"));
  expect(retries, "transactions were aborted by the database and retried").toHaveLength(0);
  warn.mockRestore();
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Holds a transaction open that has just added a record referring to the product
 * (its foreign key check takes a shared lock on the product row), until `release` is called.
 */
async function referenceInFlight(productId: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let inserted!: () => void;
  const ready = new Promise<void>((resolve) => (inserted = resolve));
  const writer = prisma.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: { type: "OPENING_BALANCE", productId, condition: "WORKING", quantity: 1, toLocationId: w.north.locationId, performedBy: "test" },
    });
    inserted();
    await gate;
  });
  await ready;
  return { release, committed: writer };
}

const settled = (promise: Promise<unknown>) => {
  let done = false;
  promise.then(
    () => (done = true),
    () => (done = true),
  );
  return () => done;
};

describe("a product becoming referenced while it is being changed", () => {
  it("makes a delete wait for the in-flight reference, then refuse and change nothing", async () => {
    const product = await createProduct(productInput({ sku: "RACE-D", vanMinimum: 2 }));
    const writer = await referenceInFlight(product.id);

    const deletion = deleteProduct(product.id);
    const isDone = settled(deletion);
    await sleep(400);
    expect(isDone(), "the delete must wait for the uncommitted reference").toBe(false);

    writer.release();
    await writer.committed;
    await expect(deletion).rejects.toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("1 stock movement") });
    expect(await prisma.product.findUnique({ where: { id: product.id } })).not.toBeNull();
    expect(await prisma.stockMovement.count({ where: { productId: product.id } })).toBe(1);
    // The pick-list lines created with the product were not removed by the refused delete.
    expect(await prisma.restockItem.count({ where: { productId: product.id } })).toBeGreaterThan(0);
  });

  it("makes a unit change wait for the in-flight reference, then refuse it", async () => {
    const product = await createProduct(productInput({ sku: "RACE-U", autoRestock: false }));
    const writer = await referenceInFlight(product.id);

    const edit = updateProduct(product.id, productInput({ sku: "RACE-U", autoRestock: false, baseUnit: "metre" }));
    const isDone = settled(edit);
    await sleep(400);
    expect(isDone()).toBe(false);

    writer.release();
    await writer.committed;
    await expect(edit).rejects.toMatchObject({ code: "INVALID_STATE", details: { fieldErrors: { baseUnit: [expect.any(String)] } } });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).baseUnit).toBe("each");
  });

  it("never leaves a deleted product with records, or a refused one without its product, across many races", async () => {
    for (let round = 0; round < 12; round++) {
      const product = await createProduct(productInput({ sku: `ROUND-${round}`, autoRestock: false }));
      const [deletion, stocking] = await Promise.allSettled([
        deleteProduct(product.id),
        stockVan(w.north.locationId, product.id, 1),
      ]);

      const exists = (await prisma.product.findUnique({ where: { id: product.id } })) !== null;
      const records = await prisma.stockMovement.count({ where: { productId: product.id } });
      const balances = await prisma.stockBalance.count({ where: { productId: product.id } });
      if (deletion.status === "fulfilled") {
        // Deleted: the stock operation must have been the one to fail, leaving nothing behind.
        expect(exists).toBe(false);
        expect(records + balances).toBe(0);
        expect(stocking.status).toBe("rejected");
      } else {
        expect(deletion.reason).toMatchObject({ code: "INVALID_STATE" });
        expect(exists).toBe(true);
        expect(stocking.status).toBe("fulfilled");
        expect(records).toBeGreaterThan(0);
      }
    }
  }, 60_000);
});
