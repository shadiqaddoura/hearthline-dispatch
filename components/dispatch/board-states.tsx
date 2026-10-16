"use client";

import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Skeleton,
  SkeletonItem,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
  skeleton: {
    display: "grid",
    gap: tokens.spacingHorizontalL,
    gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
    "@media (max-width: 1023px)": { gridTemplateColumns: "1fr" },
  },
  column: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  block: { height: "88px" },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
});

export function BoardLoading() {
  const styles = useStyles();
  return (
    <div role="status">
      <span className={styles.visuallyHidden}>Loading the dispatch board…</span>
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

export function BoardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <MessageBar intent="error" layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>The dispatch board couldn&apos;t be loaded.</MessageBarTitle>
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
