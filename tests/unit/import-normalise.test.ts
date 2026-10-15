import { describe, expect, it } from "vitest";
import { PRODUCT_ALIASES } from "@/server/modules/import/aliases";
import {
  createProductResolver,
  parseDay,
  parseJobKind,
  parseJobStatus,
  parseParts,
  parseQuantity,
} from "@/server/modules/import/normalise";

const resolve = createProductResolver(Object.keys(PRODUCT_ALIASES), PRODUCT_ALIASES);
const paper = { packUnit: "box", packSize: 50 };
const each = { packUnit: null, packSize: null };

describe("import normalisation", () => {
  it("reads every date format in the book as the same day", () => {
    for (const value of ["2026-08-17", "17/08/2026", "17-Aug-26"]) {
      expect(parseDay(value)).toMatchObject({ ok: true, value: "2026-08-17" });
    }
    expect(parseDay(46246)).toMatchObject({ ok: true, value: "2026-08-12" });
    expect(parseDay("31/02/2026").ok).toBe(false);
    expect(parseDay(null).ok).toBe(false);
  });

  it("reads quantities without inventing missing ones", () => {
    expect(parseQuantity(150, paper)).toMatchObject({ ok: true, value: 150 });
    expect(parseQuantity("3 boxes", paper)).toMatchObject({ ok: true, value: 150 });
    expect(parseQuantity("2 bx", paper)).toMatchObject({ ok: true, value: 100 });
    expect(parseQuantity("two", each)).toMatchObject({ ok: true, value: 2 });
    expect(parseQuantity(-2, each)).toMatchObject({ ok: true, value: -2 });
    expect(parseQuantity("-", each).ok).toBe(false);
    expect(parseQuantity("2 bx", each).ok).toBe(false);
  });

  it("resolves product spellings and item names", () => {
    for (const name of ["Printer 80mm", "prn80", "PRN-80 ", "receipt printers", "Printer 80"]) expect(resolve(name)).toBe("PRN-80");
    expect(resolve("PDQ")).toBe("PAY-A9");
    expect(resolve("terminals")).toBe("POS-T2");
    expect(resolve("toaster")).toBeNull();
  });

  it("reads every parts format in the Jobs sheet", () => {
    expect(parseParts("POS-T2 x2 + PRN-80 x2 + CBL-ETH x4", resolve).lines).toEqual([
      { sku: "POS-T2", quantity: 2 },
      { sku: "PRN-80", quantity: 2 },
      { sku: "CBL-ETH", quantity: 4 },
    ]);
    expect(parseParts("1x PRN-80, 2 Card reader, PAY-A9 x1, 1 PDQ", resolve).lines).toEqual([
      { sku: "PRN-80", quantity: 1 },
      { sku: "PAY-A9", quantity: 4 },
    ]);
    expect(parseParts("1 kitchen printer, 3 widgets", resolve)).toEqual({
      lines: [{ sku: "PRN-K", quantity: 1 }],
      unrecognised: ["3 widgets"],
    });
  });

  it("maps only statuses whose meaning is clear", () => {
    expect(parseJobStatus("Closed")).toBe("COMPLETED");
    expect(parseJobStatus("booked")).toBe("BOOKED");
    expect(parseJobStatus("pending parts")).toBeNull();
    expect(parseJobStatus("?")).toBeNull();
    expect(parseJobStatus(null)).toBeNull();
  });

  it("keeps 'Restock?' apart from real hub runs", () => {
    expect(parseJobKind("Restock?")).toBe("UNCLEAR_RESTOCK");
    expect(parseJobKind("Restock")).toBe("HUB_RUN");
    expect(parseJobKind("hub run")).toBe("HUB_RUN");
    expect(parseJobKind("swap")).toBe("REPAIR");
  });
});
