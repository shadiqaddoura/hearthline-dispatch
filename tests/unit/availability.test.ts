import { describe, expect, it } from "vitest";
import { availableQuantity, needsVerificationQuantity } from "@/server/modules/inventory/availability";

describe("stock availability", () => {
  it("is working stock minus active reservations", () => {
    expect(availableQuantity(false, { working: 10, broken: 0, reserved: 4, verifiedWorking: 0 })).toBe(6);
  });

  it("never counts broken stock", () => {
    // Casa Verde: the van "had three printers", two of them dead pull-outs.
    expect(availableQuantity(false, { working: 1, broken: 2, reserved: 0, verifiedWorking: 0 })).toBe(1);
  });

  it("counts only verified units for serialised products", () => {
    const figures = { working: 5, broken: 0, reserved: 1, verifiedWorking: 2 };
    expect(availableQuantity(true, figures)).toBe(1);
    expect(needsVerificationQuantity(true, figures)).toBe(3);
    expect(needsVerificationQuantity(false, figures)).toBeNull();
  });

  it("is never negative, even with an imported negative balance", () => {
    expect(availableQuantity(false, { working: -2, broken: 0, reserved: 0, verifiedWorking: 0 })).toBe(0);
    expect(availableQuantity(true, { working: 1, broken: 0, reserved: 3, verifiedWorking: 1 })).toBe(0);
  });
});
