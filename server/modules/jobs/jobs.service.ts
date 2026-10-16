import "server-only";
import { prisma } from "@/server/db/prisma";
import { lockJob, lockLocations, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, invalidState, notFound } from "@/server/http/errors";
import { reservationShortfall } from "@/server/modules/inventory/availability";
import { closeActiveReservations, loadStockFigures } from "@/server/modules/inventory/inventory.repository";
import { moveStock } from "@/server/modules/inventory/stock-ledger";
import { recalculateRestockForLocations } from "@/server/modules/restocking/restock.service";
import { refreshBlockingReasons } from "@/server/modules/dispatch/dispatch.service";
import { fromIsoDate, todayIsoDate } from "@/lib/dates";
import type {
  CancelJobRequest,
  CompleteJobRequest,
  CompleteJobResult,
  CreateJobRequest,
  JobDto,
  ScheduleJobRequest,
} from "@/lib/contracts/jobs";
import type { JobStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { findJob, jobInclude, OPEN_STATUSES, toJobDto } from "./jobs.repository";
import { assertSlotAvailable } from "./schedule";

// Job lifecycle: REQUESTED → ASSIGNED → IN_PROGRESS → COMPLETED, or → CANCELLED.
// Assignment and reassignment live in the dispatch module.

export async function listJobs(filter: { status?: JobStatus; open?: boolean } = {}): Promise<JobDto[]> {
  const jobs = await prisma.job.findMany({
    where: { status: filter.open ? { in: OPEN_STATUSES } : filter.status },
    include: jobInclude,
    orderBy: [{ scheduledFor: { sort: "asc", nulls: "last" } }, { sequence: { sort: "asc", nulls: "last" } }, { requestedOn: "asc" }],
  });
  return jobs.map((job) => toJobDto(job));
}

export async function listCustomers() {
  return prisma.customer.findMany({ include: { branches: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } });
}

export async function getJob(jobId: string): Promise<JobDto> {
  return toJobDto(await findJob(prisma, jobId));
}

export async function createJob(input: CreateJobRequest): Promise<JobDto> {
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId } });
  if (!branch) throw notFound("Branch", input.branchId);
  const productIds = input.items.map((i) => i.productId);
  const found = await prisma.product.count({ where: { id: { in: productIds } } });
  if (found !== productIds.length) throw new AppError("VALIDATION_FAILED", "One or more products do not exist");

  let jobId: string;
  try {
    const job = await prisma.job.create({
      data: {
        reference: input.reference ?? generateReference(),
        type: input.type,
        branchId: input.branchId,
        requestedOn: fromIsoDate(input.requestedOn),
        notes: input.notes,
        items: { create: input.items },
      },
    });
    jobId = job.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", `Job reference ${input.reference} already exists`);
    }
    throw error;
  }

  // Sets a blocking reason straight away if no van could take it.
  await refreshBlockingReasons();
  return getJob(jobId);
}

/**
 * Manual scheduling: the planned day and the position in the van's day. Never touches
 * requestedOn, reservations or stock. Locks job → van location, the documented order.
 */
export async function scheduleJob(jobId: string, input: ScheduleJobRequest): Promise<JobDto> {
  await runInTransaction(async (tx) => {
    await lockJob(tx, jobId);
    const job = await findJob(tx, jobId);
    if (job.status !== "REQUESTED" && job.status !== "ASSIGNED") {
      throw invalidState(`A ${job.status.toLowerCase()} job cannot be rescheduled`);
    }
    if (job.van) await lockLocations(tx, [job.van.locationId]);
    await assertSlotAvailable(tx, {
      jobId,
      van: job.van,
      scheduledFor: input.scheduledFor,
      sequence: input.sequence,
      currentScheduledFor: job.scheduledFor,
    });
    await tx.job.update({
      where: { id: jobId },
      data: {
        scheduledFor: input.scheduledFor ? fromIsoDate(input.scheduledFor) : null,
        sequence: input.sequence,
      },
    });
  });
  return getJob(jobId);
}

export async function startJob(jobId: string): Promise<JobDto> {
  await runInTransaction(async (tx) => {
    await lockJob(tx, jobId);
    const job = await findJob(tx, jobId);
    if (job.status !== "ASSIGNED") throw invalidState(`Only an assigned job can start (this one is ${job.status})`);
    await tx.job.update({ where: { id: jobId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  });
  return getJob(jobId);
}

/** Cancels an open job and releases its reservations. Stock does not move. */
export async function cancelJob(jobId: string, input: CancelJobRequest): Promise<JobDto> {
  await runInTransaction(async (tx) => {
    await lockJob(tx, jobId);
    const job = await findJob(tx, jobId);
    if (!OPEN_STATUSES.includes(job.status)) throw invalidState(`A ${job.status.toLowerCase()} job cannot be cancelled`);

    if (job.van) await lockLocations(tx, [job.van.locationId]);
    await closeActiveReservations(tx, jobId, "RELEASED", `Cancelled by ${input.cancelledBy}: ${input.reason}`);
    await tx.job.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: input.reason,
        blockingReason: null,
        blockingDetail: null,
      },
    });
  });

  await refreshBlockingReasons();
  return getJob(jobId);
}

/**
 * Records what actually happened on site, in one transaction:
 *   - delivered/installed stock leaves the van's WORKING balance,
 *   - dead units collected join the van's BROKEN balance,
 *   - the job's reservations are consumed,
 *   - the van's restock list is recalculated.
 *
 * Usage may exceed this job's reservation only from free stock: if what was delivered
 * would leave another assigned job's reservation uncovered, completion is refused and
 * nothing changes. For serialised products the check runs on the units actually
 * taken, so naming the installed serials matters.
 *
 * Safe to retry: the job row is locked first, and a job that is already COMPLETED
 * returns `alreadyCompleted: true` without touching stock. JobCompletion.jobId is
 * unique as a second line of defence.
 */
export async function completeJob(jobId: string, input: CompleteJobRequest): Promise<CompleteJobResult> {
  const alreadyCompleted = await runInTransaction(async (tx) => {
    await lockJob(tx, jobId);
    const job = await findJob(tx, jobId);
    if (job.status === "COMPLETED") return true;
    if (job.status !== "ASSIGNED" && job.status !== "IN_PROGRESS") {
      throw invalidState(`A ${job.status.toLowerCase()} job cannot be completed`);
    }
    if (!job.van) throw invalidState("The job has no van");

    const van = { locationId: job.van.locationId };
    const branch = { branchId: job.branchId };
    await lockLocations(tx, [van.locationId]);
    const deliveredProducts = [...new Set(input.delivered.map((line) => line.productId))];
    // Measured while this job's own reservations still count, so its own share is allowed.
    const shortfallBefore = await reservationShortfalls(tx, van.locationId, deliveredProducts);
    await closeActiveReservations(tx, jobId, "CONSUMED", "Job completed");

    const lines = [];
    for (const line of input.delivered) {
      const movement = await moveStock(tx, {
        type: "JOB_DELIVERY",
        productId: line.productId,
        condition: "WORKING",
        quantity: line.quantity,
        from: van,
        to: branch,
        serials: line.serials,
        unitPreference: "VERIFIED_FIRST",
        performedBy: input.completedBy,
        jobId,
      });
      lines.push({ productId: line.productId, kind: "DELIVERED" as const, quantity: line.quantity, serials: movement.serials });
    }
    for (const line of input.collectedBroken) {
      const movement = await moveStock(tx, {
        type: "BROKEN_COLLECTION",
        productId: line.productId,
        condition: "BROKEN",
        quantity: line.quantity,
        from: branch,
        to: van,
        serials: line.serials,
        performedBy: input.completedBy,
        jobId,
      });
      lines.push({ productId: line.productId, kind: "COLLECTED_BROKEN" as const, quantity: line.quantity, serials: movement.serials });
    }

    await assertOtherReservationsKept(tx, job.reference, job.van.code, van.locationId, shortfallBefore);

    await tx.jobCompletion.create({
      data: { jobId, completedBy: input.completedBy, note: input.note, lines: { create: lines } },
    });
    await tx.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED", completedOn: fromIsoDate(todayIsoDate()), blockingReason: null, blockingDetail: null },
    });
    await recalculateRestockForLocations(tx, [van.locationId]);
    return false;
  });

  if (!alreadyCompleted) await refreshBlockingReasons();
  return { job: await getJob(jobId), alreadyCompleted };
}

/** Per product: reserved quantity at the location that assignable stock does not cover. */
async function reservationShortfalls(tx: Tx, locationId: string, productIds: string[]) {
  const products = await tx.product.findMany({ where: { id: { in: productIds } } });
  const figures = await loadStockFigures(tx, [locationId]);
  return new Map(products.map((p) => [p.id, { sku: p.sku, shortfall: reservationShortfall(p.serialised, figures.get(locationId, p.id)) }]));
}

/**
 * After this job's stock has left, the other jobs' reservations must be as well covered
 * as before. Called inside the completion transaction: throwing rolls everything back.
 */
async function assertOtherReservationsKept(
  tx: Tx,
  reference: string,
  vanCode: string,
  locationId: string,
  before: Map<string, { sku: string; shortfall: number }>,
) {
  const after = await reservationShortfalls(tx, locationId, [...before.keys()]);
  for (const [productId, { sku, shortfall }] of after) {
    const added = shortfall - (before.get(productId)?.shortfall ?? 0);
    if (added <= 0) continue;
    const others = await tx.reservation.findMany({
      where: { locationId, productId, status: "ACTIVE" },
      include: { job: { select: { reference: true } } },
    });
    const references = [...new Set(others.map((r) => r.job.reference))];
    throw new AppError(
      "INSUFFICIENT_STOCK",
      `Completing ${reference} as recorded would use ${added} ${sku} on ${vanCode} reserved for ${references.join(", ")}. ` +
        "Record only what this job used (for serialised items, name the serials installed), or reassign the other job first.",
      { productId, sku, shortBy: added, reservedFor: references },
    );
  }
}

function generateReference() {
  return `HL-${Date.now().toString(36).toUpperCase()}`;
}
