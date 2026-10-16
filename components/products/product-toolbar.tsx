"use client";

import type { Ref } from "react";
import { SearchBox, Text, makeStyles, tokens } from "@fluentui/react-components";

const useStyles = makeStyles({
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
  },
  search: { width: "320px", maxWidth: "100%", "@media (max-width: 479px)": { width: "100%" } },
  count: { color: tokens.colorNeutralForeground3 },
});

interface ProductToolbarProps {
  searchRef?: Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (query: string) => void;
  /** Products shown and in the catalogue; omitted while the catalogue isn't loaded. */
  counts?: { shown: number; total: number };
  disabled?: boolean;
}

export function ProductToolbar({ searchRef, query, onQueryChange, counts, disabled }: ProductToolbarProps) {
  const styles = useStyles();
  return (
    <div className={styles.toolbar} role="search">
      <SearchBox
        ref={searchRef}
        className={styles.search}
        aria-label="Search products by name or SKU"
        placeholder="Search by name or SKU"
        value={query}
        onChange={(_, data) => onQueryChange(data.value)}
        disabled={disabled}
      />
      <Text size={200} className={styles.count} aria-live="polite">
        {counts &&
          (counts.shown === counts.total
            ? `${counts.total} ${counts.total === 1 ? "product" : "products"}`
            : `${counts.shown} of ${counts.total} products`)}
      </Text>
    </div>
  );
}
