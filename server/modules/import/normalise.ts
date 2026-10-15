import type { Cell } from "./read-workbook";
import { aliasKey, NUMBER_WORDS } from "./aliases";

// Step 2 of the import: turn the known formats into clean values.
// Each parser returns either a value or a reason it could not; none of them invent data.

export type Parsed<T> = { ok: true; value: T; note?: string } | { ok: false; reason: string };

const ok = <T>(value: T, note?: string): Parsed<T> => ({ ok: true, value, note });
const fail = <T>(reason: string): Parsed<T> => ({ ok: false, reason });

export function text(cell: Cell | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  const value = String(cell).trim();
  return value === "" ? null : value;
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Calendar day as "YYYY-MM-DD". Formats seen in the book:
 *   2026-08-17 · 17/08/2026 (day first: UK business) · 17-Aug-26 · 46246 (Excel serial)
 */
export function parseDay(cell: Cell | undefined): Parsed<string> {
  if (cell === null || cell === undefined || cell === "") return fail("no date");
  if (typeof cell === "number") {
    if (!Number.isInteger(cell) || cell < 40000 || cell > 60000) return fail(`"${cell}" is not a date`);
    const date = new Date(Date.UTC(1899, 11, 30) + cell * 86_400_000);
    return ok(date.toISOString().slice(0, 10), `Excel date number ${cell} read as ${date.toISOString().slice(0, 10)}`);
  }
  const value = String(cell).trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return validDay(+match[1], +match[2], +match[3], value);
  match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return validDay(+match[3], +match[2], +match[1], value);
  match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (match && MONTHS[match[2].toLowerCase()]) return validDay(2000 + +match[3], MONTHS[match[2].toLowerCase()], +match[1], value);
  return fail(`"${value}" is not a recognised date`);
}

function validDay(year: number, month: number, day: number, original: string): Parsed<string> {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail(`"${original}" is not a real date`);
  }
  return ok(date.toISOString().slice(0, 10));
}

// ─── Quantities ─────────────────────────────────────────────────────────────

/**
 * A stock count in the product's base unit. Plain numbers are base units (paper: rolls,
 * as the hub manager's "35 rolls" confirms). "3 boxes" / "2 bx" are converted with the
 * pack size. Number words ("two") are accepted. "-" or blank is not a count.
 */
export function parseQuantity(cell: Cell | undefined, pack: { packUnit: string | null; packSize: number | null }): Parsed<number> {
  if (typeof cell === "number") {
    return Number.isInteger(cell) ? ok(cell) : fail(`"${cell}" is not a whole number`);
  }
  const value = text(cell);
  if (value === null || value === "-") return fail("no quantity given");
  if (/^-?\d+$/.test(value)) return ok(Number(value));

  const word = NUMBER_WORDS[value.toLowerCase()];
  if (word !== undefined) return ok(word, `"${value}" read as ${word}`);

  const packs = value.match(/^(\d+)\s*(boxes|box|bx)\.?$/i);
  if (packs) {
    if (!pack.packSize) return fail(`"${value}" is in boxes but this product has no box size`);
    const quantity = Number(packs[1]) * pack.packSize;
    return ok(quantity, `"${value}" converted to ${quantity} at ${pack.packSize} per ${pack.packUnit}`);
  }
  return fail(`"${value}" is not a recognised quantity`);
}

// ─── Products ───────────────────────────────────────────────────────────────

export type ProductResolver = (name: string) => string | null;

/** Resolves a SKU or item name (including simple plurals) to a canonical SKU. */
export function createProductResolver(skus: string[], aliases: Record<string, string[]>): ProductResolver {
  const lookup = new Map<string, string>();
  for (const sku of skus) lookup.set(aliasKey(sku), sku);
  for (const [sku, names] of Object.entries(aliases)) for (const name of names) lookup.set(aliasKey(name), sku);

  return (name) => {
    const key = aliasKey(name);
    return lookup.get(key) ?? (key.endsWith("s") ? lookup.get(key.slice(0, -1)) ?? null : null);
  };
}

export interface PartLine {
  sku: string;
  quantity: number;
}

/**
 * The Jobs "parts" column. Formats seen:
 *   "1x PRN-80, 2x CBL-ETH" · "PAY-A9 x1" · "POS-T2 x2 + PRN-80 x2" · "2 terminal, 1 cash drawer" · "1 PDQ"
 */
export function parseParts(value: string, resolve: ProductResolver): { lines: PartLine[]; unrecognised: string[] } {
  const lines = new Map<string, number>();
  const unrecognised: string[] = [];

  for (const raw of value.split(/[,+]/)) {
    const fragment = raw.trim();
    if (!fragment) continue;
    const part = splitPart(fragment);
    const sku = part ? resolve(part.name) : null;
    if (!part || part.quantity <= 0 || !sku) {
      unrecognised.push(fragment);
      continue;
    }
    lines.set(sku, (lines.get(sku) ?? 0) + part.quantity);
  }
  return { lines: [...lines].map(([sku, quantity]) => ({ sku, quantity })), unrecognised };
}

function splitPart(fragment: string): { quantity: number; name: string } | null {
  let match = fragment.match(/^(\d+)\s*x\s*(.+)$/i); // "1x PRN-80"
  if (match) return { quantity: Number(match[1]), name: match[2] };
  match = fragment.match(/^(.+?)\s+x\s*(\d+)$/i); // "PAY-A9 x1"
  if (match) return { quantity: Number(match[2]), name: match[1] };
  match = fragment.match(/^(\d+)\s+(.+)$/); // "2 terminal"
  if (match) return { quantity: Number(match[1]), name: match[2] };
  return null;
}

// ─── Serials ────────────────────────────────────────────────────────────────

export function parseSerials(value: string | null): string[] {
  return value ? (value.match(/SN-\d+/gi) ?? []).map((s) => s.toUpperCase()) : [];
}

/** "PRN-80 SN-401038 - in van" · "RTR-4G SN-401156 (dead) in van" · "PAY-A9 SN-401041" */
export function parseFaultyReturned(value: string, resolve: ProductResolver): Parsed<{ sku: string; serial: string }> {
  const match = value.match(/^(.+?)\s+(SN-\d+)/i);
  const sku = match ? resolve(match[1]) : null;
  if (!match || !sku) return fail(`"${value}" does not name a product and serial`);
  return ok({ sku, serial: match[2].toUpperCase() });
}

// ─── Hub runs ───────────────────────────────────────────────────────────────

export type HubRunNote =
  | { kind: "DROPPED"; count: number; serials: string[] }
  | { kind: "PICKED_UP"; quantity: number; itemName: string };

/** "dropped 3 faulty at hub: SN-1, SN-2, SN-3" · "picked up 2 terminals" */
export function parseHubRunNote(value: string | null): HubRunNote | null {
  if (!value) return null;
  const dropped = value.match(/dropped\s+(\d+)\s+faulty\s+at\s+hub\s*:\s*(.+)$/i);
  if (dropped) return { kind: "DROPPED", count: Number(dropped[1]), serials: parseSerials(dropped[2]) };
  const picked = value.match(/^picked up\s+(\d+)\s+(.+)$/i);
  if (picked) return { kind: "PICKED_UP", quantity: Number(picked[1]), itemName: picked[2].trim() };
  return null;
}

// ─── Status and type ────────────────────────────────────────────────────────

export type JobRowKind = "INSTALLATION" | "DELIVERY" | "REPAIR" | "HUB_RUN" | "UNCLEAR_RESTOCK";

export function parseJobKind(value: string | null): JobRowKind | null {
  // Checked before normalising, which would strip the question mark.
  if (value?.trim().endsWith("?")) return "UNCLEAR_RESTOCK";
  switch (aliasKey(value ?? "")) {
    case "install":
    case "installation":
      return "INSTALLATION";
    case "delivery":
      return "DELIVERY";
    case "repair":
    case "fix":
    case "swap": // a repair swaps the dead unit for a working one (case brief)
      return "REPAIR";
    case "restock":
    case "hubrun":
      return "HUB_RUN";
    default:
      return null;
  }
}

/** Only statuses whose meaning is unambiguous are mapped; anything else is kept for review. */
export function parseJobStatus(value: string | null): "COMPLETED" | "BOOKED" | null {
  switch (aliasKey(value ?? "")) {
    case "done":
    case "completed":
    case "closed":
      return "COMPLETED";
    case "scheduled":
    case "booked":
      return "BOOKED";
    default:
      return null;
  }
}

// ─── Vans ───────────────────────────────────────────────────────────────────

export type ParsedVanStatus = { status: "ACTIVE" | "GARAGE" | "SOLD"; since: string | null; isPool: boolean };

/** "active" · "garage since 18/08/2026" · "sold 06/2026" · "pool - whoever's van is off the road" */
export function parseVanStatus(value: string | null): Parsed<ParsedVanStatus> {
  const status = (value ?? "").trim();
  if (/^active$/i.test(status)) return ok({ status: "ACTIVE", since: null, isPool: false });
  if (/^pool\b/i.test(status)) return ok({ status: "ACTIVE", since: null, isPool: true });
  const garage = status.match(/^garage since\s+(.+)$/i);
  if (garage) {
    const day = parseDay(garage[1]);
    return day.ok ? ok({ status: "GARAGE", since: day.value, isPool: false }) : fail(`garage date: ${day.reason}`);
  }
  const sold = status.match(/^sold\s+(\d{1,2})\/(\d{4})$/i);
  if (sold) {
    const since = `${sold[2]}-${sold[1].padStart(2, "0")}-01`;
    return ok({ status: "SOLD", since, isPool: false }, `sold in ${sold[1]}/${sold[2]}; day not given, first of the month used`);
  }
  return fail(`"${status}" is not a recognised van status`);
}
