import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/lib/contracts/products";
import { EMPTY_PRODUCT_FORM, firstInvalidField, formFromProduct, parseProductForm, type ProductFormValues } from "@/lib/products/product-form";
import { product } from "../support/products";

const valid: ProductFormValues = { ...EMPTY_PRODUCT_FORM, sku: "PRN-80", name: "Receipt printer", vanMinimum: "3" };
const errorsFor = (values: Partial<ProductFormValues>) => {
  const parsed = parseProductForm({ ...valid, ...values });
  return parsed.ok ? {} : parsed.errors;
};

describe("canonical product input", () => {
  it("trims and upper-cases the SKU, tidies the name and lower-cases units", () => {
    const parsed = productInputSchema.parse({
      sku: "  prn-80 ",
      name: "  Receipt   printer\n80mm ",
      serialised: true,
      baseUnit: " Each ",
      packUnit: " Box ",
      packSize: 10,
      vanMinimum: 3,
      autoRestock: true,
    });
    expect(parsed).toMatchObject({ sku: "PRN-80", name: "Receipt printer 80mm", baseUnit: "each", packUnit: "box" });
  });

  it.each(["", "   ", "PRN 80", "PRN--80", "-PRN", "PRN-", "PRN/80", "PRÑ-80", "A".repeat(33)])("rejects the SKU %j", (sku) => {
    expect(productInputSchema.safeParse({ ...parseValid(), sku }).success).toBe(false);
  });

  it.each(["PRN-80", "CBL.ETH.5", "a1", "P_2"])("accepts the SKU %j", (sku) => {
    expect(productInputSchema.safeParse({ ...parseValid(), sku }).success).toBe(true);
  });

  it("refuses non-integer, negative and huge quantities, and a pack of one", () => {
    const attempt = (overrides: object) => productInputSchema.safeParse({ ...parseValid(), ...overrides }).success;
    expect(attempt({ vanMinimum: 1.5 })).toBe(false);
    expect(attempt({ vanMinimum: -1 })).toBe(false);
    expect(attempt({ vanMinimum: 100_001 })).toBe(false);
    expect(attempt({ packUnit: "box", packSize: 1 })).toBe(false);
    expect(attempt({ packUnit: "box", packSize: 2.5 })).toBe(false);
    expect(attempt({ vanMinimum: 0 })).toBe(true);
  });

  it("needs a pack to have both a name and a size, and to differ from the unit", () => {
    const messages = (overrides: object) => {
      const result = productInputSchema.safeParse({ ...parseValid(), ...overrides });
      return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    };
    expect(messages({ packUnit: "box", packSize: null })).toEqual(["packSize: Enter how many units are in a pack"]);
    expect(messages({ packUnit: null, packSize: 10 })).toEqual(["packUnit: Name the pack, e.g. box"]);
    expect(messages({ baseUnit: "box", packUnit: "box", packSize: 10 })).toEqual(["packUnit: The pack unit must differ from the unit"]);
  });

  it("never accepts the review flag or note from a request", () => {
    const parsed = productInputSchema.parse({ ...parseValid(), restockPolicyNeedsReview: false, restockPolicyNote: "x" });
    expect(parsed).not.toHaveProperty("restockPolicyNeedsReview");
    expect(parsed).not.toHaveProperty("restockPolicyNote");
  });
});

function parseValid() {
  return { sku: "PRN-80", name: "Printer", serialised: false, baseUnit: "each", packUnit: null, packSize: null, vanMinimum: 1, autoRestock: true };
}

describe("product form parsing", () => {
  it("turns typed text into a request", () => {
    const parsed = parseProductForm({ ...valid, sku: " prn-80", packUnit: "Box", packSize: " 50 ", serialised: true });
    expect(parsed).toEqual({
      ok: true,
      input: { sku: "PRN-80", name: "Receipt printer", serialised: true, baseUnit: "each", packUnit: "box", packSize: 50, vanMinimum: 3, autoRestock: true },
    });
  });

  it("reports each problem beside its field, once", () => {
    expect(errorsFor({ sku: "", name: " ", baseUnit: "", vanMinimum: "" })).toEqual({
      sku: "Enter a SKU",
      name: "Enter a product name",
      baseUnit: "Enter a unit, e.g. each, roll, metre",
      vanMinimum: "Enter a minimum, or 0 for none",
    });
  });

  it.each(["abc", "1.5", "-2", "1e3", "٣"])("rejects %j as a minimum", (text) => {
    expect(errorsFor({ vanMinimum: text })).toEqual({ vanMinimum: "Enter a whole number, without decimals or signs" });
  });

  it("reports an unreadable pack size without a second, confusing message", () => {
    expect(errorsFor({ packUnit: "box", packSize: "ten" })).toEqual({ packSize: "Enter a whole number, without decimals or signs" });
    expect(errorsFor({ packUnit: "box", packSize: "" })).toEqual({ packSize: "Enter how many units are in a pack" });
    expect(errorsFor({ packUnit: "", packSize: "10" })).toEqual({ packUnit: "Name the pack, e.g. box" });
  });

  it("starts an edit from the product's own values and finds the first invalid field in screen order", () => {
    const values = formFromProduct(product({ sku: "PAP-80", name: "Paper", baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 100 }));
    expect(values).toMatchObject({ packUnit: "box", packSize: "50", vanMinimum: "100", autoRestock: true });
    expect(parseProductForm(values).ok).toBe(true);
    expect(firstInvalidField({ vanMinimum: "x", name: "y" })).toBe("name");
    expect(firstInvalidField({})).toBeNull();
  });
});
