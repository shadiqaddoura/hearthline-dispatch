// How dispatch data is described to people. Independent of any UI library.
// Business rules (waiting days, eligibility, availability) come from the API; this only labels them.
import type { VanProblemCode } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import type { BlockingReason, JobStatus, JobType, VanStatus } from "@/generated/prisma/enums";

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  DELIVERY: "Delivery",
  INSTALLATION: "Installation",
  REPAIR: "Repair",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  REQUESTED: "Awaiting assignment",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const BLOCKING_REASON_LABEL: Record<BlockingReason, string> = {
  NO_ELIGIBLE_VAN: "No van can take it",
  UNITS_NEED_VERIFICATION: "Serials not recorded",
  IMPORT_NEEDS_REVIEW: "Import needs review",
  RESERVATION_SHORTFALL: "Van is short for it",
};

export const VAN_STATUS_LABEL: Record<VanStatus, string> = {
  ACTIVE: "On the road",
  GARAGE: "In the garage",
  SOLD: "Sold",
};

export const VAN_PROBLEM_LABEL: Record<VanProblemCode, string> = {
  VAN_NOT_ACTIVE: "Vehicle unavailable",
  NO_TECHNICIAN: "No technician",
  INSUFFICIENT_STOCK: "Not enough equipment",
  UNITS_NEED_VERIFICATION: "Serials not recorded",
};

/** A real calendar day written as YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC", // the value is a calendar day, not an instant
});

/** "Thu 2 Oct 2026", the same in every browser. Only call with a value that passed isIsoDay. */
export function formatDay(isoDay: string): string {
  const parts = Object.fromEntries(
    dayFormat.formatToParts(new Date(`${isoDay}T00:00:00Z`)).map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

export type WaitingTime =
  | { kind: "waiting"; requestedOn: string; days: number }
  | { kind: "missing-date" }
  | { kind: "invalid-date"; recorded: string }
  | { kind: "future-date"; requestedOn: string }
  | { kind: "not-counted"; requestedOn: string };

/**
 * How long a job has waited, from the API's request date and day count. Never
 * derived from the scheduled date, and never filled in when the data is missing.
 */
export function describeWaitingTime(job: Pick<JobDto, "requestedOn" | "waitingDays">): WaitingTime {
  if (job.requestedOn === null || job.requestedOn.trim() === "") return { kind: "missing-date" };
  if (!isIsoDay(job.requestedOn)) return { kind: "invalid-date", recorded: job.requestedOn };
  if (job.waitingDays === null || !Number.isInteger(job.waitingDays)) return { kind: "not-counted", requestedOn: job.requestedOn };
  if (job.waitingDays < 0) return { kind: "future-date", requestedOn: job.requestedOn };
  return { kind: "waiting", requestedOn: job.requestedOn, days: job.waitingDays };
}

/** Short label for lists, e.g. "Waiting 14 days". */
export function waitingLabel(waiting: WaitingTime): string {
  switch (waiting.kind) {
    case "waiting":
      return waiting.days === 0 ? "Requested today" : `Waiting ${waiting.days} ${waiting.days === 1 ? "day" : "days"}`;
    case "missing-date":
      return "Request date not recorded";
    case "invalid-date":
      return "Request date unreadable";
    case "future-date":
      return "Request date is after today";
    case "not-counted":
      return "Waiting time not available";
  }
}

/** "Requested Thu 2 Oct 2026", or what is wrong with the recorded date. */
export function requestedOnLabel(waiting: WaitingTime): string {
  switch (waiting.kind) {
    case "missing-date":
      return "Not recorded";
    case "invalid-date":
      return `Unreadable (recorded as “${waiting.recorded}”)`;
    default:
      return formatDay(waiting.requestedOn);
  }
}

/** "Sat 18 Oct 2026 · #2 in the van's day", or that it isn't scheduled yet. */
export function scheduleLabel(job: Pick<JobDto, "scheduledFor" | "sequence">): string {
  const day = job.scheduledFor && isIsoDay(job.scheduledFor) ? formatDay(job.scheduledFor) : "Not scheduled";
  return job.sequence === null ? day : `${day} · #${job.sequence} in the van's day`;
}
