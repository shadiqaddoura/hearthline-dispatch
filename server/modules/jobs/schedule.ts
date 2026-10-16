import "server-only";
import type { Tx } from "@/server/db/transaction";
import { AppError } from "@/server/http/errors";
import { fromIsoDate, todayIsoDate, toIsoDateOrNull } from "@/lib/dates";

// Manual scheduling rules: a planned calendar day and a position in the van's day.
// No time slots, durations or working-day rules exist; a day is just a date.

export interface PlannedSlot {
  jobId: string;
  /** The van the job is on, or is being assigned to. */
  van: { id: string; code: string } | null;
  scheduledFor: string | null;
  sequence: number | null;
  /** The job's current planned day: keeping an existing (even past) day is allowed. */
  currentScheduledFor: Date | null;
}

/**
 * Checks a planned day and position. Call it while holding the van's location lock
 * (see transaction.ts), so two saves cannot take the same position in one van's day.
 */
export async function assertSlotAvailable(tx: Tx, slot: PlannedSlot, today = todayIsoDate()): Promise<void> {
  const changedDay = slot.scheduledFor !== toIsoDateOrNull(slot.currentScheduledFor);
  if (slot.scheduledFor && changedDay && slot.scheduledFor < today) {
    throw new AppError("VALIDATION_FAILED", `A visit can't be scheduled in the past (today is ${today})`, {
      fieldErrors: { scheduledFor: ["Choose today or a later day"] },
    });
  }
  if (slot.sequence === null) return;
  if (!slot.van) {
    throw new AppError("VALIDATION_FAILED", "Only a job on a van has a position in the van's day", {
      fieldErrors: { sequence: ["Assign the job to a van first"] },
    });
  }
  if (!slot.scheduledFor) {
    throw new AppError("VALIDATION_FAILED", "A position in the van's day needs a scheduled day", {
      fieldErrors: { sequence: ["Choose a day first"] },
    });
  }

  const taken = await tx.job.findFirst({
    where: {
      vanId: slot.van.id,
      scheduledFor: fromIsoDate(slot.scheduledFor),
      sequence: slot.sequence,
      id: { not: slot.jobId },
      status: { not: "CANCELLED" },
    },
    select: { reference: true },
  });
  if (taken) {
    throw new AppError(
      "CONFLICT",
      `${slot.van.code} already has ${taken.reference} at #${slot.sequence} on ${slot.scheduledFor}; choose another position`,
      { fieldErrors: { sequence: [`#${slot.sequence} is taken by ${taken.reference}`] } },
    );
  }
}
