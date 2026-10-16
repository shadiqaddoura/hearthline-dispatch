// The rules for changing and deleting a product, as pure functions of the product
// and the records that refer to it. The service loads the records (under a lock)
// and applies these; keeping them separate makes every refusal easy to test.
import type { ProductInput, ProductReferenceCounts } from "@/lib/contracts/products";
import { pluralUnit } from "@/lib/products/catalogue";
import { describeReferences, totalReferences } from "@/lib/products/references";

interface StructuralFields {
  sku: string;
  baseUnit: string;
  serialised: boolean;
}

export type StructuralLocks = { sku: string | null; baseUnit: string | null; serialised: string | null };

/**
 * A product's identity, its unit and whether it is serialised stop being editable
 * once any record refers to it. Quantities everywhere are counted in the base unit,
 * and serialised stock is backed by one equipment row per unit, so changing either
 * would silently reinterpret numbers or leave units that no longer match their
 * product. The SKU is what movements, jobs and the stock book are read by.
 *
 * Pack unit and size are not locked: they only change how a base-unit quantity is
 * written out (65 rolls as "1 box + 15 rolls"); no stored quantity changes.
 */
export function structuralLocks(product: StructuralFields, counts: ProductReferenceCounts): StructuralLocks {
  if (totalReferences(counts) === 0) return { sku: null, baseUnit: null, serialised: null };
  const used = describeReferences(counts);
  return {
    sku: `${product.sku} can't be renamed: ${used} already refer to it, and movements, jobs and the stock book are read by SKU.`,
    baseUnit: `The unit can't change: its quantities (${used}) are already counted in ${pluralUnit(product.baseUnit)}, and changing the unit would silently reinterpret them.`,
    serialised: product.serialised
      ? `Serial tracking can't be switched off: ${used} already refer to this product, including serial-number records.`
      : `Serial tracking can't be switched on: ${used} already refer to this product, and existing units would have no serial records.`,
  };
}

/** The structural fields the update tries to change although they are locked, with the reason for each. */
export function lockedChanges(current: StructuralFields, next: ProductInput, counts: ProductReferenceCounts) {
  const locks = structuralLocks(current, counts);
  const errors: Partial<Record<keyof StructuralLocks, string>> = {};
  if (locks.sku && next.sku !== current.sku) errors.sku = locks.sku;
  if (locks.baseUnit && next.baseUnit !== current.baseUnit) errors.baseUnit = locks.baseUnit;
  if (locks.serialised && next.serialised !== current.serialised) errors.serialised = locks.serialised;
  return errors;
}

/** Why the product can't be deleted, or null when nothing but removable pick-list lines refers to it. */
export function deletionBlock(product: { sku: string; name: string }, counts: ProductReferenceCounts): string | null {
  if (totalReferences(counts) === 0) return null;
  return `${product.name} (${product.sku}) can't be deleted: ${describeReferences(counts)} refer to it. Deleting would erase stock, equipment, job or movement history, so the product is kept.`;
}

/** Changes that must bring van pick lists up to date. */
export function changesRestockPolicy(
  current: { vanMinimum: number; autoRestock: boolean },
  next: { vanMinimum: number; autoRestock: boolean },
): boolean {
  return current.vanMinimum !== next.vanMinimum || current.autoRestock !== next.autoRestock;
}
