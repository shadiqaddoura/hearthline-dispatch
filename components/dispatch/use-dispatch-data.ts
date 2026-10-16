"use client";

import { useEffect, useState } from "react";
import { fetchDispatchBoard, fetchEligibleVans } from "@/lib/api/dispatch";
import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";

export type BoardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; board: DispatchBoardDto; refreshing: boolean; refreshError: string | null };

type Settled<T> = { attempt: number; data?: T; error?: string };

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Loads the board. A refresh keeps the current board on screen until the new one arrives. */
export function useDispatchBoard(load: (signal: AbortSignal) => Promise<DispatchBoardDto> = fetchDispatchBoard) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<DispatchBoardDto> | null>(null);
  const [lastBoard, setLastBoard] = useState<DispatchBoardDto | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (board) => {
        setLastBoard(board);
        setSettled({ attempt, data: board });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSettled({ attempt, error: errorMessage(error, "The board couldn't be loaded.") });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  useEffect(() => {
    const refresh = () => setAttempt(n => n + 1);
    window.addEventListener("fleet-changed", refresh);
    return () => window.removeEventListener("fleet-changed", refresh);
  }, []);

  const current = settled?.attempt === attempt ? settled : null;
  let state: BoardState;
  if (lastBoard) {
    state = { status: "ready", board: lastBoard, refreshing: current === null, refreshError: current?.error ?? null };
  } else if (current?.error) {
    state = { status: "error", message: current.error };
  } else {
    state = { status: "loading" };
  }

  return { state, reload: () => setAttempt((n) => n + 1) };
}

export type EligibilityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; vans: VanEligibilityDto[] };

/**
 * The backend's ranking of vans for one job. Switching jobs abandons the
 * previous request, so a slow answer for an earlier job is never shown.
 */
export function useEligibility(
  jobId: string | null,
  load: (jobId: string, signal: AbortSignal) => Promise<VanEligibilityDto[]> = fetchEligibleVans,
) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<(Settled<VanEligibilityDto[]> & { jobId: string }) | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    load(jobId, controller.signal).then(
      (vans) => setSettled({ jobId, attempt, data: vans }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setSettled({ jobId, attempt, error: errorMessage(error, "Eligible vans couldn't be checked.") });
        }
      },
    );
    return () => controller.abort();
  }, [jobId, attempt, load]);

  let state: EligibilityState;
  if (!jobId) state = { status: "idle" };
  else if (settled?.jobId !== jobId || settled.attempt !== attempt) state = { status: "loading" };
  else if (settled.error !== undefined) state = { status: "error", message: settled.error };
  else state = { status: "ready", vans: settled.data ?? [] };

  return { state, retry: () => setAttempt((n) => n + 1) };
}
