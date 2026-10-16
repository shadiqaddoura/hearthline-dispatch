"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchProduct } from "@/lib/api/products";
import type { ProductDetailDto } from "@/lib/contracts/products";

export type ProductDetailState =
  | { status: "idle" }
  | { status: "loading"; detail: ProductDetailDto | null }
  | { status: "error"; message: string; detail: ProductDetailDto | null }
  | { status: "ready"; detail: ProductDetailDto };

/** The newest answer the server gave, and which request it answered. */
interface Settled {
  productId: string;
  attempt: number;
  detail: ProductDetailDto | null;
  error: string | null;
}

/**
 * Where the selected product is used, from the server: it decides which fields can
 * still be edited and whether the product can be deleted. The last answer for the same
 * product stays available while a newer one loads, so dialogs don't blank out.
 */
export function useProductDetail(
  productId: string | null,
  load: (productId: string, signal: AbortSignal) => Promise<ProductDetailDto> = fetchProduct,
) {
  const [settled, setSettled] = useState<Settled | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    const previous = (current: Settled | null) => (current?.productId === productId ? current.detail : null);
    load(productId, controller.signal).then(
      (detail) => setSettled({ productId, attempt, detail, error: null }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Where this product is used couldn't be loaded.";
        setSettled((current) => ({ productId, attempt, detail: previous(current), error: message }));
      },
    );
    return () => controller.abort();
  }, [productId, load, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  let state: ProductDetailState;
  if (!productId) {
    state = { status: "idle" };
  } else if (settled?.productId !== productId || settled.attempt !== attempt) {
    state = { status: "loading", detail: settled?.productId === productId ? settled.detail : null };
  } else if (settled.error !== null) {
    state = { status: "error", message: settled.error, detail: settled.detail };
  } else {
    state = { status: "ready", detail: settled.detail! };
  }
  return { state, reload };
}
