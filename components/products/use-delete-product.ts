"use client";

import { useRef, useState } from "react";
import { ApiRequestError } from "@/lib/api/client";
import type { DeletedProductDto } from "@/lib/contracts/products";
import type { FormProblem } from "./use-product-form";

interface DeleteOptions {
  productId: string;
  submit: (productId: string) => Promise<DeletedProductDto>;
  /** Called once, only after the server has confirmed the deletion. */
  onDeleted: (deleted: DeletedProductDto) => void;
  /** What the person saw is out of date: reload the catalogue and details. */
  onDataChanged: () => void;
}

/** One deletion at a time, reported only when the server confirms it. A refusal leaves everything unchanged. */
export function useDeleteProduct({ productId, submit, onDeleted, onDataChanged }: DeleteOptions) {
  const [problem, setProblem] = useState<FormProblem | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setProblem(null);
    try {
      onDeleted(await submit(productId));
    } catch (error) {
      onDataChanged();
      setProblem(explain(error));
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return { problem, pending, confirm };
}

function explain(error: unknown): FormProblem {
  if (!(error instanceof ApiRequestError)) {
    return { title: "Something went wrong.", message: "The product wasn't deleted. Try again." };
  }
  if (!error.isRejection) {
    return {
      title: "We couldn't confirm whether the product was deleted.",
      message: `${error.message} The product list has been reloaded: check it before trying again.`,
    };
  }
  if (error.code === "NOT_FOUND") {
    return { title: "This product is already gone.", message: "Someone else may have deleted it. The product list has been reloaded." };
  }
  return { title: "The product wasn't deleted.", message: `${error.message}${/[.!]$/.test(error.message) ? "" : "."} Nothing was changed.` };
}
