"use client";

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
import { ArrowClockwiseRegular, BoxCheckmarkRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  skeleton: {
    display: "grid",
    gap: tokens.spacingHorizontalL,
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
    "@media (max-width: 1023px)": { gridTemplateColumns: "1fr" },
  },
  column: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  block: { height: "72px" },
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
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusLarge,
  },
  emptyIcon: { fontSize: "40px", color: tokens.colorNeutralForeground3 },
  emptyBody: { color: tokens.colorNeutralForeground3, maxWidth: "460px" },
});

export function RestockLoading() {
  const styles = useStyles();
  return (
    <div role="status">
      <span className={styles.visuallyHidden}>Loading restock jobs…</span>
      <Skeleton aria-hidden className={styles.skeleton}>
        {[4, 3].map((count, column) => (
          <div key={column} className={styles.column}>
            {Array.from({ length: count }, (_, i) => (
              <SkeletonItem key={i} shape="rectangle" className={styles.block} />
            ))}
          </div>
        ))}
      </Skeleton>
    </div>
  );
}

export function RestockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <MessageBar intent="error" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>The restock list couldn&apos;t be loaded.</MessageBarTitle>
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

export function RestockEmpty() {
  const styles = useStyles();
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden>
        <BoxCheckmarkRegular />
      </span>
      <Text as="h2" size={400} weight="semibold">
        No van needs restocking
      </Text>
      <Text className={styles.emptyBody}>
        Every active van is at or above its minimums for products that are restocked automatically. A restock job opens
        by itself when a van falls below one.
      </Text>
    </div>
  );
}
