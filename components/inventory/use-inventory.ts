"use client";

import { useCallback, useEffect, useState } from "react";
import type { InventoryLocationDto } from "@/lib/contracts/inventory";
import { inventoryApi } from "@/lib/api/inventory";

export function useInventory() {
  const [locations, setLocations] = useState<InventoryLocationDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    inventoryApi.list(controller.signal).then(
      (rows) => { if (!controller.signal.aborted) { setLocations(rows); setProblem(""); } },
      (error) => { if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : "Inventory could not be loaded."); },
    ).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  return { locations, loading, problem, refresh, revision };
}
