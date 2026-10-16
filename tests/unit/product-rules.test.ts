import { describe, expect, it } from "vitest";
import type { ProductInput } from "@/lib/contracts/products";
import { describeReferences, emptyReferenceCounts } from "@/lib/products/references";
import { changesRestockPolicy, deletionBlock, lockedChanges, structuralLocks } from "@/server/modules/products/product-rules";

const current = { sku: "PAP-80", baseUnit: "roll", serialised: false };
const next = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  sku: "PAP-80", name: "Paper", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 100, autoRestock: true, ...overrides,
});
const used = { ...emptyReferenceCounts(), stockMovements: 3, equipmentUnits: 1 };

describe("describing references", () => {
  it("lists only the kinds that exist, with correct plurals", () => {
    expect(describeReferences(emptyReferenceCounts())).toBe("no records");
    expect(describeReferences({ ...emptyReferenceCounts(), jobItems: 1 })).toBe("1 job line");
    expect(describeReferences({ ...emptyReferenceCounts(), jobItems: 2, stockMovements: 1, reservations: 1200 })).toBe(
      "1 stock movement, 1,200 job reservations and 2 job lines",
    );
  });
});

describe("structural locks", () => {
  it("lock nothing for an unused product", () => {
    expect(structuralLocks(current, emptyReferenceCounts())).toEqual({ sku: null, baseUnit: null, serialised: null });
    expect(lockedChanges(current, next({ sku: "NEW", baseUnit: "each", serialised: true }), emptyReferenceCounts())).toEqual({});
  });

  it("refuse only the fields that actually change on a used product", () => {
    expect(lockedChanges(current, next(), used)).toEqual({});
    expect(Object.keys(lockedChanges(current, next({ sku: "PAP-81" }), used))).toEqual(["sku"]);
    expect(Object.keys(lockedChanges(current, next({ baseUnit: "each", serialised: true }), used))).toEqual(["baseUnit", "serialised"]);
  });

  it("explain themselves in terms of the records involved", () => {
    const locks = structuralLocks(current, used);
    expect(locks.baseUnit).toContain("3 stock movements and 1 equipment unit");
    expect(locks.baseUnit).toContain("rolls");
    expect(locks.serialised).toContain("switched on");
    expect(structuralLocks({ ...current, serialised: true }, used).serialised).toContain("switched off");
  });

  it("allow descriptive, minimum and pack changes on a used product", () => {
    expect(lockedChanges(current, next({ name: "Other", packUnit: null, packSize: null, vanMinimum: 5, autoRestock: false }), used)).toEqual({});
  });
});

describe("deletion", () => {
  it("is allowed with no references and refused with any, naming the product", () => {
    expect(deletionBlock({ sku: "X-1", name: "X" }, emptyReferenceCounts())).toBeNull();
    expect(deletionBlock({ sku: "X-1", name: "Xylo" }, used)).toMatch(/Xylo \(X-1\) can't be deleted: 3 stock movements and 1 equipment unit/);
  });
});

describe("restock policy changes", () => {
  it("are the minimum and the automatic switch only", () => {
    const base = { vanMinimum: 3, autoRestock: true };
    expect(changesRestockPolicy(base, { ...base })).toBe(false);
    expect(changesRestockPolicy(base, { ...base, vanMinimum: 4 })).toBe(true);
    expect(changesRestockPolicy(base, { ...base, autoRestock: false })).toBe(true);
  });
});
