"use client";

import {
  Badge,
  Text,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens,
  useArrowNavigationGroup,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import type { RestockJobDto } from "@/lib/contracts/restocking";
import { brokenLabel, restockProgress, toCollectLabel } from "@/lib/restocking/presentation";

const useStyles = makeStyles({
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  // Box properties only on the Button; layout on `content`, which Button doesn't style.
  item: {
    width: "100%",
    height: "auto",
    maxWidth: "none",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontWeight: tokens.fontWeightRegular,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: `inset ${tokens.strokeWidthThickest} 0 0 ${tokens.colorBrandStroke1}`,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
    ":hover:active": { backgroundColor: tokens.colorBrandBackground2Pressed },
  },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS, width: "100%", textAlign: "start" },
  row: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: tokens.spacingHorizontalS },
  van: { fontWeight: tokens.fontWeightSemibold },
  secondary: { color: tokens.colorNeutralForeground3 },
  badges: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS, marginTop: tokens.spacingVerticalXXS },
});

interface RestockJobListProps {
  jobs: RestockJobDto[];
  selectedId: string | null;
  onSelect: (job: RestockJobDto) => void;
}

/** One entry per van with an open restock job. One Tab stop; arrow keys move between vans. */
export function RestockJobList({ jobs, selectedId, onSelect }: RestockJobListProps) {
  const styles = useStyles();
  const arrowNavigation = useArrowNavigationGroup({ axis: "vertical", memorizeCurrent: true });
  // On phones a van opens a details drawer; closing it returns focus here.
  const restoreFocusTarget = useRestoreFocusTarget();

  return (
    <ul className={styles.list} aria-label="Vans with an open restock job" {...arrowNavigation}>
      {jobs.map((job) => {
        const progress = restockProgress(job);
        const selected = job.id === selectedId;
        return (
          <li key={job.id}>
            <ToggleButton
              {...restoreFocusTarget}
              appearance="subtle"
              checked={selected}
              onClick={() => onSelect(job)}
              className={mergeClasses(styles.item, selected && styles.selected)}
            >
              <span className={styles.content}>
                <span className={styles.row}>
                  <span className={styles.van}>{job.van.code}</span>
                  <Text size={200} className={styles.secondary}>
                    {job.van.technician?.name ?? "No driver"}
                  </Text>
                </span>
                <Text size={200}>{toCollectLabel(progress.toCollect)}</Text>
                <span className={styles.badges}>
                  {progress.collectedProducts > 0 && (
                    <Badge appearance="tint" color="success" shape="rounded">
                      Partly collected
                    </Badge>
                  )}
                  {progress.brokenUnits > 0 && (
                    <Badge appearance="tint" color="warning" shape="rounded">
                      {brokenLabel(progress.brokenUnits)}
                    </Badge>
                  )}
                  {job.items.some((i) => i.balanceNeedsReview) && (
                    <Badge appearance="tint" color="danger" shape="rounded">
                      Count needs review
                    </Badge>
                  )}
                </span>
              </span>
            </ToggleButton>
          </li>
        );
      })}
    </ul>
  );
}
