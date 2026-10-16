import "server-only";
import type { Tx } from "@/server/db/transaction";
import { notFound } from "@/server/http/errors";
import {
  daysBetween,
  fromIsoDate,
  todayIsoDate,
  toIsoDateOrNull,
} from "@/lib/dates";
import type { JobDto } from "@/lib/contracts/jobs";
import type { JobStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const OPEN_STATUSES: JobStatus[] = [
  "REQUESTED",
  "ASSIGNED",
  "IN_PROGRESS",
];

export const jobInclude = {
  _count: { select: { reservations: true, movements: true } },
  completion: { select: { id: true } },
  branch: { include: { customer: true } },
  van: true,
  technician: true,
  items: { include: { product: true }, orderBy: { product: { sku: "asc" } } },
  reservations: { where: { status: "ACTIVE" } },
} as const satisfies Prisma.JobInclude;

export type JobRow = Prisma.JobGetPayload<{ include: typeof jobInclude }>;

export async function findJob(tx: Tx, jobId: string): Promise<JobRow> {
  const job = await tx.job.findUnique({
    where: { id: jobId },
    include: jobInclude,
  });
  if (!job) throw notFound("Job", jobId);
  return job;
}

export function deletionBlockedReason(job: JobRow): string | null {
  if (
    job.status !== "REQUESTED" ||
    job.vanId ||
    job.technicianId ||
    job.assignedAt ||
    job.startedAt ||
    job.completedOn ||
    job.cancelledAt
  )
    return "Only unused, unassigned requests can be deleted. Cancel open work to release reservations and keep history.";
  if (job.importRowId || job.sourceStatus)
    return "This request is linked to protected import history and cannot be deleted.";
  if (job._count.reservations || job._count.movements || job.completion)
    return "This request has reservation or execution history and cannot be deleted. Cancel open work to retain its history.";
  return null;
}

export function toJobDto(
  job: JobRow,
  today: Date = fromIsoDate(todayIsoDate()),
): JobDto {
  const open = OPEN_STATUSES.includes(job.status);
  return {
    deletionBlockedReason: deletionBlockedReason(job),
    updatedAt: job.updatedAt.toISOString(),
    id: job.id,
    reference: job.reference,
    type: job.type,
    status: job.status,
    blockingReason: job.blockingReason,
    blockingDetail: job.blockingDetail,
    sourceStatus: job.sourceStatus,
    customer: { id: job.branch.customer.id, name: job.branch.customer.name },
    branch: { id: job.branch.id, name: job.branch.name, zone: job.branch.zone },
    requestedOn: toIsoDateOrNull(job.requestedOn),
    waitingDays:
      open && job.requestedOn ? daysBetween(job.requestedOn, today) : null,
    scheduledFor: toIsoDateOrNull(job.scheduledFor),
    sequence: job.sequence,
    van: job.van ? { id: job.van.id, code: job.van.code } : null,
    technician: job.technician
      ? { id: job.technician.id, name: job.technician.name }
      : null,
    items: job.items.map((item) => ({
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
    })),
    activeReservations: job.reservations.map((r) => ({
      id: r.id,
      locationId: r.locationId,
      productId: r.productId,
      quantity: r.quantity,
      status: r.status,
    })),
    completedOn: toIsoDateOrNull(job.completedOn),
    notes: job.notes,
  };
}
