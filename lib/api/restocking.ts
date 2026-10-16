import type { RestockJobDto } from "@/lib/contracts/restocking";
import { getJson } from "./client";

/** Every van's open restock job with its pick list. Reading never changes stock or creates jobs. */
export function fetchOpenRestockJobs(signal?: AbortSignal): Promise<RestockJobDto[]> {
  return getJson<RestockJobDto[]>("/api/restock-jobs?status=OPEN", { signal });
}
