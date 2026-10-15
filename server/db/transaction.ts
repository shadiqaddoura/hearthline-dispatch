import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";

export type Tx = Prisma.TransactionClient;

/**
 * Runs `work` in one database transaction. Anything thrown rolls back every
 * write, so an operation can never leave partial stock or reservation changes.
 */
export function runInTransaction<T>(work: (tx: Tx) => Promise<T>, options: { timeoutMs?: number } = {}) {
  return prisma.$transaction(work, { timeout: options.timeoutMs ?? 15_000, maxWait: 10_000 });
}

// ─── Locking ────────────────────────────────────────────────────────────────
//
// Every operation that can change availability takes row locks in one fixed order:
//
//   1. the job row (if the operation is about a job)
//   2. the location rows it touches, sorted by id
//   3. the open restock job of a van (only while its location is already locked)
//
// Locking the location row serialises all stock and reservation changes for that
// van: "check availability, then reserve" cannot interleave with another assignment,
// transfer or correction on the same van. A fixed order prevents deadlocks.

export async function lockJob(tx: Tx, jobId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM jobs WHERE id = ${jobId} FOR UPDATE`;
  return rows.length > 0;
}

export async function lockLocations(tx: Tx, locationIds: string[]) {
  const ids = [...new Set(locationIds)].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM locations WHERE id = ANY(${ids}::text[]) ORDER BY id FOR UPDATE`;
}

export async function lockRestockJob(tx: Tx, restockJobId: string) {
  await tx.$queryRaw`SELECT id FROM restock_jobs WHERE id = ${restockJobId} FOR UPDATE`;
}
