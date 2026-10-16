"use client";

import { useRef, useState } from "react";
import { assignJob, fetchJob, scheduleJob } from "@/lib/api/dispatch";
import type { AssignJobRequest } from "@/lib/contracts/dispatch";
import type { JobDto, ScheduleJobRequest } from "@/lib/contracts/jobs";
import { explainFailure, parseScheduleInput, type ScheduleInput } from "@/lib/dispatch/scheduling";

export type FieldErrors = Partial<Record<"vanId" | "assignedBy" | "scheduledFor" | "sequence", string>>;

export interface FormProblem {
  title: string;
  message: string;
}

/** How a save ended: confirmed by the response, or found to be saved when re-reading the job. */
export type SaveConfirmation = "confirmed" | "found-saved";

interface AssignmentOptions {
  job: JobDto;
  /** The board's day: a planned day before it is not offered again. */
  today: string;
  initialAssignedBy: string;
  onAssigned: (job: JobDto, how: SaveConfirmation, assignedBy: string) => void;
  /** Reload the board and recheck eligibility: what the dispatcher saw is out of date. */
  onDataChanged: () => void;
  submit?: (jobId: string, request: AssignJobRequest) => Promise<JobDto>;
  verify?: (jobId: string) => Promise<JobDto>;
}

/**
 * The assignment dialog's state: choose a van and schedule, confirm, submit once.
 * Nothing is reported as assigned until the server says so.
 */
export function useAssignment({
  job,
  today,
  initialAssignedBy,
  onAssigned,
  onDataChanged,
  submit = assignJob,
  verify = fetchJob,
}: AssignmentOptions) {
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [vanId, setVanId] = useState<string | null>(null);
  // An imported planned day is offered again only if it hasn't passed.
  const plannedDay = job.scheduledFor && job.scheduledFor >= today ? job.scheduledFor : "";
  const [schedule, setSchedule] = useState<ScheduleInput>({
    date: plannedDay,
    position: plannedDay && job.sequence ? job.sequence.toString() : "",
  });
  const [assignedBy, setAssignedBy] = useState(initialAssignedBy);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [pending, setPending] = useState(false);
  // A ref, not state: a second click in the same frame must already see the request in flight.
  const inFlight = useRef(false);

  const review = () => {
    const errors: FieldErrors = {};
    if (!vanId) errors.vanId = "Choose a van that can take this job";
    if (!assignedBy.trim()) errors.assignedBy = "Enter your name";
    const parsed = parseScheduleInput(schedule);
    if (!parsed.ok) Object.assign(errors, parsed.errors);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return false;
    setProblem(null);
    setStep("confirm");
    return true;
  };

  const confirm = async () => {
    const parsed = parseScheduleInput(schedule);
    if (inFlight.current || !vanId || !parsed.ok) return;
    inFlight.current = true;
    setPending(true);
    setProblem(null);
    const request: AssignJobRequest = {
      vanId,
      assignedBy: assignedBy.trim(),
      ...(parsed.scheduledFor !== null && { scheduledFor: parsed.scheduledFor }),
      ...(parsed.sequence !== null && { sequence: parsed.sequence }),
    };
    try {
      onAssigned(await submit(job.id, request), "confirmed", request.assignedBy);
    } catch (error) {
      const failure = explainFailure(error);
      if (failure.kind === "unknown") {
        await checkUnknownOutcome(failure.message, request);
      } else {
        onDataChanged();
        setStep("choose");
        setFieldErrors(failure.fieldErrors as FieldErrors);
        if (failure.kind === "van-changed") {
          setVanId(null);
          setProblem({
            title: "That van can no longer take this job.",
            message: `${failure.message}. The vans have been rechecked: choose again.`,
          });
        } else if (failure.kind === "job-changed") {
          setProblem({ title: "This job changed.", message: `${failure.message}. The board has been refreshed.` });
        } else {
          setProblem({ title: "Check the details.", message: failure.message });
        }
      }
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  /** The server didn't answer. Re-read the job rather than guessing or blindly resubmitting. */
  const checkUnknownOutcome = async (reason: string, request: AssignJobRequest) => {
    try {
      const current = await verify(job.id);
      if (current.status !== "REQUESTED" && current.van?.id === request.vanId) {
        onAssigned(current, "found-saved", request.assignedBy);
        return;
      }
      onDataChanged();
      setProblem(
        current.status === "REQUESTED"
          ? { title: "The assignment wasn't saved.", message: `${reason} Nothing was assigned; you can try again.` }
          : { title: "This job changed.", message: `It is now ${current.status.toLowerCase().replace("_", " ")}${current.van ? ` on ${current.van.code}` : ""}.` },
      );
    } catch {
      setProblem({
        title: "We couldn't confirm whether the assignment was saved.",
        message: `${reason} Refresh the board to see the job's current state before trying again.`,
      });
    }
  };

  return {
    step,
    vanId,
    schedule,
    assignedBy,
    fieldErrors,
    problem,
    pending,
    chooseVan: (id: string) => {
      setVanId(id);
      setFieldErrors((errors) => ({ ...errors, vanId: undefined }));
    },
    setSchedule,
    setAssignedBy,
    review,
    back: () => setStep("choose"),
    confirm,
  };
}

interface RescheduleOptions {
  job: JobDto;
  onSaved: (job: JobDto, how: SaveConfirmation) => void;
  onDataChanged: () => void;
  submit?: (jobId: string, request: ScheduleJobRequest) => Promise<JobDto>;
  verify?: (jobId: string) => Promise<JobDto>;
}

/** Changing the day and position of an assigned job. Stock and reservations never change. */
export function useReschedule({ job, onSaved, onDataChanged, submit = scheduleJob, verify = fetchJob }: RescheduleOptions) {
  const [schedule, setSchedule] = useState<ScheduleInput>({ date: job.scheduledFor ?? "", position: job.sequence?.toString() ?? "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const save = async () => {
    const parsed = parseScheduleInput(schedule);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setProblem(null);
    setFieldErrors({});
    const request = { scheduledFor: parsed.scheduledFor, sequence: parsed.sequence };
    try {
      onSaved(await submit(job.id, request), "confirmed");
    } catch (error) {
      const failure = explainFailure(error);
      if (failure.kind === "unknown") {
        try {
          const current = await verify(job.id);
          if (current.scheduledFor === request.scheduledFor && current.sequence === request.sequence) {
            onSaved(current, "found-saved");
            return;
          }
          setProblem({ title: "The schedule wasn't saved.", message: `${failure.message} You can try again.` });
        } catch {
          setProblem({
            title: "We couldn't confirm whether the schedule was saved.",
            message: `${failure.message} Refresh the board before trying again.`,
          });
        }
        return;
      }
      if (failure.kind === "job-changed") onDataChanged();
      setFieldErrors(failure.fieldErrors as FieldErrors);
      setProblem({ title: failure.kind === "job-changed" ? "This job changed." : "Check the schedule.", message: failure.message });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return { schedule, setSchedule, fieldErrors, problem, pending, save };
}
