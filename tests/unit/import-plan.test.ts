import { describe, expect, it } from "vitest";
import { buildImportPlan } from "@/server/modules/import/plan";
import type { Cell, SourceRow, StockBook } from "@/server/modules/import/read-workbook";

// A miniature stock book reproducing the patterns found in the real one.
let nextRow = 10;
const row = (sheet: string, cells: Record<string, Cell>, rowNumber = nextRow++): SourceRow => ({ sheet, rowNumber, cells });
const job = (cells: Record<string, Cell>) =>
  row("Jobs", { customer: "Casa Verde", branch: "Riverside", zone: "North", status: "Done", ...cells });

function book(): StockBook {
  return {
    minLevels: [
      row("Min levels", { sku: "PRN-80", item: "Receipt printer 80mm", min_per_van: 3, unit: "each", serialised: "yes" }),
      row("Min levels", { sku: "CBL-ETH", item: "Ethernet cable 5m", min_per_van: 10, unit: "each", serialised: "no" }),
      row("Min levels", { sku: "PAP-80", item: "Thermal paper 80mm", min_per_van: 2, unit: "box (50 rolls)", serialised: "no" }),
    ],
    vans: [
      row("Vans", { van: "V01", plate: "KJT 4821", technician: "K. Mansour", zone: "Central", status: "garage since 18/08/2026" }),
      row("Vans", { van: "V02", plate: "LRA 9034", technician: "S. Rahal", zone: "North", status: "active" }),
      row("Vans", { van: "P1", plate: "WQR 6613", technician: "(pool)", zone: null, status: "pool - whoever's van is off the road" }),
    ],
    stock: [
      row("Stock", { van: "V02", sku: "PRN-80", qty: 3, last_counted: "2026-10-12" }, 5),
      // Appended to the bottom later, but counted earlier: must not win, must not be added.
      row("Stock", { van: "V02", sku: "Printer 80mm", qty: 5, last_counted: "05/10/2026" }, 6),
      row("Stock", { van: "V02", sku: "cbl-eth", qty: 15, last_counted: "1-Oct-26" }, 7),
      row("Stock", { van: "V02", sku: "Paper 80mm", qty: "2 bx", last_counted: "2026-10-12" }, 8),
      row("Stock", { van: "P1", sku: "PRN-80", qty: 0, last_counted: "2026-08-07" }, 9),
    ],
    jobs: [
      // Dead unit pulled out before the count and still in the van: inside the count of 3.
      job({ job_ref: "J-1", requested: "2026-09-28", date: "2026-10-01", type: "repair", van: "V02", parts: "1x PRN-80", faulty_returned: "PRN-80 SN-1 - in van" }),
      // Dead unit pulled out, then dropped at the hub before the count: not inside it.
      job({ job_ref: "J-2", requested: "2026-10-01", date: "2026-10-03", type: "swap", van: "LRA 9034", parts: "1x PRN-80", faulty_returned: "PRN-80 SN-2 (dead) in van" }),
      row("Jobs", { job_ref: "J-H", type: "hub run", date: "2026-10-05", van: "V02", status: "Done", notes: "dropped 1 faulty at hub: SN-2" }),
      // After the count: applied.
      job({ job_ref: "J-3", requested: "2026-10-10", date: "14-Oct-26", type: "Install", van: "V02", parts: "1x PRN-80, 2x CBL-ETH" }),
      // Same day as the count: order unknown, not applied.
      job({ job_ref: "J-4", requested: "2026-10-10", date: "12/10/2026", type: "repair", van: "V02", parts: "1x PRN-80" }),
      // Status that cannot be mapped with confidence.
      job({ job_ref: "J-5", requested: "2026-10-14", date: "2026-10-16", type: "repair", van: "V02", status: "pending parts", parts: "1x PRN-80" }),
      row("Jobs", { job_ref: "J-6", type: "Restock?", date: "2026-10-08", van: "V02", notes: "cables" }),
      // Pool van used after an empty count: goes negative, preserved for review.
      job({ job_ref: "J-7", requested: "2026-08-12", date: "2026-08-18", type: "Install", van: "pool", technician: "khalid m", parts: "1x PRN-80" }),
      // Recorded on a van that was in the garage that day.
      job({ job_ref: "J-8", requested: "2026-09-20", date: "2026-09-29", type: "Install", van: "V01", parts: "1x PRN-80" }),
    ],
  };
}

const issueCodes = (plan: ReturnType<typeof buildImportPlan>, code: string) => plan.issues.filter((i) => i.code === code);

describe("import snapshot handling", () => {
  const source = book();
  const plan = buildImportPlan(source);
  const opening = (van: string, sku: string) => plan.openingBalances.find((b) => b.vanCode === van && b.sku === sku);

  it("uses the latest count by date, not the last row, and never adds counts together", () => {
    expect(opening("V02", "PRN-80")).toMatchObject({ countedOn: "2026-10-12", ref: { rowNumber: 5 } });
    expect(issueCodes(plan, "COUNT_SUPERSEDED").map((i) => i.ref?.rowNumber)).toEqual([6]);
  });

  it("takes dead units still in the van out of the working count", () => {
    // Counted 3; SN-1 was pulled out on 1 Oct and is still in the van; SN-2 went back to the hub on 5 Oct.
    expect(opening("V02", "PRN-80")?.quantity).toBe(2);
    expect(plan.brokenInVans.map((u) => u.serial)).toEqual(["SN-1"]);
    expect(plan.brokenAtHub.map((u) => u.serial)).toEqual(["SN-2"]);
  });

  it("applies only movements after the count, and reports same-day ones", () => {
    const applied = plan.workingMovements.map((m) => `${m.label} ${m.sku} ${m.delta}`);
    expect(applied).toEqual(expect.arrayContaining(["J-3 PRN-80 -1", "J-3 CBL-ETH -2"]));
    expect(applied.some((m) => m.startsWith("J-4") || m.startsWith("J-1") || m.startsWith("J-2"))).toBe(false);
    expect(issueCodes(plan, "SAME_DAY_AS_COUNT").some((i) => i.message.startsWith("J-4"))).toBe(true);
  });

  it("converts paper counted in boxes to rolls", () => {
    expect(opening("V02", "PAP-80")?.quantity).toBe(100);
    expect(plan.products.find((p) => p.sku === "PAP-80")).toMatchObject({ vanMinimum: 100, packSize: 50, baseUnit: "roll" });
  });

  it("preserves a balance that goes negative and flags it", () => {
    expect(opening("P1", "PRN-80")?.quantity).toBe(0);
    expect(plan.workingMovements.some((m) => m.label === "J-7" && m.vanCode === "P1")).toBe(true);
    expect(issueCodes(plan, "NEGATIVE_BALANCE")[0].message).toContain("P1 PRN-80");
  });

  it("does not apply stock effects for a van that was in the garage that day", () => {
    expect(plan.workingMovements.some((m) => m.label === "J-8")).toBe(false);
    expect(issueCodes(plan, "VAN_UNAVAILABLE_ON_DATE")[0].ref?.rowNumber).toBe(source.jobs.find((r) => r.cells.job_ref === "J-8")?.rowNumber);
  });

  it("holds unclear statuses and 'Restock?' rows for review instead of guessing", () => {
    expect(plan.jobs.find((j) => j.reference === "J-5")).toMatchObject({ outcome: "REVIEW", sourceStatus: "pending parts" });
    expect(plan.jobs.some((j) => j.reference === "J-6")).toBe(false);
    expect(issueCodes(plan, "UNCLEAR_RESTOCK_ROW")).toHaveLength(1);
  });

  it("puts the garage van's driver in the pool van, as the Read me states", () => {
    expect(plan.vans.find((v) => v.code === "V01")?.technician).toBeNull();
    expect(plan.vans.find((v) => v.code === "P1")?.technician).toBe("Khalid Mansour");
  });
});
