// Test fixtures only: invented vans and pick lists shaped like API responses.
// Never imported by application code.
import type { PickQuantityDto, RestockItemDto, RestockJobDto } from "@/lib/contracts/restocking";

export function pick(quantity: number, unit: "each" | "paper"): PickQuantityDto {
  if (unit === "each") {
    return { quantity, baseUnit: "each", packUnit: null, packSize: null, fullPacks: null, looseUnits: null, packsRoundedUp: null, label: `${quantity}` };
  }
  const fullPacks = Math.floor(quantity / 50);
  const looseUnits = quantity % 50;
  const parts = [fullPacks > 0 ? `${fullPacks} ${fullPacks === 1 ? "box" : "boxes"}` : null, looseUnits > 0 || fullPacks === 0 ? `${looseUnits} ${looseUnits === 1 ? "roll" : "rolls"}` : null];
  return {
    quantity,
    baseUnit: "roll",
    packUnit: "box",
    packSize: 50,
    fullPacks,
    looseUnits,
    packsRoundedUp: Math.ceil(quantity / 50),
    label: parts.filter(Boolean).join(" + "),
  };
}

function item(overrides: Partial<RestockItemDto> & Pick<RestockItemDto, "productId" | "sku" | "name" | "pick">): RestockItemDto {
  return { outstanding: overrides.pick.quantity, collected: 0, vanMinimum: 0, working: 0, balanceNeedsReview: false, ...overrides };
}

const KITCHEN_DISPLAY_EXCLUSION = {
  productId: "prd-kds",
  sku: "TEST-KDS",
  name: "Test kitchen display",
  vanMinimum: 1,
  working: 0,
  baseUnit: "each",
  needsReview: true,
  note: "Provisionally excluded: displays ship direct. Needs an agreed decision.",
};

/** T-B: paper short by 75 rolls (outstanding deliberately not min − working, to prove the UI shows the backend's number). */
export const paperJob: RestockJobDto = {
  id: "rj-b",
  van: { id: "van-b", code: "T-B", status: "ACTIVE", technician: { id: "t-b", name: "Driver of T-B" } },
  status: "OPEN",
  closeReason: null,
  createdAt: "2026-10-16T08:00:00.000Z",
  updatedAt: "2026-10-16T09:30:00.000Z",
  items: [
    item({ productId: "prd-paper", sku: "TEST-PAP", name: "Test paper", pick: pick(75, "paper"), vanMinimum: 100, working: 25 }),
    item({ productId: "prd-cable", sku: "TEST-CBL", name: "Test cable", pick: pick(5, "each"), outstanding: 5, vanMinimum: 10, working: 4 }),
  ],
  brokenAwaitingReturn: [
    { productId: "prd-printer", sku: "TEST-PRN", name: "Test printer", quantity: 2, baseUnit: "each", serials: ["DEAD-1"] },
  ],
  policyExclusions: [KITCHEN_DISPLAY_EXCLUSION],
  returns: [],
};

/** T-A: one printer to collect, part of an earlier collection already received, a negative imported count. */
export const printerJob: RestockJobDto = {
  id: "rj-a",
  van: { id: "van-a", code: "T-A", status: "ACTIVE", technician: null },
  status: "OPEN",
  closeReason: null,
  createdAt: "2026-10-15T08:00:00.000Z",
  updatedAt: "2026-10-16T10:00:00.000Z",
  items: [
    item({ productId: "prd-printer", sku: "TEST-PRN", name: "Test printer", pick: pick(1, "each"), vanMinimum: 3, working: -2, balanceNeedsReview: true }),
    item({ productId: "prd-paper", sku: "TEST-PAP", name: "Test paper", pick: pick(0, "paper"), outstanding: 0, collected: 100, vanMinimum: 100, working: 100 }),
  ],
  brokenAwaitingReturn: [],
  policyExclusions: [],
  returns: [{ productId: "prd-printer", sku: "TEST-PRN", quantity: 1, serials: ["OLD-1"], returnedBy: "Nadia", returnedAt: "2026-10-16T09:00:00.000Z" }],
};

/** T-C: everything collected; only broken equipment left to take back. */
export const collectedJob: RestockJobDto = {
  ...printerJob,
  id: "rj-c",
  van: { id: "van-c", code: "T-C", status: "ACTIVE", technician: { id: "t-c", name: "Driver of T-C" } },
  items: [item({ productId: "prd-paper", sku: "TEST-PAP", name: "Test paper", pick: pick(0, "paper"), outstanding: 0, collected: 50, vanMinimum: 100, working: 100 })],
  brokenAwaitingReturn: [{ productId: "prd-printer", sku: "TEST-PRN", name: "Test printer", quantity: 1, baseUnit: "each", serials: [] }],
  returns: [],
};
