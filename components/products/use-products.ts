"use client";

import { useEffect, useState } from "react";
import { fetchProducts } from "@/lib/api/products";
import type { ProductDto } from "@/lib/contracts/products";

export type ProductsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: ProductDto[] };

/** Loads the catalogue from the API, with a retry for when that fails. */
export function useProducts(load: (signal: AbortSignal) => Promise<ProductDto[]> = fetchProducts) {
  const [state, setState] = useState<ProductsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(
      (products) => setState({ status: "ready", products }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
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

  return { state, retry };
}
