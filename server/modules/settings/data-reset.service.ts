import "server-only";
import type { DemoCategoryCount } from "@/lib/contracts/demo-data";
import type { DataResetPreview } from "@/lib/contracts/data-reset";
import { prisma } from "@/server/db/prisma";
import { runInTransaction, type Tx } from "@/server/db/transaction";
import { invalidState } from "@/server/http/errors";

// Explicit allowlist. Authentication and Prisma migration tables are intentionally absent.
const DATA_TABLES = [
  "demo_record_claims", "demo_records",
  "job_completion_lines", "job_completions", "reservations", "stock_movements", "stock_corrections",
  "restock_returns", "restock_items", "restock_jobs", "job_items", "jobs",
  "import_issues", "import_source_rows", "import_batches",
  "equipment_units", "stock_balances", "vans", "technicians", "branches", "customers", "locations", "products",
] as const;

const PRESERVED = ["User accounts", "Active sessions", "Login security records", "Migration history"];

export async function dataResetPreview(): Promise<DataResetPreview> {
  return buildPreview(prisma);
}

export async function clearAllApplicationData(expected: DemoCategoryCount[]) {
  const cleared = await runInTransaction(async (tx) => {
    // Prevent any application writer from changing the confirmed counts before the truncate.
    await tx.$executeRawUnsafe(`LOCK TABLE ${DATA_TABLES.map(quoteIdentifier).join(", ")} IN ACCESS EXCLUSIVE MODE`);
    const current = await buildPreview(tx);
    if (JSON.stringify(current.counts) !== JSON.stringify(expected)) {
      throw invalidState("Application data changed after confirmation. Review the refreshed counts and confirm again.", { expected, current: current.counts });
    }
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${DATA_TABLES.map(quoteIdentifier).join(", ")}`);
    return current.counts;
  }, { timeoutMs: 30_000 });

  return {
    message: "All application data was cleared. User accounts and authentication state were preserved.",
    cleared,
    preview: await dataResetPreview(),
  };
}

async function buildPreview(db: Tx | typeof prisma): Promise<DataResetPreview> {
  const [products, customers, fleet, inventory, dispatch, restocking, imports, provenance] = await Promise.all([
    sumCounts(db.product.count(), "Products"),
    sumCounts(db.customer.count(), "Customers", db.branch.count()),
    sumCounts(db.technician.count(), "Fleet records", db.van.count()),
    sumCounts(db.location.count(), "Inventory and stock history", db.stockBalance.count(), db.equipmentUnit.count(), db.stockMovement.count(), db.stockCorrection.count(), db.reservation.count()),
    sumCounts(db.job.count(), "Dispatch requests and jobs", db.jobItem.count(), db.jobCompletion.count(), db.jobCompletionLine.count()),
    sumCounts(db.restockJob.count(), "Restocking records", db.restockItem.count(), db.restockReturn.count()),
    sumCounts(db.importBatch.count(), "Import records", db.importSourceRow.count(), db.importIssue.count()),
    sumCounts(db.demoRecord.count(), "Demo provenance", db.demoRecordClaim.count()),
  ]);
  const counts = [products, customers, fleet, inventory, dispatch, restocking, imports, provenance];
  return { counts, total: counts.reduce((sum, item) => sum + item.count, 0), preserved: PRESERVED };
}

async function sumCounts(first: Promise<number>, category: string, ...rest: Promise<number>[]): Promise<DemoCategoryCount> {
  const values = await Promise.all([first, ...rest]);
  return { category, count: values.reduce((sum, count) => sum + count, 0) };
}

function quoteIdentifier(value: string) { return `"${value}"`; }
