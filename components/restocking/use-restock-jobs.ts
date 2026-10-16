"use client";

import { useEffect, useState } from "react";
import { fetchOpenRestockJobs } from "@/lib/api/restocking";
import type { RestockJobDto } from "@/lib/contracts/restocking";

export type RestockJobsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; jobs: RestockJobDto[]; refreshing: boolean; refreshError: string | null };

type Settled = { attempt: number; jobs?: RestockJobDto[]; error?: string };

/** Loads the open restock jobs. A refresh keeps the current list on screen until the new one arrives. */
export function useRestockJobs(load: (signal: AbortSignal) => Promise<RestockJobDto[]> = fetchOpenRestockJobs) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [lastJobs, setLastJobs] = useState<RestockJobDto[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (jobs) => {
        setLastJobs(jobs);
        setSettled({ attempt, jobs });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setSettled({ attempt, error: error instanceof Error ? error.message : "The restock list couldn't be loaded." });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  const current = settled?.attempt === attempt ? settled : null;
  let state: RestockJobsState;
  if (lastJobs) state = { status: "ready", jobs: lastJobs, refreshing: current === null, refreshError: current?.error ?? null };
  else if (current?.error) state = { status: "error", message: current.error };
  else state = { status: "loading" };

  return { state, reload: () => setAttempt((n) => n + 1) };
}
