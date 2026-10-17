"use client";

import { useRef, useState } from "react";
import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  tokens,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { COMPACT_MEDIA_QUERY, useMediaQuery } from "@/components/shell/use-media-query";
import { productsApi, type ProductsApi } from "@/lib/api/products";
import type { ProductDto } from "@/lib/contracts/products";
import { filterProducts } from "@/lib/products/catalogue";
import { DeleteProductDialog } from "./delete-product-dialog";
import { ProductDetails } from "./product-details";
import { ProductFormDialog, type ProductFormTarget } from "./product-form-dialog";
import { ProductNoticeRegion } from "./product-notice";
import { ProductTable } from "./product-table";
import { ProductToolbar } from "./product-toolbar";
import { ProductsEmpty, ProductsError, ProductsLoading, ProductsNoResults } from "./product-states";
import { useProductActions } from "./use-product-actions";
import { useProductDetail } from "./use-product-detail";
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
  /** Replaces the API calls; tests use it. */
  api?: Partial<ProductsApi>;
  /** Replaces just the catalogue call; tests use it. */
  loadProducts?: (signal: AbortSignal) => Promise<ProductDto[]>;
}

export function ProductsView({ api: overrides, loadProducts }: ProductsViewProps) {
  const styles = useStyles();
  const api = { ...productsApi, ...overrides, ...(loadProducts && { list: loadProducts }) };
  const { state, retry, refresh } = useProducts(api.list);
  const [query, setQuery] = useState("");
  // The product is looked up in the current list by id, so a refresh updates the open panel.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  // Retry and Clear search disappear once used; focus moves somewhere stable instead of the page body.
  const surfaceRef = useRef<HTMLElement>(null);
  const compact = useMediaQuery(COMPACT_MEDIA_QUERY) ?? false;
  const restoreFocusTarget = useRestoreFocusTarget();

  const products = state.status === "ready" ? state.products : [];
  const visible = filterProducts(products, query);
  const found = products.find((p) => p.id === selectedId) ?? null;
  // Kept after closing so the panel still has content while it animates out.
  const [lastShown, setLastShown] = useState<ProductDto | null>(null);
  if (found && found !== lastShown) setLastShown(found);
  const selected = found ?? lastShown;

  const usage = useProductDetail(detailsOpen ? selectedId : null, api.get);
  const detail = usage.state.status === "idle" ? null : usage.state.detail;

  const actions = useProductActions({
    refresh: async () => {
      await refreshCatalogue();
    },
    reloadDetail: usage.reload,
    query,
    selected: detail,
    onDeleted: () => {
      setDetailsOpen(false);
      setSelectedId(null);
    },
  });
  const refreshCatalogue = refresh;

  const formTarget: ProductFormTarget | null =
    actions.dialog === "create" ? { mode: "create" } : actions.dialog === "edit" && detail ? { mode: "edit", product: detail } : null;

  const addButton = (
    <Button {...restoreFocusTarget} appearance="primary" icon={<AddRegular />} onClick={() => actions.open("create")}>
      Add product
    </Button>
  );

  return (
    <div className={styles.page}>
      <Text as="p" className={styles.description}>
        Every product a van can carry, with how it is counted, whether units need serial numbers, the minimum each
        van should hold, and whether restocking tops it up automatically.
      </Text>

      <ProductNoticeRegion notice={actions.notice} regionRef={actions.noticeRef} onDismiss={actions.dismissNotice} />

      {state.status === "ready" && state.staleReason && (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>The list may be out of date.</MessageBarTitle>
            Your change was saved, but reloading the products failed: {state.staleReason}
          </MessageBarBody>
          <MessageBarActions>
            <Button onClick={() => void refresh()}>Reload</Button>
          </MessageBarActions>
        </MessageBar>
      )}

      <ProductToolbar
        searchRef={searchRef}
        query={query}
        onQueryChange={setQuery}
        disabled={state.status !== "ready" || products.length === 0}
        counts={state.status === "ready" && products.length > 0 ? { shown: visible.length, total: products.length } : undefined}
        actions={state.status === "ready" ? addButton : undefined}
      />

      <section ref={surfaceRef} tabIndex={-1} className={styles.surface} aria-label="Products Catalog">
        <ProductsBody
          state={state}
          query={query}
          visible={visible}
          compact={compact}
          addButton={addButton}
          onRetry={() => {
            retry();
            surfaceRef.current?.focus();
          }}
          onClearQuery={() => {
            setQuery("");
            searchRef.current?.focus();
          }}
          onOpenDetails={(product) => {
            setSelectedId(product.id);
            setDetailsOpen(true);
          }}
        />
      </section>

      <ProductDetails
        product={selected}
        usage={usage.state}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        onRetryUsage={usage.reload}
        onEdit={() => actions.open("edit")}
        onDelete={() => actions.open("delete")}
      />

      <ProductFormDialog
        target={formTarget}
        onClose={actions.close}
        onSaved={actions.saved}
        onDataChanged={actions.dataChanged}
        submit={(target, input) => (target.mode === "create" ? api.create(input) : api.update(target.product.id, input))}
      />
      <DeleteProductDialog
        product={actions.dialog === "delete" ? detail : null}
        onClose={actions.close}
        onDeleted={actions.deleted}
        onDataChanged={actions.dataChanged}
        submit={api.remove}
      />
    </div>
  );
}

interface ProductsBodyProps {
  state: ProductsState;
  query: string;
  visible: ProductDto[];
  compact: boolean;
  addButton: React.ReactNode;
  onRetry: () => void;
  onClearQuery: () => void;
  onOpenDetails: (product: ProductDto) => void;
}

function ProductsBody({ state, query, visible, compact, addButton, onRetry, onClearQuery, onOpenDetails }: ProductsBodyProps) {
  switch (state.status) {
    case "loading":
      return <ProductsLoading />;
    case "error":
      return <ProductsError message={state.message} onRetry={onRetry} />;
    case "ready":
      if (state.products.length === 0) return <ProductsEmpty action={addButton} />;
      if (visible.length === 0) return <ProductsNoResults query={query} onClear={onClearQuery} />;
      return <ProductTable products={visible} compact={compact} onOpenDetails={onOpenDetails} />;
  }
}
