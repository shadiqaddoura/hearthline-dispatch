"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchProducts } from "@/lib/api/products";
import type { ProductDto } from "@/lib/contracts/products";

export type ProductsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `staleReason` is set when a refresh after a change failed: the list shown may be out of date. */
  | { status: "ready"; products: ProductDto[]; staleReason: string | null };

/**
 * Loads the catalogue from the API, with a retry for when that fails.
 * `refresh` reloads quietly after a change: the list stays on screen (so the search,
 * sort order and scroll position are kept) and is replaced when the answer arrives.
 */
export function useProducts(load: (signal: AbortSignal) => Promise<ProductDto[]> = fetchProducts) {
  const [state, setState] = useState<ProductsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Answers can arrive out of order; only the newest request may update the list.
  const newest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const request = ++newest.current;
    load(controller.signal).then(
      (products) => {
        if (request === newest.current) setState({ status: "ready", products, staleReason: null });
      },
      (error: unknown) => {
        if (controller.signal.aborted || request !== newest.current) return;
        const message = error instanceof Error ? error.message : "The products couldn't be loaded.";
        setState({ status: "error", message });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  const refresh = useCallback(async () => {
    const request = ++newest.current;
    try {
      const products = await load(new AbortController().signal);
      if (request === newest.current) setState({ status: "ready", products, staleReason: null });
    } catch (error) {
      if (request !== newest.current) return;
      const reason = error instanceof Error ? error.message : "The products couldn't be reloaded.";
      setState((current) => (current.status === "ready" ? { ...current, staleReason: reason } : current));
    }
  }, [load]);

  return { state, retry, refresh };
}
