import { describe, expect, it } from "vitest";
import { calculateRestockNeeds, restockQuantity } from "@/server/modules/restocking/restock-calculator";
import { packsToBaseUnits, toPickQuantity } from "@/server/modules/restocking/pick-quantity";

describe("restock calculation", () => {
  it("is max(0, minimum − working stock)", () => {
    expect(restockQuantity(3, 1)).toBe(2);
    expect(restockQuantity(3, 3)).toBe(0);
    expect(restockQuantity(3, 7)).toBe(0);
  });

  it("treats an imported negative balance as zero and flags it", () => {
    expect(restockQuantity(2, -2)).toBe(2);
    const [need] = calculateRestockNeeds([{ id: "pos", vanMinimum: 2, autoRestock: true }], new Map([["pos", -2]]));
    expect(need).toEqual({ productId: "pos", quantity: 2, balanceNeedsReview: true });
  });

  it("skips products with automatic van restocking switched off", () => {
    const needs = calculateRestockNeeds(
      [
        { id: "kds", vanMinimum: 1, autoRestock: false },
        { id: "cable", vanMinimum: 10, autoRestock: true },
      ],
      new Map(),
    );
    expect(needs.map((n) => n.productId)).toEqual(["cable"]);
  });
});

describe("pick quantities", () => {
  const paper = { baseUnit: "roll", packUnit: "box", packSize: 50 };

  it("splits rolls into full boxes and a partial box", () => {
    expect(toPickQuantity(65, paper)).toMatchObject({ fullPacks: 1, looseUnits: 15, packsRoundedUp: 2, label: "1 box + 15 rolls" });
    expect(toPickQuantity(100, paper)).toMatchObject({ fullPacks: 2, looseUnits: 0, packsRoundedUp: 2, label: "2 boxes" });
    expect(toPickQuantity(40, paper)).toMatchObject({ fullPacks: 0, looseUnits: 40, label: "40 rolls" });
  });

  it("converts boxes to rolls at 50 per box", () => {
    expect(packsToBaseUnits(2, 50)).toBe(100);
  });

  it("leaves unpacked products as plain counts", () => {
    expect(toPickQuantity(3, { baseUnit: "each", packUnit: null, packSize: null })).toMatchObject({ label: "3", fullPacks: null });
  });
});
