"use client";

import { Text, makeStyles, tokens } from "@fluentui/react-components";
import type { VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { VanCard, type BoardVan } from "./van-card";

const useStyles = makeStyles({
  legend: { color: tokens.colorNeutralForeground3, maxWidth: "720px" },
  grid: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
    gap: tokens.spacingHorizontalM,
  },
  empty: { color: tokens.colorNeutralForeground3 },
});

interface VanListProps {
  vans: BoardVan[];
  boardDate: string;
  selectedJob: JobDto | null;
  /** The backend's ranking for the selected request; vans are shown in that order. */
  eligibility: VanEligibilityDto[] | null;
}

export function VanList({ vans, boardDate, selectedJob, eligibility }: VanListProps) {
  const styles = useStyles();
  if (vans.length === 0) {
    return <Text className={styles.empty}>There are no vans on the road or in the garage.</Text>;
  }

  const verdicts = new Map(eligibility?.map((e, rank) => [e.vanId, { e, rank }]) ?? []);
  const ordered = eligibility
    ? [...vans].sort((a, b) => (verdicts.get(a.van.id)?.rank ?? Infinity) - (verdicts.get(b.van.id)?.rank ?? Infinity))
    : vans;

  return (
    <>
      <Text size={200} className={styles.legend}>
        <strong>Working</strong> is what is physically in the van. <strong>Reserved</strong> is promised to assigned
        jobs. <strong>Available</strong> is what a new job can use; broken units and units waiting for a serial are
        never available.
        {eligibility && selectedJob && ` Ordered for ${selectedJob.reference}: vans that can take it first, then the job's zone.`}
      </Text>
      <ul className={styles.grid} aria-label="Vans">
        {ordered.map((entry) => (
          <li key={entry.van.id}>
            <VanCard
              entry={entry}
              boardDate={boardDate}
              selectedJob={selectedJob}
              eligibility={verdicts.get(entry.van.id)?.e}
            />
          </li>
        ))}
      </ul>
    </>
  );
}
