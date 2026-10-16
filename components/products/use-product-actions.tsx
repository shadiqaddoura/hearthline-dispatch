"use client";

import { useEffect, useRef, useState } from "react";
import type { DeletedProductDto, ProductDetailDto, ProductDto } from "@/lib/contracts/products";
import { filterProducts } from "@/lib/products/catalogue";

export type ProductDialog = "create" | "edit" | "delete";

export interface ProductNotice {
  title: string;
  message: string;
}

interface ProductActionsOptions {
  /** Reload the catalogue after the server changed it. Resolves when the new list is on screen. */
  refresh: () => Promise<void>;
  /** Reload where the selected product is used. */
  reloadDetail: () => void;
  /** The search in force, so the confirmation can say when the product is hidden by it. */
  query: string;
  /** The product the page is showing details for, before a change. */
  selected: ProductDetailDto | null;
  /** A deleted product is no longer selectable. */
  onDeleted: (deleted: DeletedProductDto) => void;
}

/**
 * What the Add, Edit and Delete buttons do: which dialog is open, and the confirmation
 * shown once the server has confirmed a change. A dialog closes only on success; a
 * failed attempt stays open with the person's entries.
 */
export function useProductActions({ refresh, reloadDetail, query, selected, onDeleted }: ProductActionsOptions) {
  const [dialog, setDialog] = useState<ProductDialog | null>(null);
  const [notice, setNotice] = useState<ProductNotice | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  // After a delete the button that opened the dialog is gone, so focus goes to the confirmation.
  const focusNoticePending = useRef(false);

  useEffect(() => {
    if (!notice || !focusNoticePending.current) return;
    focusNoticePending.current = false;
    noticeRef.current?.focus();
    noticeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [notice]);

  const open = (next: ProductDialog) => {
    setNotice(null);
    setDialog(next);
  };

  const dataChanged = () => {
    void refresh();
    reloadDetail();
  };

  const saved = (product: ProductDto, mode: "create" | "edit") => {
    const hidden = query.trim() !== "" && filterProducts([product], query).length === 0;
    const policyChanged =
      mode === "edit" && selected !== null && (selected.vanMinimum !== product.vanMinimum || selected.autoRestock !== product.autoRestock);
    setDialog(null);
    setNotice({
      title: mode === "create" ? `${product.name} was added.` : `${product.name} was saved.`,
      message: [
        mode === "create" ? `SKU ${product.sku}. No stock or equipment was created.` : `SKU ${product.sku}.`,
        policyChanged ? "Van restock lists were updated for the new setting." : "",
        product.restockPolicyNeedsReview ? "Its restocking policy is still flagged for review." : "",
        hidden ? "It isn't in the list because of the search: clear the search to see it." : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
    dataChanged();
  };

  const deleted = (gone: DeletedProductDto) => {
    setDialog(null);
    focusNoticePending.current = true;
    setNotice({ title: `${gone.name} was deleted.`, message: `SKU ${gone.sku} is no longer in the catalogue.` });
    onDeleted(gone);
    void refresh();
  };

  return {
    dialog,
    notice,
    noticeRef,
    dismissNotice: () => setNotice(null),
    open,
    close: () => setDialog(null),
    saved,
    deleted,
    dataChanged,
  };
}
