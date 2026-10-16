import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import { getJson } from "./client";

export function fetchDispatchBoard(signal?: AbortSignal): Promise<DispatchBoardDto> {
  return getJson<DispatchBoardDto>("/api/dispatch/board", { signal });
}

/** Every van ranked for the job by the backend: eligible first, then the job's zone. */
export function fetchEligibleVans(jobId: string, signal?: AbortSignal): Promise<VanEligibilityDto[]> {
  return getJson<VanEligibilityDto[]>(`/api/jobs/${encodeURIComponent(jobId)}/eligible-vans`, { signal });
}
