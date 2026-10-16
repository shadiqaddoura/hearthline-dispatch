import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { fromIsoDate } from "@/lib/dates";
import { updateJobRequest, type UpdateJobRequest } from "@/lib/contracts/jobs";
import {
  runInTransaction,
  lockJob,
  lockLocations,
} from "@/server/db/transaction";
import { AppError, invalidState, notFound } from "@/server/http/errors";
import { closeActiveReservations } from "@/server/modules/inventory/inventory.repository";
import {
  refreshBlockingReasons,
  reserveOnVan,
} from "@/server/modules/dispatch/dispatch.service";
import { getJob } from "./jobs.service";
import { findJob, deletionBlockedReason } from "./jobs.repository";

export async function updateJob(jobId: string, raw: UpdateJobRequest) {
  const parsed = updateJobRequest.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      "VALIDATION_FAILED",
      parsed.error.issues.map((i) => i.message).join("; "),
    );
  const input = parsed.data;
  await runInTransaction(async (tx) => {
    await lockJob(tx, jobId);
    const job = await findJob(tx, jobId);
    if (
      input.expectedUpdatedAt &&
      job.updatedAt.toISOString() !== input.expectedUpdatedAt
    )
      throw new AppError(
        "CONFLICT",
        "This request changed since you opened it. Your entered values are preserved; close and reopen the refreshed request before saving.",
      );
    if (
      !["REQUESTED", "ASSIGNED"].includes(job.status) ||
      job.startedAt ||
      job.completedOn ||
      job.cancelledAt ||
      (await tx.jobCompletion.count({ where: { jobId } })) ||
      (await tx.stockMovement.count({ where: { jobId } }))
    ) {
      throw invalidState(
        "Only requests that have not started or recorded execution can be edited. Historical work is preserved.",
      );
    }
    if (!(await tx.branch.findUnique({ where: { id: input.branchId } })))
      throw notFound("Branch", input.branchId);
    if (
      (await tx.product.count({
        where: { id: { in: input.items.map((i) => i.productId) } },
      })) !== input.items.length
    )
      throw new AppError(
        "VALIDATION_FAILED",
        "One or more selected products no longer exist. Refresh the catalogue.",
      );
    const changed =
      job.items.length !== input.items.length ||
      input.items.some(
        (i) =>
          !job.items.some(
            (j) => j.productId === i.productId && j.quantity === i.quantity,
          ),
      );
    if (changed && job.van) await lockLocations(tx, [job.van.locationId]);
    if (changed) await tx.jobItem.deleteMany({ where: { jobId } });
    await tx.job.update({
      where: { id: jobId },
      data: {
        type: input.type,
        branchId: input.branchId,
        requestedOn: input.requestedOn ? fromIsoDate(input.requestedOn) : null,
        notes: input.notes ?? null,
        ...(changed ? { items: { create: input.items } } : {}),
      },
    });
    if (changed && job.status === "ASSIGNED") {
      if (!job.vanId)
        throw invalidState(
          "The assigned request has no van. Resolve its assignment first.",
        );
      await closeActiveReservations(
        tx,
        jobId,
        "RELEASED",
        "Request requirements edited",
      );
      // Reuse assignment's locked, serial-aware eligibility check. Any failure rolls back the entire edit.
      await reserveOnVan(tx, await findJob(tx, jobId), job.vanId);
    }
  });
  await refreshBlockingReasons();
  return getJob(jobId);
}

export async function deleteJob(jobId: string) {
  try {
    await runInTransaction(async (tx) => {
      await lockJob(tx, jobId);
      const job = await findJob(tx, jobId);
      const blocked = deletionBlockedReason(job);
      if (blocked) throw invalidState(blocked);
      await tx.job.delete({ where: { id: jobId } });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2003", "P2010"].includes(error.code)
    )
      throw invalidState(
        "This request has protected history and cannot be deleted.",
      );
    throw error;
  }
  await refreshBlockingReasons();
  return { id: jobId };
}
