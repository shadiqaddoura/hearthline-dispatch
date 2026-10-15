import "server-only";
import { prisma } from "@/server/db/prisma";
import { lockJob, lockLocations, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, invalidState, notFound } from "@/server/http/errors";
import { availableQuantity, needsVerificationQuantity } from "@/server/modules/inventory/availability";
import {
  buildStockLines,
  closeActiveReservations,
  createReservations,
  loadStockFigures,
} from "@/server/modules/inventory/inventory.repository";
import { toVanDto, vanInclude } from "@/server/modules/fleet/fleet.repository";
import { findJob, jobInclude, toJobDto, type JobRow } from "@/server/modules/jobs/jobs.repository";
import { fromIsoDate, todayIsoDate } from "@/lib/dates";
import type { AssignJobRequest, DispatchBoardDto, ReassignJobRequest, VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { decideBlocking, evaluateVan, rankVans, type EligibilityJob, type EligibilityVan } from "./eligibility";

// ─── Eligibility ────────────────────────────────────────────────────────────

/** Every van that is not sold, ranked for this job, with the reason each cannot take it. */
export async function findEligibleVans(jobId: string): Promise<VanEligibilityDto[]> {
  const job = await findJob(prisma, jobId);
  const vans = await loadCandidates(prisma);
  return rankVans(vans.map((van) => evaluateVan(toEligibilityJob(job), van)));
}

async function loadCandidates(tx: Tx, vanIds?: string[]): Promise<EligibilityVan[]> {
  const vans = await tx.van.findMany({
    where: vanIds ? { id: { in: vanIds } } : { status: { not: "SOLD" } },
    include: vanInclude,
    orderBy: { code: "asc" },
  });
  const products = await tx.product.findMany({ select: { id: true, serialised: true } });
  const figures = await loadStockFigures(tx, vans.map((v) => v.locationId));
  const serialised = new Map(products.map((p) => [p.id, p.serialised]));

  return vans.map((van) => ({
    vanId: van.id,
    code: van.code,
    zone: van.zone,
    status: van.status,
    technician: van.currentTechnician ? { id: van.currentTechnician.id, name: van.currentTechnician.name } : null,
    stock(productId: string) {
      const isSerialised = serialised.get(productId) ?? false;
      const f = figures.get(van.locationId, productId);
      return {
        available: availableQuantity(isSerialised, f),
        needsVerification: needsVerificationQuantity(isSerialised, f) ?? 0,
      };
    },
  }));
}

function toEligibilityJob(job: JobRow): EligibilityJob {
  return {
    zone: job.branch.zone,
    items: job.items.map((i) => ({ productId: i.productId, sku: i.product.sku, quantity: i.quantity })),
  };
}

// ─── Assignment ─────────────────────────────────────────────────────────────

/**
 * Puts a requested job on a van and reserves its stock. The availability check and
 * the reservations happen under the van's location lock, so two assignments can
 * never both take the last unit. Physical stock does not change.
 */
export async function assignJob(jobId: string, input: AssignJobRequest): Promise<JobDto> {
  await runInTransaction(async (tx) => {
    await lockJob(tx, jobId);
    const job = await findJob(tx, jobId);
    if (job.status === "ASSIGNED") throw invalidState("The job is already assigned; reassign it instead");
    if (job.status !== "REQUESTED") throw invalidState(`A ${job.status.toLowerCase()} job cannot be assigned`);

    const van = await reserveOnVan(tx, job, input.vanId);
    await tx.job.update({
      where: { id: jobId },
      data: {
        status: "ASSIGNED",
        vanId: van.id,
        technicianId: van.technicianId,
        assignedAt: new Date(),
        scheduledFor: input.scheduledFor ? fromIsoDate(input.scheduledFor) : undefined,
        sequence: input.sequence,
        blockingReason: null,
        blockingDetail: null,
      },
    });
  });

  await refreshBlockingReasons();
  return toJobDto(await findJob(prisma, jobId));
}

/**
 * Moves an assigned job to another van in one transaction: check the destination,
 * release the original reservations, reserve on the destination. No stock moves;
 * if the equipment must physically follow, that is a separate transfer.
 */
export async function reassignJob(jobId: string, input: ReassignJobRequest): Promise<JobDto> {
  await runInTransaction(async (tx) => {
    await lockJob(tx, jobId);
    const job = await findJob(tx, jobId);
    if (job.status !== "ASSIGNED") throw invalidState(`Only an assigned job can be reassigned (this one is ${job.status})`);
    if (job.vanId === input.vanId) throw invalidState("The job is already on that van");

    const destination = await tx.van.findUnique({ where: { id: input.vanId } });
    if (!destination) throw notFound("Van", input.vanId);
    if (!job.van) throw invalidState("The job has no van");
    // Both vans in one sorted lock call: fixed order, no deadlock with a reverse reassignment.
    await lockLocations(tx, [job.van.locationId, destination.locationId]);

    await closeActiveReservations(tx, jobId, "RELEASED", `Reassigned to ${destination.code} by ${input.reassignedBy}: ${input.reason}`);
    const van = await reserveOnVan(tx, job, input.vanId);
    await tx.job.update({
      where: { id: jobId },
      data: { vanId: van.id, technicianId: van.technicianId, assignedAt: new Date() },
    });
  });

  await refreshBlockingReasons();
  return toJobDto(await findJob(prisma, jobId));
}

/** Checks the van can take the job (under its location lock) and creates the reservations. */
async function reserveOnVan(tx: Tx, job: JobRow, vanId: string) {
  const found = await tx.van.findUnique({ where: { id: vanId } });
  if (!found) throw notFound("Van", vanId);
  await lockLocations(tx, [found.locationId]);

  // Re-read after locking: status and driver changes take the same lock.
  const [candidate] = await loadCandidates(tx, [vanId]);
  const result = evaluateVan(toEligibilityJob(job), candidate);
  const problem = (code: string) => result.problems.find((p) => p.code === code);

  const notActive = problem("VAN_NOT_ACTIVE");
  if (notActive) throw new AppError("VAN_UNAVAILABLE", `${notActive.message}; it cannot take new customer jobs`);
  if (!candidate.technician) throw new AppError("NO_TECHNICIAN", `${candidate.code} has no driver; assign a technician first`);
  if (!result.eligible) {
    throw new AppError("INSUFFICIENT_STOCK", result.problems.map((p) => p.message).join("; "), { shortages: result.shortages });
  }

  await createReservations(tx, job.id, found.locationId, job.items);
  return { id: vanId, technicianId: candidate.technician.id };
}

// ─── Blocking reasons ───────────────────────────────────────────────────────

/**
 * Recomputes the blocking reason of every open request from current availability:
 * set when no van can take it, cleared when one can. Jobs held for import review
 * keep their reason until a person deals with them.
 *
 * Runs after the stock or reservation change has committed, in its own short
 * transaction, so it can never deadlock with or roll back the operation itself.
 * It never assigns anything: dispatch stays manual.
 */
export async function refreshBlockingReasons(): Promise<void> {
  try {
    const jobs = await prisma.job.findMany({
      where: {
        status: "REQUESTED",
        OR: [{ blockingReason: null }, { blockingReason: { in: ["NO_ELIGIBLE_VAN", "UNITS_NEED_VERIFICATION"] } }],
      },
      include: jobInclude,
    });
    if (jobs.length === 0) return;
    const vans = await loadCandidates(prisma);

    for (const job of jobs) {
      const decision = decideBlocking(vans.map((van) => evaluateVan(toEligibilityJob(job), van)));
      const reason = decision?.reason ?? null;
      const detail = decision?.detail ?? null;
      if (reason === job.blockingReason && detail === job.blockingDetail) continue;
      await prisma.job.updateMany({
        where: { id: job.id, status: "REQUESTED", blockingReason: job.blockingReason },
        data: { blockingReason: reason, blockingDetail: detail },
      });
    }
  } catch (error) {
    // Advisory data: a failure here must not fail the operation that already committed.
    console.error("Could not refresh blocking reasons", error);
  }
}

// ─── Dispatch board ─────────────────────────────────────────────────────────

/** Every open request with how long it has waited, and every van with its stock, driver and day. */
export async function getDispatchBoard(date = todayIsoDate()): Promise<DispatchBoardDto> {
  const day = fromIsoDate(date);
  const [requests, vans, jobsOnDay] = await Promise.all([
    prisma.job.findMany({
      where: { status: "REQUESTED" },
      include: jobInclude,
      orderBy: [{ requestedOn: { sort: "asc", nulls: "last" } }, { reference: "asc" }],
    }),
    prisma.van.findMany({ where: { status: { not: "SOLD" } }, include: vanInclude, orderBy: { code: "asc" } }),
    prisma.job.findMany({
      where: { scheduledFor: day, status: { in: ["ASSIGNED", "IN_PROGRESS", "COMPLETED"] } },
      include: jobInclude,
      orderBy: [{ sequence: { sort: "asc", nulls: "last" } }, { reference: "asc" }],
    }),
  ]);

  return {
    date,
    openRequests: requests.map((job) => toJobDto(job, day)),
    vans: await Promise.all(
      vans.map(async (van) => ({
        van: toVanDto(van),
        stock: {
          locationId: van.locationId,
          locationName: van.code,
          vanId: van.id,
          lines: await buildStockLines(prisma, van.locationId),
        },
        jobsToday: jobsOnDay.filter((job) => job.vanId === van.id).map((job) => toJobDto(job, day)),
      })),
    ),
  };
}
