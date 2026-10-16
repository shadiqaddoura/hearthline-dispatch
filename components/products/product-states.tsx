"use client";

import type { ReactNode } from "react";
import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular, BoxSearchRegular, TagMultipleRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  skeleton: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL, padding: tokens.spacingHorizontalL },
  skeletonRow: { display: "grid", gridTemplateColumns: "1fr 3fr 2fr 2fr", gap: tokens.spacingHorizontalL },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
  empty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: tokens.spacingVerticalS,
    paddingBlock: tokens.spacingVerticalXXXL,
    paddingInline: tokens.spacingHorizontalL,
  },
  emptyIcon: { fontSize: "40px", color: tokens.colorNeutralForeground3 },
  emptyBody: { color: tokens.colorNeutralForeground3, maxWidth: "420px" },
  emptyAction: { marginTop: tokens.spacingVerticalS },
});

export function ProductsLoading() {
  const styles = useStyles();
  return (
    <div role="status">
      <span className={styles.visuallyHidden}>Loading products…</span>
      <Skeleton aria-hidden className={styles.skeleton}>
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className={styles.skeletonRow}>
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
          </div>
        ))}
      </Skeleton>
    </div>
  );
}

export function ProductsError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <MessageBar intent="error" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>Products couldn&apos;t be loaded.</MessageBarTitle>
        {message}
      </MessageBarBody>
      <MessageBarActions>
        <Button icon={<ArrowClockwiseRegular />} onClick={onRetry}>
          Retry
        </Button>
      </MessageBarActions>
    </MessageBar>
  );
}

function EmptyMessage({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden>
        {icon}
      </span>
      <Text as="h2" size={400} weight="semibold">
        {title}
      </Text>
      <Text className={styles.emptyBody}>{children}</Text>
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

export function ProductsEmpty() {
  return (
    <EmptyMessage icon={<TagMultipleRegular />} title="No products yet">
      The catalogue is filled when the van stock book is imported. Run the import, then reload this page.
    </EmptyMessage>
  );
}

export function ProductsNoResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <EmptyMessage
      icon={<BoxSearchRegular />}
      title="No matching products"
      action={<Button onClick={onClear}>Clear search</Button>}
    >
      Nothing in the catalogue has a name or SKU containing “{query.trim()}”.
    </EmptyMessage>
  );
}
