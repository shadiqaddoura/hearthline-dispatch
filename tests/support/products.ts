import type { ProductDetailDto, ProductDto } from "@/lib/contracts/products";
import { emptyReferenceCounts } from "@/lib/products/references";

/** A product row with ordinary defaults: counted each, no serials, restocked automatically. */
export function product(overrides: Partial<ProductDto> & Pick<ProductDto, "sku" | "name">): ProductDto {
  return {
    id: overrides.sku,
    serialised: false,
    baseUnit: "each",
    packUnit: null,
    packSize: null,
    vanMinimum: 1,
    autoRestock: true,
    restockPolicyNeedsReview: false,
    restockPolicyNote: null,
    ...overrides,
  };
}

/** What `GET /api/products/:id` returns for a product nothing refers to, unless overridden. */
export function productDetail(base: ProductDto, overrides: Partial<ProductDetailDto> = {}): ProductDetailDto {
  return {
    ...base,
    references: emptyReferenceCounts(),
    removableRestockLines: 0,
    locked: { sku: null, baseUnit: null, serialised: null },
    deletion: { allowed: true, reason: null },
    ...overrides,
  };
}
