/** A catalogue product as `GET /api/products` returns it. Quantities are in `baseUnit`. */
export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  /** Each unit carries a serial number that must be recorded before it can be assigned. */
  serialised: boolean;
  baseUnit: string;
  /** Optional larger unit the hub issues in, e.g. "box". */
  packUnit: string | null;
  /** Base units per pack, e.g. 50 rolls per box. */
  packSize: number | null;
  /** Minimum each van should carry, in base units. */
  vanMinimum: number;
  /** Whether van restocking includes this product automatically. */
  autoRestock: boolean;
  restockPolicyNeedsReview: boolean;
  restockPolicyNote: string | null;
}
