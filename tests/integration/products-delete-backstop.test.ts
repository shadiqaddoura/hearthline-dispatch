import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createProduct, deleteProduct } from "@/server/modules/products/products.service";
import * as repository from "@/server/modules/products/products.repository";
import { productInput } from "../support/product-fixtures";
import { createWorld, stockVan, type World } from "../support/world";

// If a reference were ever missed by the application's own check, the database's
// foreign keys (RESTRICT) still refuse the delete, and the person sees a clear
// error. Here the check is blinded on purpose to prove that path.

vi.mock("@/server/modules/products/products.repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/modules/products/products.repository")>();
  return { ...actual, loadReferences: vi.fn(actual.loadReferences) };
});

let w: World;
beforeEach(async () => {
  w = await createWorld();
});

describe("deleting a product the application's check missed", () => {
  it("is refused by the database as a clear conflict, with every change rolled back", async () => {
    const product = await createProduct(productInput({ sku: "MISSED-1", vanMinimum: 2 }));
    await stockVan(w.north.locationId, product.id, 1);
    const linesBefore = await prisma.restockItem.count({ where: { productId: product.id } });
    expect(linesBefore).toBeGreaterThan(0);

    vi.mocked(repository.loadReferences).mockResolvedValueOnce({
      counts: { stockBalances: 0, stockMovements: 0, stockCorrections: 0, reservations: 0, equipmentUnits: 0, jobItems: 0, completionLines: 0, restockItems: 0, restockReturns: 0 },
      removableRestockLines: linesBefore,
    });

    await expect(deleteProduct(product.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("was just used by another operation"),
    });

    expect(await prisma.product.findUnique({ where: { id: product.id } })).not.toBeNull();
    expect(await prisma.stockMovement.count({ where: { productId: product.id } })).toBe(1);
    // The pick-list lines the delete had already removed are back: the transaction rolled back.
    expect(await prisma.restockItem.count({ where: { productId: product.id } })).toBe(linesBefore);
  });
});
