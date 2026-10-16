// How the records that point at a product are described to people. Used by the
// server (in the explanations it returns) and by the UI. No server-only imports.
import type { ProductReferenceCounts, ProductReferenceKind } from "@/lib/contracts/products";

const NAMES: Record<ProductReferenceKind, [singular: string, plural: string]> = {
  stockBalances: ["stock balance", "stock balances"],
  stockMovements: ["stock movement", "stock movements"],
  stockCorrections: ["stock count correction", "stock count corrections"],
  reservations: ["job reservation", "job reservations"],
  equipmentUnits: ["equipment unit", "equipment units"],
  jobItems: ["job line", "job lines"],
  completionLines: ["job completion line", "job completion lines"],
  restockItems: ["restock list line", "restock list lines"],
  restockReturns: ["broken-unit return", "broken-unit returns"],
};

export const REFERENCE_KINDS = Object.keys(NAMES) as ProductReferenceKind[];

export function emptyReferenceCounts(): ProductReferenceCounts {
  return Object.fromEntries(REFERENCE_KINDS.map((kind) => [kind, 0])) as ProductReferenceCounts;
}

export function totalReferences(counts: ProductReferenceCounts): number {
  return REFERENCE_KINDS.reduce((sum, kind) => sum + counts[kind], 0);
}

/** "2 stock movements and 1 equipment unit"; the kinds that are zero are left out. */
export function describeReferences(counts: ProductReferenceCounts): string {
  const parts = REFERENCE_KINDS.filter((kind) => counts[kind] > 0).map((kind) => {
    const [singular, plural] = NAMES[kind];
    return `${counts[kind].toLocaleString("en")} ${counts[kind] === 1 ? singular : plural}`;
  });
  if (parts.length <= 1) return parts[0] ?? "no records";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** One entry per kind that has records, in a stable order, for lists. */
export function listReferences(counts: ProductReferenceCounts): { kind: ProductReferenceKind; count: number; label: string }[] {
  return REFERENCE_KINDS.filter((kind) => counts[kind] > 0).map((kind) => ({
    kind,
    count: counts[kind],
    label: counts[kind] === 1 ? NAMES[kind][0] : NAMES[kind][1],
  }));
}
