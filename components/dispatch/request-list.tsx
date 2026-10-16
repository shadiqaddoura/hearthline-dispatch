"use client";

import {
  Text,
  ToggleButton,
  makeStyles,
  mergeClasses,
  tokens,
  useArrowNavigationGroup,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import type { JobDto } from "@/lib/contracts/jobs";
import { describeWaitingTime, scheduleLabel, waitingLabel } from "@/lib/dispatch/presentation";
import { BlockingBadge, JobStatusBadge } from "./job-badges";

const useStyles = makeStyles({
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  heading: { margin: 0 },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  // Only box properties on the Button itself; the layout lives on `content`, which
  // Button doesn't style, so it can't lose to Button's own alignment rules.
  item: {
    width: "100%",
    height: "auto",
    maxWidth: "none",
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontWeight: tokens.fontWeightRegular,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    width: "100%",
    textAlign: "start",
  },
  // A tinted background and a bar on the leading edge, so selection doesn't rely on colour alone.
  selected: {
    backgroundColor: tokens.colorBrandBackground2,
    boxShadow: `inset ${tokens.strokeWidthThickest} 0 0 ${tokens.colorBrandStroke1}`,
    ":hover": { backgroundColor: tokens.colorBrandBackground2Hover },
    ":hover:active": { backgroundColor: tokens.colorBrandBackground2Pressed },
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
  },
  customer: { fontWeight: tokens.fontWeightSemibold },
  secondary: { color: tokens.colorNeutralForeground3 },
  badges: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS, marginTop: tokens.spacingVerticalXXS },
  waiting: { fontVariantNumeric: "tabular-nums", fontWeight: tokens.fontWeightSemibold, whiteSpace: "nowrap" },
  empty: { color: tokens.colorNeutralForeground3, paddingBlock: tokens.spacingVerticalS },
});

interface RequestListProps {
  awaiting: JobDto[];
  assigned: JobDto[];
  selectedId: string | null;
  onSelect: (job: JobDto) => void;
}

/** Unfinished customer work in two groups: waiting for a van, and already on one. */
export function RequestList({ awaiting, assigned, selectedId, onSelect }: RequestListProps) {
  return (
    <>
      <RequestGroup
        title="Awaiting assignment"
        jobs={awaiting}
        empty="Nothing is waiting for a van."
        selectedId={selectedId}
        onSelect={onSelect}
      />
      <RequestGroup
        title="Assigned or in progress"
        jobs={assigned}
        empty="No customer work is assigned to a van."
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </>
  );
}

function RequestGroup({
  title,
  jobs,
  empty,
  selectedId,
  onSelect,
}: {
  title: string;
  jobs: JobDto[];
  empty: string;
  selectedId: string | null;
  onSelect: (job: JobDto) => void;
}) {
  const styles = useStyles();
  // One Tab stop per group; arrow keys move between its requests.
  const arrowNavigation = useArrowNavigationGroup({ axis: "vertical", memorizeCurrent: true });
  // On phones a request opens a details drawer; closing it returns focus here.
  const restoreFocusTarget = useRestoreFocusTarget();
  const headingId = `requests-${title.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <Text as="h3" id={headingId} size={300} weight="semibold" className={styles.heading}>
        {title} ({jobs.length})
      </Text>
      {jobs.length === 0 ? (
        <Text size={200} className={styles.empty}>
          {empty}
        </Text>
      ) : (
        <ul className={styles.list} aria-labelledby={headingId} {...arrowNavigation}>
          {jobs.map((job) => (
            <li key={job.id}>
              <RequestItem
                job={job}
                selected={job.id === selectedId}
                onSelect={onSelect}
                focusTarget={restoreFocusTarget}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestItem({
  job,
  selected,
  onSelect,
  focusTarget,
}: {
  job: JobDto;
  selected: boolean;
  onSelect: (job: JobDto) => void;
  focusTarget: ReturnType<typeof useRestoreFocusTarget>;
}) {
  const styles = useStyles();
  const waiting = describeWaitingTime(job);

  return (
    <ToggleButton
      {...focusTarget}
      appearance="subtle"
      checked={selected}
      onClick={() => onSelect(job)}
      className={mergeClasses(styles.item, selected && styles.selected)}
    >
      <span className={styles.content}>
        <span className={styles.row}>
          <span className={styles.customer}>{job.customer.name}</span>
          <Text size={200} className={styles.waiting}>
            {waitingLabel(waiting)}
          </Text>
        </span>
        <Text size={200} className={styles.secondary}>
          {job.branch.name}
          {job.branch.zone ? ` · ${job.branch.zone}` : ""} · {job.reference}
        </Text>
        {job.van && (
          <Text size={200} className={styles.secondary}>
            {job.van.code}, {scheduleLabel(job)}
          </Text>
        )}
        <span className={styles.badges}>
          {job.status !== "REQUESTED" && <JobStatusBadge status={job.status} />}
          {job.blockingReason && <BlockingBadge reason={job.blockingReason} />}
        </span>
      </span>
    </ToggleButton>
  );
}
