import "server-only";
import { prisma } from "@/server/db/prisma";
import { runInTransaction } from "@/server/db/transaction";
import { AppError, notFound } from "@/server/http/errors";
import { assignJob, refreshBlockingReasons } from "@/server/modules/dispatch/dispatch.service";
import { recalculateAllRestockJobs } from "@/server/modules/restocking/restock.service";
import type { ImportBatchDto, ImportIssueDto, ImportSummary } from "@/lib/contracts/imports";
import type { IssueSeverity } from "@/generated/prisma/enums";
import { addIssue, persistPlan } from "./persist-plan";
import { buildImportPlan } from "./plan";
import { readStockBook } from "./read-workbook";

// The import pipeline, independent of HTTP:
//   read rows → normalise → validate/plan → persist → apply bookings → report issues
// Used by scripts/import-book.ts and POST /api/imports.

export async function importStockBook(data: ArrayBuffer, fileName: string, actor = "stock-book import"): Promise<ImportBatchDto> {
  const previous = await prisma.importBatch.findFirst({ orderBy: { importedAt: "desc" } });
  if (previous) {
    // A second load would add the same stock again. Reset the database to re-import.
    throw new AppError("CONFLICT", `The stock book was already imported (batch ${previous.id}); reset the database to import again`);
  }

  const book = await readStockBook(data);
  const plan = buildImportPlan(book);
  const persisted = await runInTransaction((tx) => persistPlan(tx, plan, book, fileName, actor), { timeoutMs: 120_000 });

  // Booked visits go through the normal dispatch rules: a booking only becomes an
  // assignment if the van is in service, has a driver and has eligible stock.
  let assigned = 0;
  const ordered = [...persisted.bookings].sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "") || a.reference.localeCompare(b.reference));
  for (const booking of ordered) {
    const van = booking.vanCode ? await prisma.van.findUnique({ where: { code: booking.vanCode } }) : null;
    if (!van) {
      await runInTransaction((tx) =>
        addIssue(tx, persisted.batchId, booking.ref, {
          severity: "INFO",
          code: "BOOKING_WITHOUT_VAN",
          message: `${booking.reference}: booked without a van; left open for dispatch`,
        }),
      );
      continue;
    }
    try {
      await assignJob(booking.jobId, { vanId: van.id, scheduledFor: booking.scheduledFor ?? undefined, assignedBy: actor });
      assigned++;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      await runInTransaction((tx) =>
        addIssue(tx, persisted.batchId, booking.ref, {
          severity: "WARNING",
          code: "BOOKING_NOT_ASSIGNED",
          message: `${booking.reference}: booked on ${van.code} but not assigned: ${error.message}. Left open with a blocking reason.`,
        }),
      );
    }
  }

  await recalculateAllRestockJobs();
  await refreshBlockingReasons();

  const summary = await buildSummary(persisted.batchId, {
    sourceRows: persisted.sourceRows,
    stockSnapshotsUsed: plan.openingBalances.length,
    stockRowsSuperseded: plan.stockRowsSuperseded,
    movementsApplied: persisted.movementsApplied,
    bookingsAssigned: assigned,
    bookingsBlocked: persisted.bookings.length - assigned,
  });
  await prisma.importBatch.update({ where: { id: persisted.batchId }, data: { summary: { ...summary } } });
  return getImportBatch(persisted.batchId);
}

async function buildSummary(
  batchId: string,
  counts: Pick<ImportSummary, "sourceRows" | "stockSnapshotsUsed" | "stockRowsSuperseded" | "movementsApplied" | "bookingsAssigned" | "bookingsBlocked">,
): Promise<ImportSummary> {
  const [issues, products, vans, technicians, customers, branches, jobs] = await Promise.all([
    prisma.importIssue.groupBy({ by: ["severity"], where: { batchId }, _count: { _all: true } }),
    prisma.product.count(),
    prisma.van.count(),
    prisma.technician.count(),
    prisma.customer.count(),
    prisma.branch.count(),
    prisma.job.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const bySeverity = { INFO: 0, WARNING: 0, ERROR: 0 } as Record<IssueSeverity, number>;
  for (const row of issues) bySeverity[row.severity] = row._count._all;
  return {
    ...counts,
    issues: bySeverity,
    products,
    vans,
    technicians,
    customers,
    branches,
    jobs: Object.fromEntries(jobs.map((j) => [j.status, j._count._all])),
  };
}

export async function listImportBatches(): Promise<ImportBatchDto[]> {
  const batches = await prisma.importBatch.findMany({ orderBy: { importedAt: "desc" } });
  return batches.map(toBatchDto);
}

export async function getImportBatch(batchId: string): Promise<ImportBatchDto> {
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw notFound("Import batch", batchId);
  return toBatchDto(batch);
}

/** The rows that did not fit, with the original row alongside each issue. */
export async function listImportIssues(batchId: string, filter: { severity?: IssueSeverity; sheet?: string }): Promise<ImportIssueDto[]> {
  const issues = await prisma.importIssue.findMany({
    where: { batchId, severity: filter.severity, sourceRow: filter.sheet ? { sheet: filter.sheet } : undefined },
    include: { sourceRow: true },
    orderBy: [{ severity: "desc" }, { sourceRow: { sheet: "asc" } }, { sourceRow: { rowNumber: "asc" } }],
  });
  return issues.map((i) => ({
    id: i.id,
    severity: i.severity,
    code: i.code,
    message: i.message,
    resolved: i.resolved,
    sheet: i.sourceRow?.sheet ?? null,
    rowNumber: i.sourceRow?.rowNumber ?? null,
    raw: i.sourceRow?.raw ?? null,
  }));
}

function toBatchDto(batch: { id: string; fileName: string; importedAt: Date; summary: unknown }): ImportBatchDto {
  return { id: batch.id, fileName: batch.fileName, importedAt: batch.importedAt.toISOString(), summary: batch.summary as ImportSummary };
}
