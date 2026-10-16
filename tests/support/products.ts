import type { ProductDto } from "@/lib/contracts/products";

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
