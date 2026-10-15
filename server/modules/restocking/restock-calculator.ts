// Restock quantity = max(0, minimum − working physical stock)
//
// - "working physical stock" is the WORKING balance: broken units are excluded.
// - Reservations are NOT subtracted. They are promises against stock already on
//   the van, and the van's minimum is about what it physically carries.
// - Products with automatic van restocking switched off are skipped.
// - A negative balance (only possible from the import) is treated as zero so the
//   hub never over-picks from a number that is known to be wrong; it is flagged.

export interface RestockProduct {
  id: string;
  vanMinimum: number;
  autoRestock: boolean;
}

export interface RestockNeed {
  productId: string;
  quantity: number;
  balanceNeedsReview: boolean;
}

export function restockQuantity(minimum: number, working: number): number {
  return Math.max(0, minimum - Math.max(0, working));
}

export function calculateRestockNeeds(
  products: RestockProduct[],
  workingByProduct: ReadonlyMap<string, number>,
): RestockNeed[] {
  const needs: RestockNeed[] = [];
  for (const product of products) {
    if (!product.autoRestock || product.vanMinimum <= 0) continue;
    const working = workingByProduct.get(product.id) ?? 0;
    const quantity = restockQuantity(product.vanMinimum, working);
    if (quantity > 0) needs.push({ productId: product.id, quantity, balanceNeedsReview: working < 0 });
  }
  return needs;
}
