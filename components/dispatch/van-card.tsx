"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Card,
  CardHeader,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { VAN_STATUS_LABEL, scheduleLabel } from "@/lib/dispatch/presentation";
import { VanEligibilityReasons } from "./eligibility";
import { JobStatusBadge } from "./job-badges";
import { JobItemsOnVan, StockTable } from "./stock-summary";

export type BoardVan = DispatchBoardDto["vans"][number];

const useStyles = makeStyles({
  card: { gap: tokens.spacingVerticalM, borderLeft: `${tokens.strokeWidthThickest} solid transparent` },
  eligible: { borderLeftColor: tokens.colorPaletteGreenBorderActive, backgroundColor: tokens.colorPaletteGreenBackground1 },
  assignedHere: { borderLeftColor: tokens.colorBrandStroke1 },
  dimmed: { backgroundColor: tokens.colorNeutralBackground2 },
  title: { display: "flex", alignItems: "baseline", gap: tokens.spacingHorizontalS },
  plate: { color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  badges: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
    margin: 0,
  },
  term: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  definition: { margin: 0, fontSize: tokens.fontSizeBase200 },
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  sectionTitle: { margin: 0 },
  jobs: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  job: { fontSize: tokens.fontSizeBase200 },
  secondary: { color: tokens.colorNeutralForeground3 },
});

interface VanCardProps {
  entry: BoardVan;
  boardDate: string;
  selectedJob: JobDto | null;
  /** The backend's verdict for the selected request, once loaded. */
  eligibility?: VanEligibilityDto;
}

export function VanCard({ entry, boardDate, selectedJob, eligibility }: VanCardProps) {
  const styles = useStyles();
  const { van, stock, assignedJobs, jobsToday } = entry;
  const assignedToSelected = selectedJob?.van?.id === van.id;
  const completedToday = jobsToday.filter((job) => job.status === "COMPLETED").length;
  const titleId = `van-${van.id}-title`;

  return (
    <Card
      aria-labelledby={titleId}
      className={mergeClasses(
        styles.card,
        eligibility?.eligible && styles.eligible,
        assignedToSelected && styles.assignedHere,
        eligibility && !eligibility.eligible && styles.dimmed,
      )}
    >
      <CardHeader
        header={
          <span className={styles.title}>
            <Text as="h3" id={titleId} size={400} weight="semibold" style={{ margin: 0 }}>
              {van.code}
            </Text>
            {van.plate && <span className={styles.plate}>{van.plate}</span>}
          </span>
        }
        description={
          <span className={styles.badges}>
            <Badge appearance="tint" color={van.status === "ACTIVE" ? "success" : "warning"} shape="rounded">
              {VAN_STATUS_LABEL[van.status]}
            </Badge>
            {van.isPool && (
              <Badge appearance="outline" color="informative" shape="rounded">
                Pool van
              </Badge>
            )}
            {!van.technician && (
              <Badge appearance="tint" color="danger" shape="rounded">
                No driver
              </Badge>
            )}
          </span>
        }
      />

      <dl className={styles.facts}>
        <dt className={styles.term}>Technician</dt>
        <dd className={styles.definition}>{van.technician?.name ?? "None assigned"}</dd>
        <dt className={styles.term}>Usual zone</dt>
        <dd className={styles.definition}>{van.zone ?? "None set"}</dd>
        {van.statusNote && van.statusNote.trim().toLowerCase() !== van.status.toLowerCase() && (
          <>
            <dt className={styles.term}>Note</dt>
            <dd className={styles.definition}>{van.statusNote}</dd>
          </>
        )}
      </dl>

      {selectedJob && (eligibility || assignedToSelected) && (
        <section className={styles.section} aria-label={`${van.code} for ${selectedJob.reference}`}>
          {eligibility && <VanEligibilityReasons eligibility={eligibility} vanStatus={VAN_STATUS_LABEL[van.status]} />}
          {assignedToSelected && (
            <span className={styles.badges}>
              <Badge appearance="filled" color="brand" shape="rounded">
                Has {selectedJob.reference}
              </Badge>
            </span>
          )}
          <JobItemsOnVan
            items={selectedJob.items}
            lines={stock.lines}
            vanCode={van.code}
            shortages={eligibility?.shortages}
          />
        </section>
      )}

      <section className={styles.section} aria-labelledby={`${titleId}-jobs`}>
        <Text as="h4" id={`${titleId}-jobs`} size={200} weight="semibold" className={styles.sectionTitle}>
          Assigned jobs ({assignedJobs.length})
        </Text>
        {assignedJobs.length === 0 ? (
          <Text size={200} className={styles.secondary}>
            No assigned jobs.
          </Text>
        ) : (
          <ol className={styles.jobs}>
            {assignedJobs.map((job) => (
              <li key={job.id} className={styles.job}>
                {scheduleLabel(job)} — {job.reference}, {job.customer.name} <JobStatusBadge status={job.status} />
              </li>
            ))}
          </ol>
        )}
        {completedToday > 0 && (
          <Text size={200} className={styles.secondary}>
            Completed on the board date: {completedToday}
          </Text>
        )}
      </section>

      <Accordion collapsible>
        <AccordionItem value="stock">
          <AccordionHeader size="small">All stock ({stock.lines.length} products)</AccordionHeader>
          <AccordionPanel>
            <StockTable lines={stock.lines} caption={`${van.code} stock on ${boardDate}`} />
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}
