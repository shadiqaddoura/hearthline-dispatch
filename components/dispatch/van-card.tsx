"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Card,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { VAN_PROBLEM_LABEL, VAN_STATUS_LABEL, scheduleLabel } from "@/lib/dispatch/presentation";
import { VanEligibilityReasons } from "./eligibility";
import { JobStatusBadge } from "./job-badges";
import { JobItemsOnVan, StockTable } from "./stock-summary";

export type BoardVan = DispatchBoardDto["vans"][number];

const useStyles = makeStyles({
  card: { gap: tokens.spacingVerticalXS, borderLeft: `${tokens.strokeWidthThickest} solid transparent` },
  eligible: { borderLeftColor: tokens.colorPaletteGreenBorderActive },
  assignedHere: { borderLeftColor: tokens.colorBrandStroke1 },
  summary: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalS,
  },
  identity: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: tokens.spacingHorizontalS },
  title: { margin: 0 },
  verdict: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.spacingHorizontalS },
  details: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  jobs: {
    margin: 0,
    paddingInlineStart: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
  },
  secondary: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

interface VanCardProps {
  entry: BoardVan;
  boardDate: string;
  selectedJob: JobDto | null;
  eligibility?: VanEligibilityDto;
}

/** Compare vans first; inspect the full server verdict, inventory and run list on demand. */
export function VanCard({ entry, boardDate, selectedJob, eligibility }: VanCardProps) {
  const styles = useStyles();
  const { van, stock, assignedJobs, jobsToday } = entry;
  const assignedToSelected = selectedJob?.van?.id === van.id;
  const titleId = `van-${van.id}-title`;

  return (
    <Card
      aria-labelledby={titleId}
      className={mergeClasses(
        styles.card,
        eligibility?.eligible && styles.eligible,
        assignedToSelected && styles.assignedHere,
      )}
    >
      <div className={styles.summary}>
        <div className={styles.identity}>
          <Text as="h3" id={titleId} size={400} weight="semibold" className={styles.title}>
            {van.code}
          </Text>
          <Text>{van.technician?.name ?? "No driver"}</Text>
          <Text className={styles.secondary}>
            {van.zone ?? "No usual zone"}
            {van.isPool ? " · Pool van" : ""}
          </Text>
        </div>
        <Text className={styles.secondary}>{jobsToday.length} jobs today</Text>
      </div>
      <div className={styles.verdict}>
        {eligibility ? (
          <>
            <Badge appearance="tint" color={eligibility.eligible ? "success" : "danger"} shape="rounded">
              {eligibility.eligible ? "Can take this job" : "Can't take this job"}
            </Badge>
            <Text className={styles.secondary}>
              {eligibility.eligible
                ? eligibility.zoneMatch
                  ? "Same zone"
                  : "Different zone · allowed"
                : eligibility.problems[0]
                  ? VAN_PROBLEM_LABEL[eligibility.problems[0].code]
                  : "See recorded reasons"}
            </Text>
          </>
        ) : (
          <Text className={styles.secondary}>{VAN_STATUS_LABEL[van.status]}</Text>
        )}
        {assignedToSelected && (
          <Badge appearance="tint" color="brand">
            Has {selectedJob.reference}
          </Badge>
        )}
      </div>
      <Accordion collapsible>
        <AccordionItem value="inventory">
          <AccordionHeader size="small">Inventory &amp; reasons · {assignedJobs.length} assigned</AccordionHeader>
          <AccordionPanel className={styles.details}>
            <Text size={200}>
              {van.plate ?? "Plate not recorded"} · {VAN_STATUS_LABEL[van.status]}
            </Text>
            {van.statusNote && <Text size={200}>{van.statusNote}</Text>}
            {eligibility && (
              <VanEligibilityReasons eligibility={eligibility} vanStatus={VAN_STATUS_LABEL[van.status]} />
            )}
            {selectedJob && (eligibility || assignedToSelected) && (
              <JobItemsOnVan
                items={selectedJob.items}
                lines={stock.lines}
                vanCode={van.code}
                shortages={eligibility?.shortages}
              />
            )}
            <Text size={200} className={styles.secondary}>
              Working is physical stock; reserved is promised to jobs. Available excludes reservations, broken units and
              units without verified serials.
            </Text>
            <StockTable lines={stock.lines} caption={`${van.code} stock on ${boardDate}`} />
            {assignedJobs.length > 0 && (
              <section aria-label={`${van.code} assigned jobs`}>
                <Text weight="semibold">Assigned jobs</Text>
                <ol className={styles.jobs}>
                  {assignedJobs.map((job) => (
                    <li key={job.id}>
                      {scheduleLabel(job)} — {job.reference}, {job.customer.name} <JobStatusBadge status={job.status} />
                    </li>
                  ))}
                </ol>
              </section>
            )}
            {jobsToday.length > 0 && (
              <section aria-label={`${van.code} jobs today`}>
                <Text weight="semibold">On {boardDate}</Text>
                <ul className={styles.jobs}>
                  {jobsToday.map((job) => (
                    <li key={job.id}>
                      {job.reference}, {job.customer.name} <JobStatusBadge status={job.status} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
