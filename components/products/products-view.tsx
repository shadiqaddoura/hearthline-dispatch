"use client";

import { useRef, useState } from "react";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import { COMPACT_MEDIA_QUERY, useMediaQuery } from "@/components/shell/use-media-query";
import type { ProductDto } from "@/lib/contracts/products";
import { filterProducts } from "@/lib/products/catalogue";
import { ProductDetails } from "./product-details";
import { ProductTable } from "./product-table";
import { ProductToolbar } from "./product-toolbar";
import { ProductsEmpty, ProductsError, ProductsLoading, ProductsNoResults } from "./product-states";
import { useProducts, type ProductsState } from "./use-products";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  description: { color: tokens.colorNeutralForeground2, maxWidth: "720px" },
  surface: {
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
    boxShadow: tokens.shadow2,
    overflow: "hidden",
    ":focus": { outlineStyle: "none" },
  },
});

interface ProductsViewProps {
  /** Replaces the API call; tests use it. */
  loadProducts?: (signal: AbortSignal) => Promise<ProductDto[]>;
}

export function ProductsView({ loadProducts }: ProductsViewProps) {
  const styles = useStyles();
  const { state, retry } = useProducts(loadProducts);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ProductDto | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Retry and Clear search disappear once used; focus moves somewhere stable instead of the page body.
  const surfaceRef = useRef<HTMLElement>(null);
  const compact = useMediaQuery(COMPACT_MEDIA_QUERY) ?? false;

  const products = state.status === "ready" ? state.products : [];
  const visible = filterProducts(products, query);

  return (
    <div className={styles.page}>
      <Text as="p" className={styles.description}>
        Every product a van can carry, with how it is counted, whether units need serial numbers, the minimum each
        van should hold, and whether restocking tops it up automatically.
      </Text>

      <ProductToolbar
        searchRef={searchRef}
        query={query}
        onQueryChange={setQuery}
        disabled={state.status !== "ready" || products.length === 0}
        counts={state.status === "ready" && products.length > 0 ? { shown: visible.length, total: products.length } : undefined}
      />

      <section ref={surfaceRef} tabIndex={-1} className={styles.surface} aria-label="Products">
        <ProductsBody
          state={state}
          query={query}
          visible={visible}
          compact={compact}
          onRetry={() => {
            retry();
            surfaceRef.current?.focus();
          }}
          onClearQuery={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
          onOpenDetails={(product) => {
            setSelected(product);
            setDetailsOpen(true);
          }}
        />
      </section>

      <ProductDetails product={selected} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </div>
  );
}

interface ProductsBodyProps {
  state: ProductsState;
  query: string;
  visible: ProductDto[];
  compact: boolean;
  onRetry: () => void;
  onClearQuery: () => void;
  onOpenDetails: (product: ProductDto) => void;
}

function ProductsBody({ state, query, visible, compact, onRetry, onClearQuery, onOpenDetails }: ProductsBodyProps) {
  switch (state.status) {
    case "loading":
      return <ProductsLoading />;
    case "error":
      return <ProductsError message={state.message} onRetry={onRetry} />;
    case "ready":
      if (state.products.length === 0) return <ProductsEmpty />;
      if (visible.length === 0) return <ProductsNoResults query={query} onClear={onClearQuery} />;
      return <ProductTable products={visible} compact={compact} onOpenDetails={onOpenDetails} />;
  }
}
