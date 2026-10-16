// How the catalogue is searched and described to people. Independent of any UI library.
import type { ProductDto } from "@/lib/contracts/products";

/** Products whose name or SKU contains the query, ignoring case and surrounding spaces. */
export function filterProducts(products: ProductDto[], query: string): ProductDto[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return products;
  return products.filter(
    (product) =>
      product.sku.toLocaleLowerCase().includes(needle) || product.name.toLocaleLowerCase().includes(needle),
  );
}

/** "3 rolls", "1 roll", "10 each". Units are stored singular. */
export function formatQuantity(quantity: number, unit: string): string {
  return `${quantity} ${quantity === 1 ? unit : pluralUnit(unit)}`;
}

/** "rolls", "boxes"; "each" stays "each". */
export function pluralUnit(unit: string): string {
  if (unit === "each") return unit;
  return /(s|x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

/** "Roll, box of 50" or "Each". */
export function describeUnit(product: Pick<ProductDto, "baseUnit" | "packUnit" | "packSize">): string {
  const base = capitalise(product.baseUnit);
  return product.packUnit && product.packSize ? `${base}, ${product.packUnit} of ${product.packSize}` : base;
}

/** "100 rolls (2 boxes)" when the minimum is a whole number of packs, otherwise "3 each". */
export function describeVanMinimum(
  product: Pick<ProductDto, "vanMinimum" | "baseUnit" | "packUnit" | "packSize">,
): string {
  const { packUnit, packSize, vanMinimum, baseUnit } = product;
  const base = formatQuantity(vanMinimum, baseUnit);
  if (!packUnit || !packSize || vanMinimum === 0 || vanMinimum % packSize !== 0) return base;
  return `${base} (${formatQuantity(vanMinimum / packSize, packUnit)})`;
}

export interface RestockPolicySummary {
  automatic: boolean;
  needsReview: boolean;
  /** "Automatic", "Off", or either followed by "· needs review". */
  label: string;
}

export function summariseRestockPolicy(
  product: Pick<ProductDto, "autoRestock" | "restockPolicyNeedsReview">,
): RestockPolicySummary {
  const current = product.autoRestock ? "Automatic" : "Off";
  return {
    automatic: product.autoRestock,
    needsReview: product.restockPolicyNeedsReview,
    label: product.restockPolicyNeedsReview ? `${current} · needs review` : current,
  };
}

function capitalise(word: string): string {
  return word.charAt(0).toLocaleUpperCase() + word.slice(1);
}
