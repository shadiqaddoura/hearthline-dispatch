// Shared by the API and the UI. No server-only imports here.
import { z } from "zod";

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

// ─── Writing a product ──────────────────────────────────────────────────────
//
// One schema validates a product on the server and in the form, so both sides
// canonicalise the same way: the SKU is trimmed and upper-cased, units are
// trimmed and lower-cased, names have their spaces tidied.
// The review flag and note are not part of it: they are only changed by the
// import, never by editing a product.

/** Letters and digits, joined by single hyphens, dots or underscores: "PRN-80", "CBL.ETH.5". */
export const SKU_PATTERN = /^[A-Z0-9]+(?:[-._][A-Z0-9]+)*$/;
const UNIT_PATTERN = /^[a-z][a-z0-9]*(?:[ -][a-z0-9]+)*$/;
const UNIT_MESSAGE = "Use lower-case words, e.g. each, roll, metre";
export const MAX_QUANTITY = 100_000;

const unit = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter a unit, e.g. each, roll, metre")
  .max(24, "Keep it to 24 characters")
  .regex(UNIT_PATTERN, UNIT_MESSAGE);

export const productInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .toUpperCase()
      .min(1, "Enter a SKU")
      .max(32, "Keep the SKU to 32 characters")
      .regex(SKU_PATTERN, "Use letters and numbers, with hyphens, dots or underscores between them, e.g. PRN-80"),
    name: z
      .string()
      .transform((value) => value.trim().replace(/\s+/g, " "))
      .pipe(z.string().min(1, "Enter a product name").max(120, "Keep the name to 120 characters")),
    serialised: z.boolean(),
    baseUnit: unit,
    packUnit: unit.nullable(),
    packSize: z
      .number("Enter a whole number")
      .int("Enter a whole number")
      .min(2, "A pack holds at least 2")
      .max(MAX_QUANTITY, `Keep it to ${MAX_QUANTITY.toLocaleString("en")} or fewer`)
      .nullable(),
    vanMinimum: z
      .number("Enter a whole number")
      .int("Enter a whole number")
      .min(0, "Enter 0 or more")
      .max(MAX_QUANTITY, `Keep it to ${MAX_QUANTITY.toLocaleString("en")} or fewer`),
    autoRestock: z.boolean(),
  })
  .superRefine((product, ctx) => {
    if (product.packUnit !== null && product.packSize === null) {
      ctx.addIssue({ code: "custom", path: ["packSize"], message: "Enter how many units are in a pack" });
    }
    if (product.packSize !== null && product.packUnit === null) {
      ctx.addIssue({ code: "custom", path: ["packUnit"], message: "Name the pack, e.g. box" });
    }
    if (product.packUnit !== null && product.packUnit === product.baseUnit) {
      ctx.addIssue({ code: "custom", path: ["packUnit"], message: "The pack unit must differ from the unit" });
    }
  });

/** What the form sends. Creating and editing take the same fields. */
export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductField = keyof ProductInput;

// ─── Where a product is used ────────────────────────────────────────────────

export type ProductReferenceKind =
  | "stockBalances"
  | "stockMovements"
  | "stockCorrections"
  | "reservations"
  | "equipmentUnits"
  | "jobItems"
  | "completionLines"
  | "restockItems"
  | "restockReturns";

/** How many records of each kind point at the product. */
export type ProductReferenceCounts = Record<ProductReferenceKind, number>;

/** A product with the facts the edit and delete dialogs need. The server decides every rule. */
export interface ProductDetailDto extends ProductDto {
  /** Records that refer to the product. Open pick-list lines with nothing collected are not counted: see below. */
  references: ProductReferenceCounts;
  /** Open pick-list lines that deleting the product removes, because nothing has been collected against them. */
  removableRestockLines: number;
  /** Why a field can't be changed right now, or null when it can. */
  locked: { sku: string | null; baseUnit: string | null; serialised: string | null };
  /** Whether the product could be deleted now, and if not, why. */
  deletion: { allowed: boolean; reason: string | null };
}

/** What was removed, for the confirmation message. */
export interface DeletedProductDto {
  id: string;
  sku: string;
  name: string;
}
