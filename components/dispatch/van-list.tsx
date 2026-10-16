"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { VanCard, type BoardVan } from "./van-card";

const useStyles = makeStyles({
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  empty: { color: tokens.colorNeutralForeground3 },
});

interface VanListProps {
  vans: BoardVan[];
  boardDate: string;
  selectedJob: JobDto | null;
  /** Preserve server ranking within active and unavailable groups. */
  eligibility: VanEligibilityDto[] | null;
}

export function VanList({ vans, boardDate, selectedJob, eligibility }: VanListProps) {
  const styles = useStyles();
  if (vans.length === 0) return <Text className={styles.empty}>There are no vans on the road or in the garage.</Text>;

  const verdicts = new Map(eligibility?.map((e, rank) => [e.vanId, { e, rank }]) ?? []);
  const ordered = eligibility
    ? [...vans].sort((a, b) => (verdicts.get(a.van.id)?.rank ?? Infinity) - (verdicts.get(b.van.id)?.rank ?? Infinity))
    : vans;
  const active = ordered.filter(({ van }) => van.status === "ACTIVE");
  const unavailable = ordered.filter(({ van }) => van.status !== "ACTIVE");
  const rows = (entries: BoardVan[], label: string) => (
    <ul className={styles.list} aria-label={label}>
      {entries.map((entry) => (
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
  );

  return (
    <>
      {active.length > 0 ? rows(active, "Vans") : <Text className={styles.empty}>No active vans.</Text>}
      {unavailable.length > 0 && (
        <Accordion collapsible>
          <AccordionItem value="off-road">
            <AccordionHeader size="small">Off-road / unavailable ({unavailable.length})</AccordionHeader>
            <AccordionPanel>{rows(unavailable, "Unavailable vans")}</AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </>
  );
}
