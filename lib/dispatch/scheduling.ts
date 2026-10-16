// Turning the assignment and scheduling forms into API requests, and the API's answers
// into explanations. Independent of any UI library. The server decides what is allowed.
import { ApiRequestError } from "@/lib/api/client";
import { isIsoDay } from "./presentation";

export interface ScheduleInput {
  /** As typed: "" or YYYY-MM-DD from a date input. */
  date: string;
  /** As typed: "" or a whole number. */
  position: string;
}

export type ScheduleFieldErrors = Partial<Record<"scheduledFor" | "sequence", string>>;

export type ParsedSchedule =
  | { ok: true; scheduledFor: string | null; sequence: number | null }
  | { ok: false; errors: ScheduleFieldErrors };

/** Reads the two optional fields. Only the shape is checked here; the server checks the rest. */
export function parseScheduleInput(input: ScheduleInput): ParsedSchedule {
  const date = input.date.trim();
  const position = input.position.trim();
  const errors: ScheduleFieldErrors = {};

  if (date && !isIsoDay(date)) errors.scheduledFor = "Enter a real date";
  let sequence: number | null = null;
  if (position) {
    sequence = Number(position);
    if (!/^\d+$/.test(position) || !Number.isSafeInteger(sequence) || sequence < 1) {
      errors.sequence = "Enter a whole number from 1";
    } else if (!date) {
      errors.sequence = "Choose a day first";
    }
  }
  if (errors.scheduledFor || errors.sequence) return { ok: false, errors };
  return { ok: true, scheduledFor: date || null, sequence };
}

export type FailureKind =
  /** Stock, driver or vehicle changed since the van was shown as suitable. */
  | "van-changed"
  /** The job itself changed, e.g. someone else assigned or cancelled it. */
  | "job-changed"
  /** Something in the form needs fixing (a taken position, a past day…). */
  | "input"
  /** The server didn't answer: the change may or may not have been saved. */
  | "unknown";

export interface Failure {
  kind: FailureKind;
  message: string;
  fieldErrors: Partial<Record<string, string>>;
}

/** What went wrong with an assignment or schedule save, in terms the dispatcher can act on. */
export function explainFailure(error: unknown): Failure {
  if (!(error instanceof ApiRequestError) || !error.isRejection) {
    return {
      kind: "unknown",
      message: error instanceof Error ? error.message : "The request didn't complete.",
      fieldErrors: {},
    };
  }
  const fieldErrors = Object.fromEntries(Object.entries(error.fieldErrors).map(([field, messages]) => [field, messages[0]]));
  switch (error.code) {
    case "INSUFFICIENT_STOCK":
    case "VAN_UNAVAILABLE":
    case "NO_TECHNICIAN":
      return { kind: "van-changed", message: error.message, fieldErrors };
    case "INVALID_STATE":
    case "NOT_FOUND":
      return { kind: "job-changed", message: error.message, fieldErrors };
    default:
      return { kind: "input", message: error.message, fieldErrors };
  }
}
