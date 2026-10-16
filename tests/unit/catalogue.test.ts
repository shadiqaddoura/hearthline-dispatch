import { describe, expect, it } from "vitest";
import {
  describeUnit,
  describeVanMinimum,
  filterProducts,
  formatQuantity,
  summariseRestockPolicy,
} from "@/lib/products/catalogue";
import { product } from "../support/products";

const paper = product({ sku: "PAP-80", name: "Thermal paper 80mm", baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 100 });
const printer = product({ sku: "PRN-80", name: "Receipt printer 80mm", serialised: true, vanMinimum: 3 });
const kitchenPrinter = product({ sku: "PRN-K", name: "Kitchen printer (impact)" });

describe("filterProducts", () => {
  const all = [paper, printer, kitchenPrinter];

  it("matches the name or the SKU, ignoring case and surrounding spaces", () => {
    expect(filterProducts(all, "  prn ")).toEqual([printer, kitchenPrinter]);
    expect(filterProducts(all, "KITCHEN")).toEqual([kitchenPrinter]);
    expect(filterProducts(all, "80mm")).toEqual([paper, printer]);
  });

  it("returns everything for an empty query and nothing for no match", () => {
    expect(filterProducts(all, "   ")).toEqual(all);
    expect(filterProducts(all, "router")).toEqual([]);
  });
});

describe("unit wording", () => {
  it("pluralises stored singular units, except 'each'", () => {
    expect(formatQuantity(1, "roll")).toBe("1 roll");
    expect(formatQuantity(100, "roll")).toBe("100 rolls");
    expect(formatQuantity(2, "box")).toBe("2 boxes");
    expect(formatQuantity(3, "each")).toBe("3 each");
  });

  it("names the pack when the product is issued in packs", () => {
    expect(describeUnit(paper)).toBe("Roll, box of 50");
    expect(describeUnit(printer)).toBe("Each");
  });

  it("shows the van minimum in packs only when it is a whole number of them", () => {
    expect(describeVanMinimum(paper)).toBe("100 rolls (2 boxes)");
    expect(describeVanMinimum({ ...paper, vanMinimum: 50 })).toBe("50 rolls (1 box)");
    expect(describeVanMinimum({ ...paper, vanMinimum: 75 })).toBe("75 rolls");
    expect(describeVanMinimum(printer)).toBe("3 each");
  });
});

describe("summariseRestockPolicy", () => {
  it("keeps the current setting visible when the policy is flagged for review", () => {
    expect(summariseRestockPolicy({ autoRestock: true, restockPolicyNeedsReview: false }).label).toBe("Automatic");
    expect(summariseRestockPolicy({ autoRestock: false, restockPolicyNeedsReview: false }).label).toBe("Off");
    expect(summariseRestockPolicy({ autoRestock: false, restockPolicyNeedsReview: true })).toEqual({
      automatic: false,
      needsReview: true,
      label: "Off · needs review",
    });
  });
});
