import type { AssignJobRequest, DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto, ScheduleJobRequest } from "@/lib/contracts/jobs";
import { getJson, sendJson } from "./client";

export function fetchDispatchBoard(signal?: AbortSignal): Promise<DispatchBoardDto> {
  return getJson<DispatchBoardDto>("/api/dispatch/board", { signal });
}

/** Every van ranked for the job by the backend: eligible first, then the job's zone. */
export function fetchEligibleVans(jobId: string, signal?: AbortSignal): Promise<VanEligibilityDto[]> {
  return getJson<VanEligibilityDto[]>(`/api/jobs/${encodeURIComponent(jobId)}/eligible-vans`, { signal });
}

export function fetchJob(jobId: string): Promise<JobDto> {
  return getJson<JobDto>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

/** Assigns and reserves stock, with an optional first schedule, in one server transaction. */
export function assignJob(jobId: string, request: AssignJobRequest): Promise<JobDto> {
  return sendJson<JobDto>("POST", `/api/jobs/${encodeURIComponent(jobId)}/assign`, request);
}

/** Changes only the planned day and position; stock and reservations are untouched. */
export function scheduleJob(jobId: string, request: ScheduleJobRequest): Promise<JobDto> {
  return sendJson<JobDto>("PATCH", `/api/jobs/${encodeURIComponent(jobId)}/schedule`, request);
}
