// How restock data is described to people. Independent of any UI library.
// Quantities and the restock calculation come from the API; this only words them.
import type { PickQuantityDto, RestockItemDto, RestockJobDto } from "@/lib/contracts/restocking";
import { formatQuantity } from "@/lib/products/catalogue";

export interface PickWording {
  /** How the hub picks it, e.g. "1 box + 25 rolls". */
  practical: string;
  /** The exact stored quantity, e.g. "75 rolls". Shown whenever it differs from `practical`. */
  exact: string | null;
  /** Only if the hub issues whole packs, e.g. "2 boxes (25 rolls more than needed)". */
  wholePacksOnly: string | null;
}

/** "15 rolls", "1 roll"; products counted singly ("each") as a plain number, e.g. "2". */
export function formatAmount(quantity: number, baseUnit: string): string {
  return baseUnit === "each" ? `${quantity}` : formatQuantity(quantity, baseUnit);
}

/** Words a pick quantity from the backend's breakdown, never rounding it. */
export function describePick(pick: PickQuantityDto): PickWording {
  const exact = formatAmount(pick.quantity, pick.baseUnit);
  const practical = pick.label === `${pick.quantity}` ? exact : pick.label;
  let wholePacksOnly: string | null = null;
  if (pick.packUnit && pick.packSize && pick.packsRoundedUp !== null && (pick.looseUnits ?? 0) > 0) {
    const extra = pick.packsRoundedUp * pick.packSize - pick.quantity;
    wholePacksOnly = `${formatQuantity(pick.packsRoundedUp, pick.packUnit)} (${formatQuantity(extra, pick.baseUnit)} more than needed)`;
  }
  return { practical, exact: practical === exact ? null : exact, wholePacksOnly };
}

export interface RestockProgress {
  /** Products with something left to collect. */
  toCollect: number;
  /** Products partly or fully collected under this job already. */
  collectedProducts: number;
  /** Broken units in the van waiting to go back. */
  brokenUnits: number;
}

export function restockProgress(job: Pick<RestockJobDto, "items" | "brokenAwaitingReturn">): RestockProgress {
  return {
    toCollect: job.items.filter((i) => i.outstanding > 0).length,
    collectedProducts: job.items.filter((i) => i.collected > 0).length,
    brokenUnits: job.brokenAwaitingReturn.reduce((sum, b) => sum + b.quantity, 0),
  };
}

/** "3 products to collect", "1 product to collect", "Nothing left to collect". */
export function toCollectLabel(count: number): string {
  if (count === 0) return "Nothing left to collect";
  return `${count} ${count === 1 ? "product" : "products"} to collect`;
}

/** "1 broken unit to return", "2 broken units to return". */
export function brokenLabel(units: number): string {
  return `${units} broken ${units === 1 ? "unit" : "units"} to return`;
}

/** Items still to collect first, then items already fully collected, each by SKU. */
export function orderPickList(items: RestockItemDto[]): RestockItemDto[] {
  return [...items].sort((a, b) => Number(b.outstanding > 0) - Number(a.outstanding > 0) || a.sku.localeCompare(b.sku));
}

/** Vans in code order (the API lists newest jobs first). */
export function orderByVan(jobs: RestockJobDto[]): RestockJobDto[] {
  return [...jobs].sort((a, b) => a.van.code.localeCompare(b.van.code));
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/London",
});

/** "16 Oct 2026, 14:05" in London time, or the raw value if it isn't a timestamp. */
export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}
