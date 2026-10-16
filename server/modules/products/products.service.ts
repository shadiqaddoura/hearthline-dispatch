import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { lockLocations, lockProduct, runInTransaction } from "@/server/db/transaction";
import { AppError, notFound } from "@/server/http/errors";
import { recalculateRestockForLocations } from "@/server/modules/restocking/restock.service";
import type { DeletedProductDto, ProductDetailDto, ProductDto, ProductInput } from "@/lib/contracts/products";
import { changesRestockPolicy, deletionBlock, lockedChanges, structuralLocks } from "./product-rules";
import {
  loadReferences,
  productSelect,
  removeDerivedRestockLines,
  toProductDto,
  vanLocationIds,
} from "./products.repository";

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function listProducts(): Promise<ProductDto[]> {
  const products = await prisma.product.findMany({ orderBy: { sku: "asc" }, select: productSelect });
  return products.map(toProductDto);
}

/** One product with where it is used, which decides what can be edited and whether it can be deleted. */
export async function getProduct(productId: string): Promise<ProductDetailDto> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: productSelect });
  if (!product) throw notFound("Product", productId);
  const { counts, removableRestockLines } = await loadReferences(prisma, productId);
  const reason = deletionBlock(product, counts);
  return {
    ...toProductDto(product),
    references: counts,
    removableRestockLines,
    locked: structuralLocks(product, counts),
    deletion: { allowed: reason === null, reason },
  };
}

// ─── Writes ─────────────────────────────────────────────────────────────────
//
// Each write is one transaction. Anything that changes what vans should carry first
// locks every van's stock location (like a stock movement does) and refreshes the open
// pick lists before committing, so a product and the lists that depend on it never
// disagree. Editing and deleting then lock the product row, which stops any record that
// refers to it from being added while it is judged.

/**
 * Adds a product to the catalogue. It creates no stock and no equipment: the van
 * balances stay as they are. A new minimum does show up on pick lists straight away,
 * because vans holding none of it are below that minimum.
 */
export async function createProduct(input: ProductInput): Promise<ProductDto> {
  try {
    return await runInTransaction(async (tx) => {
      await requireFreeSku(tx, input.sku, null);
      const affectsPickLists = input.autoRestock && input.vanMinimum > 0;
      const locationIds = affectsPickLists ? await vanLocationIds(tx) : [];
      await lockLocations(tx, locationIds);

      const created = await tx.product.create({ data: input, select: productSelect });
      if (affectsPickLists) await recalculateRestockForLocations(tx, locationIds);
      return toProductDto(created);
    });
  } catch (error) {
    throw translateSkuClash(error, input.sku);
  }
}

/**
 * Saves a product's editable fields. Descriptive fields and pack details are always
 * safe. The SKU, unit and serial tracking are refused when records refer to the product
 * (see product-rules). A new minimum or automatic-restocking setting refreshes every
 * van's pick list in the same transaction. The "needs review" flag and note are never
 * touched: only a decision recorded elsewhere resolves them.
 */
export async function updateProduct(productId: string, input: ProductInput): Promise<ProductDto> {
  try {
    return await runInTransaction(async (tx) => {
      const locationIds = await vanLocationIds(tx);
      await lockLocations(tx, locationIds);
      if (!(await lockProduct(tx, productId))) throw notFound("Product", productId);

      const current = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: productSelect });
      const { counts } = await loadReferences(tx, productId);
      const refused = lockedChanges(current, input, counts);
      if (Object.keys(refused).length > 0) {
        throw new AppError("INVALID_STATE", "Some of these changes would rewrite existing records, so nothing was saved", {
          fieldErrors: Object.fromEntries(Object.entries(refused).map(([field, message]) => [field, [message]])),
        });
      }
      if (input.sku !== current.sku) await requireFreeSku(tx, input.sku, productId);

      const saved = await tx.product.update({ where: { id: productId }, data: input, select: productSelect });
      if (changesRestockPolicy(current, input)) await recalculateRestockForLocations(tx, locationIds);
      return toProductDto(saved);
    });
  } catch (error) {
    throw translateSkuClash(error, input.sku);
  }
}

/**
 * Permanently deletes a product that nothing refers to. Stock, equipment, jobs,
 * reservations, movements and import history are never deleted along with it: if any
 * exists the product is kept and the reason returned. Open pick-list lines with nothing
 * collected are derived from the minimum, so they go with the product and the list is
 * refreshed.
 *
 * The database also refuses the delete (foreign keys are RESTRICT), so a record that
 * somehow appeared after the check still cannot be orphaned: the delete fails whole.
 */
export async function deleteProduct(productId: string): Promise<DeletedProductDto> {
  try {
    return await runInTransaction(async (tx) => {
      const locationIds = await vanLocationIds(tx);
      await lockLocations(tx, locationIds);
      if (!(await lockProduct(tx, productId))) throw notFound("Product", productId);

      const product = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: productSelect });
      const { counts } = await loadReferences(tx, productId);
      const reason = deletionBlock(product, counts);
      if (reason) throw new AppError("INVALID_STATE", reason, { references: counts });

      const removed = await removeDerivedRestockLines(tx, productId);
      await tx.product.delete({ where: { id: productId } });
      if (removed.count > 0) await recalculateRestockForLocations(tx, locationIds);
      return { id: product.id, sku: product.sku, name: product.name };
    });
  } catch (error) {
    if (isPrismaError(error, "P2003")) {
      throw new AppError(
        "CONFLICT",
        "This product was just used by another operation, so it was not deleted. Nothing was changed; reload to see where it is used.",
      );
    }
    throw error;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Friendly early check; the unique index on `sku` is what holds when two saves race. */
async function requireFreeSku(tx: Prisma.TransactionClient, sku: string, ownId: string | null) {
  const existing = await tx.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing && existing.id !== ownId) throw skuClash(sku);
}

function translateSkuClash(error: unknown, sku: string): unknown {
  return isPrismaError(error, "P2002") ? skuClash(sku) : error;
}

function skuClash(sku: string) {
  const message = `Another product already uses the SKU ${sku}`;
  return new AppError("CONFLICT", message, { fieldErrors: { sku: [message] } });
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}
