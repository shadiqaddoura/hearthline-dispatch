import type { PickQuantityDto } from "@/lib/contracts/restocking";

// Stock is stored in base units (paper: rolls). The hub picks in packs (boxes of 50).
// 65 rolls -> "1 box + 15 rolls" (2 boxes if only whole boxes are issued).

export interface PackInfo {
  baseUnit: string;
  packUnit: string | null;
  packSize: number | null;
}

export function toPickQuantity(quantity: number, product: PackInfo): PickQuantityDto {
  const { baseUnit, packUnit, packSize } = product;
  if (!packUnit || !packSize || packSize <= 1) {
    return {
      quantity,
      baseUnit,
      packUnit: null,
      packSize: null,
      fullPacks: null,
      looseUnits: null,
      packsRoundedUp: null,
      label: baseUnit === "each" ? `${quantity}` : countOf(quantity, baseUnit),
    };
  }

  const fullPacks = Math.floor(quantity / packSize);
  const looseUnits = quantity % packSize;
  const parts = [];
  if (fullPacks > 0) parts.push(countOf(fullPacks, packUnit));
  if (looseUnits > 0 || fullPacks === 0) parts.push(countOf(looseUnits, baseUnit));

  return {
    quantity,
    baseUnit,
    packUnit,
    packSize,
    fullPacks,
    looseUnits,
    packsRoundedUp: Math.ceil(quantity / packSize),
    label: parts.join(" + "),
  };
}

/** Converts a pack count (e.g. "2 boxes") to base units. */
export function packsToBaseUnits(packs: number, packSize: number): number {
  return packs * packSize;
}

function countOf(n: number, unit: string) {
  if (n === 1) return `1 ${unit}`;
  return `${n} ${unit.endsWith("x") ? `${unit}es` : `${unit}s`}`;
}
