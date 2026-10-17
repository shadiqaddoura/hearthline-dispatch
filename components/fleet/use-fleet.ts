"use client";
import { useCallback, useEffect, useState } from "react";
import { fleetApi } from "@/lib/api/fleet";
import type { VanDto, TechnicianDto } from "@/lib/contracts/fleet";
import type { JobDto } from "@/lib/contracts/jobs";
export function useFleet() {
  const [data, setData] = useState<{ vans: VanDto[]; technicians: TechnicianDto[]; jobs: JobDto[] } | null>(null);
  const [problem, setProblem] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fleetApi.list(controller.signal), fleetApi.technicians(controller.signal), fleetApi.jobs(controller.signal)]).then(([vans, technicians, jobs]) => {
      if (!controller.signal.aborted) { setData({ vans, technicians, jobs }); setProblem(""); setLoading(false); }
    }, error => { if (!controller.signal.aborted) { setProblem(error.message); setLoading(false); } });
    return () => controller.abort();
  }, [revision]);
  return { data, problem, loading, refresh, revision };
}
