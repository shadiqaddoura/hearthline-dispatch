// The product form's values as typed, and how they become a request. Pure, so the
// rules can be tested without a browser. The server validates the request again.
import {
  productInputSchema,
  type ProductDto,
  type ProductField,
  type ProductInput,
} from "@/lib/contracts/products";

/** Everything is text except the two switches: that is what people type. */
export interface ProductFormValues {
  sku: string;
  name: string;
  baseUnit: string;
  packUnit: string;
  packSize: string;
  vanMinimum: string;
  serialised: boolean;
  autoRestock: boolean;
}

export type ProductFormErrors = Partial<Record<ProductField, string>>;

/** A new product starts the way imported ones usually are: counted each, restocked automatically. */
export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  sku: "",
  name: "",
  baseUnit: "each",
  packUnit: "",
  packSize: "",
  vanMinimum: "0",
  serialised: false,
  autoRestock: true,
};

export function formFromProduct(product: ProductDto): ProductFormValues {
  return {
    sku: product.sku,
    name: product.name,
    baseUnit: product.baseUnit,
    packUnit: product.packUnit ?? "",
    packSize: product.packSize?.toString() ?? "",
    vanMinimum: product.vanMinimum.toString(),
    serialised: product.serialised,
    autoRestock: product.autoRestock,
  };
}

/** Field order on screen: the first error in this order gets focus. */
export const PRODUCT_FIELD_ORDER: ProductField[] = [
  "sku",
  "name",
  "baseUnit",
  "packUnit",
  "packSize",
  "serialised",
  "vanMinimum",
  "autoRestock",
];

export type ParsedProductForm = { ok: true; input: ProductInput } | { ok: false; errors: ProductFormErrors };

const WHOLE_NUMBER = /^\d+$/;

export function parseProductForm(values: ProductFormValues): ParsedProductForm {
  const errors: ProductFormErrors = {};
  const packSize = parseWhole(values.packSize, errors, "packSize", null);
  const vanMinimum = parseWhole(values.vanMinimum, errors, "vanMinimum", "Enter a minimum, or 0 for none");

  const result = productInputSchema.safeParse({
    sku: values.sku,
    name: values.name,
    serialised: values.serialised,
    baseUnit: values.baseUnit,
    packUnit: values.packUnit.trim() === "" ? null : values.packUnit,
    // A number the person typed wrongly is reported once, below, not again by the schema.
    packSize: packSize ?? null,
    vanMinimum: vanMinimum ?? 0,
    autoRestock: values.autoRestock,
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as ProductField | undefined;
      if (field && !errors[field]) errors[field] = issue.message;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return result.success ? { ok: true, input: result.data } : { ok: false, errors };
}

function parseWhole(text: string, errors: ProductFormErrors, field: "packSize" | "vanMinimum", whenEmpty: string | null) {
  const trimmed = text.trim();
  if (trimmed === "") {
    if (whenEmpty) errors[field] = whenEmpty;
    return null;
  }
  if (!WHOLE_NUMBER.test(trimmed)) {
    errors[field] = "Enter a whole number, without decimals or signs";
    return null;
  }
  return Number(trimmed);
}

/** The first field with an error, in screen order, so focus can go there. */
export function firstInvalidField(errors: ProductFormErrors): ProductField | null {
  return PRODUCT_FIELD_ORDER.find((field) => errors[field]) ?? null;
}
