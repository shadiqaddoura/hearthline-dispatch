import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export type Tx = Prisma.TransactionClient;

/**
 * Runs `work` in one database transaction. Anything thrown rolls back every
 * write, so an operation can never leave partial stock or reservation changes.
 *
 * If PostgreSQL aborts the transaction as a deadlock victim or for a serialization
 * failure, the whole transaction is run again from the start, at most
 * MAX_ATTEMPTS times. Nothing from the aborted attempt was committed, and `work`
 * must not have side effects outside the database, so a retry cannot duplicate
 * movements. This is a safety net: the lock order below is what prevents deadlocks.
 */
export async function runInTransaction<T>(work: (tx: Tx) => Promise<T>, options: { timeoutMs?: number } = {}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(work, { timeout: options.timeoutMs ?? 15_000, maxWait: 10_000 });
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS || !isRetryableConflict(error)) throw error;
      console.warn(`Transaction aborted by the database (${conflictCode(error)}); retrying, attempt ${attempt + 1} of ${MAX_ATTEMPTS}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 25 + Math.random() * 25));
    }
  }
}

const MAX_ATTEMPTS = 3;

/** PostgreSQL deadlock (40P01) or serialization failure (40001), however Prisma wraps it. */
export function isRetryableConflict(error: unknown): boolean {
  return conflictCode(error) !== null;
}

function conflictCode(error: unknown): string | null {
  const e = error as { code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } } | null;
  if (e?.code === "P2034") return "P2034";
  const original = e?.meta?.driverAdapterError?.cause?.originalCode;
  return original === "40P01" || original === "40001" ? original : null;
}

// ─── Locking ────────────────────────────────────────────────────────────────
//
// Rows that several operations can contend for are locked in one global order:
//
//   1. job rows (one, or several sorted by id: a driver change locks the jobs it hands over)
//   2. van location rows, sorted by id
//   3. the technician row (driver changes only)
//   4. equipment unit rows named by serial, sorted (devices arriving at a van; never
//      a device that is in stock in a van, which is refused before locking)
//   5. a product row (editing or deleting a product; it takes every van location first
//      so its restock pick-list refresh follows the same rule as any stock change)
//
// Rows that belong to one van (its balances, its in-stock units, its restock job) are
// only ever written while that van's location is locked, so they cannot form a cycle
// with another transaction; they are taken after the location, in any order.
//
// No operation takes a lock of an earlier kind after a later one: e.g. a driver
// change locks the jobs it will update before the vans, as assignment, reassignment,
// completion and cancellation do. Each operation re-reads what it depends on after
// locking, and fails or retries cleanly if it changed.
//
// Locking the location row serialises all stock and reservation changes for that
// van: "check availability, then reserve" cannot interleave with another assignment,
// transfer or correction on the same van.

export async function lockJob(tx: Tx, jobId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM jobs WHERE id = ${jobId} FOR UPDATE`;
  return rows.length > 0;
}

export async function lockLocations(tx: Tx, locationIds: string[]) {
  const ids = [...new Set(locationIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM locations WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}

/** Serialises driver changes for one technician (a technician drives one van at a time). */
export async function lockTechnician(tx: Tx, technicianId: string) {
  await tx.$queryRaw`SELECT id FROM technicians WHERE id = ${technicianId} FOR UPDATE`;
}

/** Locks existing devices by serial, so two receipts of the same device cannot both pass their checks. */
export async function lockUnitsBySerial(tx: Tx, serials: string[]) {
  const sorted = [...new Set(serials)].sort();
  if (sorted.length === 0) return;
  await tx.$queryRaw`SELECT id FROM equipment_units WHERE "serialNumber" = ANY(${sorted}::text[]) ORDER BY "serialNumber" FOR UPDATE`;
}

export async function lockRestockJob(tx: Tx, restockJobId: string) {
  await tx.$queryRaw`SELECT id FROM restock_jobs WHERE id = ${restockJobId} FOR UPDATE`;
}

/**
 * Locks a product row. Anything that inserts a row referring to the product (a movement,
 * a job line, a reservation, an equipment unit...) takes a shared lock on it for the
 * foreign key check, so while this is held no new reference can appear, and a product that
 * is changed or deleted is judged against references that cannot change under it.
 * Taken after any van location locks, like every other row lock (see the order above).
 */
export async function lockProduct(tx: Tx, productId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
  return rows.length > 0;
}
