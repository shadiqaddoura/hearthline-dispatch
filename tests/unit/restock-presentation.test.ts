import { describe, expect, it } from "vitest";
import {
  describePick,
  formatAmount,
  orderByVan,
  orderPickList,
  restockProgress,
  toCollectLabel,
} from "@/lib/restocking/presentation";
import { collectedJob, paperJob, pick, printerJob } from "../support/restock-fixtures";

describe("describePick", () => {
  it("shows a partial box as boxes plus rolls, with the exact roll count", () => {
    expect(describePick(pick(75, "paper"))).toEqual({
      practical: "1 box + 25 rolls",
      exact: "75 rolls",
      wholePacksOnly: "2 boxes (25 rolls more than needed)",
    });
  });

  it("shows whole boxes without inventing a rounding note", () => {
    expect(describePick(pick(100, "paper"))).toEqual({ practical: "2 boxes", exact: "100 rolls", wholePacksOnly: null });
  });

  it("keeps less than a box in rolls, and only offers whole boxes as an explicit alternative", () => {
    expect(describePick(pick(40, "paper"))).toEqual({
      practical: "40 rolls",
      exact: null,
      wholePacksOnly: "1 box (10 rolls more than needed)",
    });
  });

  it("shows products counted singly as plain numbers", () => {
    expect(describePick(pick(2, "each"))).toEqual({ practical: "2", exact: null, wholePacksOnly: null });
    expect(formatAmount(3, "each")).toBe("3");
    expect(formatAmount(1, "roll")).toBe("1 roll");
  });
});

describe("job summaries", () => {
  it("counts products to collect, products already collected and broken units separately", () => {
    expect(restockProgress(paperJob)).toEqual({ toCollect: 2, collectedProducts: 0, brokenUnits: 2 });
    expect(restockProgress(printerJob)).toEqual({ toCollect: 1, collectedProducts: 1, brokenUnits: 0 });
    expect(restockProgress(collectedJob)).toEqual({ toCollect: 0, collectedProducts: 1, brokenUnits: 1 });
    expect(toCollectLabel(0)).toBe("Nothing left to collect");
    expect(toCollectLabel(1)).toBe("1 product to collect");
  });

  it("orders vans by code and pick lists with outstanding items first", () => {
    expect(orderByVan([paperJob, collectedJob, printerJob]).map((j) => j.van.code)).toEqual(["T-A", "T-B", "T-C"]);
    expect(orderPickList(printerJob.items).map((i) => i.sku)).toEqual(["TEST-PRN", "TEST-PAP"]);
  });
});
