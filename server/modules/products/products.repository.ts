import "server-only";
import type { Tx } from "@/server/db/transaction";
import type { ProductReferenceCounts } from "@/lib/contracts/products";
import type { ProductDto } from "@/lib/contracts/products";
import type { Product } from "@/generated/prisma/client";

/** The fields every product response carries. */
export const productSelect = {
  id: true,
  sku: true,
  name: true,
  serialised: true,
  baseUnit: true,
  packUnit: true,
  packSize: true,
  vanMinimum: true,
  autoRestock: true,
  restockPolicyNeedsReview: true,
  restockPolicyNote: true,
} as const;

export function toProductDto(product: Pick<Product, keyof typeof productSelect>): ProductDto {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    serialised: product.serialised,
    baseUnit: product.baseUnit,
    packUnit: product.packUnit,
    packSize: product.packSize,
    vanMinimum: product.vanMinimum,
    autoRestock: product.autoRestock,
    restockPolicyNeedsReview: product.restockPolicyNeedsReview,
    restockPolicyNote: product.restockPolicyNote,
  };
}

// An open pick-list line with nothing collected against it is derived from the
// minimum and the van's stock, not a record of work done. Every other line (one that
// has had stock collected, or sits on a closed list) is history.
const removableLine = (productId: string) => ({ productId, collectedQuantity: 0, restockJob: { status: "OPEN" as const } });

/**
 * How many records of each kind refer to the product, and how many open pick-list
 * lines would simply be removed with it. Run inside a transaction after locking the
 * product so the answer holds until the transaction ends.
 */
export async function loadReferences(
  tx: Tx,
  productId: string,
): Promise<{ counts: ProductReferenceCounts; removableRestockLines: number }> {
  // Sequential on purpose: inside a transaction all queries share one connection.
  const where = { productId };
  const stockBalances = await tx.stockBalance.count({ where });
  const stockMovements = await tx.stockMovement.count({ where });
  const stockCorrections = await tx.stockCorrection.count({ where });
  const reservations = await tx.reservation.count({ where });
  const equipmentUnits = await tx.equipmentUnit.count({ where });
  const jobItems = await tx.jobItem.count({ where });
  const completionLines = await tx.jobCompletionLine.count({ where });
  const restockReturns = await tx.restockReturn.count({ where });
  const allRestockLines = await tx.restockItem.count({ where });
  const removableRestockLines = await tx.restockItem.count({ where: removableLine(productId) });

  return {
    counts: {
      stockBalances,
      stockMovements,
      stockCorrections,
      reservations,
      equipmentUnits,
      jobItems,
      completionLines,
      restockItems: allRestockLines - removableRestockLines,
      restockReturns,
    },
    removableRestockLines,
  };
}

export function removeDerivedRestockLines(tx: Tx, productId: string) {
  return tx.restockItem.deleteMany({ where: removableLine(productId) });
}

/** Every van's stock location, in the order locks are taken. */
export async function vanLocationIds(tx: Tx): Promise<string[]> {
  const vans = await tx.van.findMany({ select: { locationId: true }, orderBy: { locationId: "asc" } });
  return vans.map((van) => van.locationId);
}
