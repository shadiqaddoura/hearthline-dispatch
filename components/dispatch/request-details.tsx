"use client";

import type { ReactNode } from "react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { JobDto } from "@/lib/contracts/jobs";
import {
  BLOCKING_REASON_LABEL,
  JOB_TYPE_LABEL,
  describeWaitingTime,
  formatDay,
  isIsoDay,
  requestedOnLabel,
  scheduleLabel,
  waitingLabel,
  type WaitingTime,
} from "@/lib/dispatch/presentation";
import { EligibilitySummary } from "./eligibility";
import { JobStatusBadge } from "./job-badges";
import type { EligibilityState } from "./use-dispatch-data";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  header: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS },
  title: { margin: 0 },
  secondary: { color: tokens.colorNeutralForeground3 },
  badges: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  facts: {
    display: "grid",
    gridTemplateColumns: "minmax(120px, max-content) 1fr",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalXS,
    margin: 0,
  },
  term: { color: tokens.colorNeutralForeground3 },
  definition: { margin: 0 },
  hint: { display: "block", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  sku: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  quantity: { textAlign: "end", width: "80px", fontVariantNumeric: "tabular-nums" },
  sectionTitle: { margin: 0 },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
});

interface RequestDetailsProps {
  job: JobDto;
  /** The day waiting time is counted to. */
  boardDate: string;
  eligibility: EligibilityState;
  onRetryEligibility: () => void;
  /** Assignment or scheduling controls for this job. */
  actions?: ReactNode;
  /** Mobile keeps this context in the drawer header. */
  hideHeader?: boolean;
}

export function RequestDetails({
  job,
  boardDate,
  eligibility,
  onRetryEligibility,
  actions,
  hideHeader = false,
}: RequestDetailsProps) {
  const styles = useStyles();
  const waiting = describeWaitingTime(job);

  return (
    <article className={styles.root} aria-labelledby={`request-${job.id}-title`}>
      {!hideHeader && (
        <header className={styles.header}>
          <Text as="h2" id={`request-${job.id}-title`} size={500} weight="semibold" className={styles.title}>
            {job.customer.name} — {job.branch.name}
          </Text>
          <Text size={200} className={styles.secondary}>
            {job.reference} · {JOB_TYPE_LABEL[job.type]} · zone {job.branch.zone ?? "not set"}
          </Text>
          <span className={styles.badges}>
            <Text weight="semibold">{waitingLabel(waiting)}</Text>
            {job.status !== "REQUESTED" && <JobStatusBadge status={job.status} />}
          </span>
        </header>
      )}

      <section aria-labelledby={`request-${job.id}-items`}>
        <Text as="h3" id={`request-${job.id}-items`} size={300} weight="semibold" className={styles.sectionTitle}>
          Required products
        </Text>
        {job.items.length === 0 ? (
          <Text className={styles.secondary}>No products were recorded for this job.</Text>
        ) : (
          <Table size="small" aria-label={`Products required for ${job.reference}`}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Product</TableHeaderCell>
                <TableHeaderCell className={styles.quantity}>Quantity</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell>
                    <span className={styles.sku}>{item.sku}</span> {item.name}
                  </TableCell>
                  <TableCell className={styles.quantity}>{item.quantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {job.status === "REQUESTED" ? (
        <EligibilitySummary state={eligibility} onRetry={onRetryEligibility} />
      ) : (
        <Text size={200} className={styles.secondary}>
          Already on {job.van?.code ?? "a van"}.
          {job.status === "ASSIGNED"
            ? " Its day and position can change; moving it to another van isn't available yet."
            : " It has started, so its schedule can't change."}
        </Text>
      )}

      {job.status !== "REQUESTED" && (
        <Text>
          {job.van?.code ?? "None"}
          {job.technician ? ` with ${job.technician.name}` : " (no technician)"} · {scheduleLabel(job)}
        </Text>
      )}
      {job.status !== "REQUESTED" && job.blockingReason && (
        <Text role="status">
          {BLOCKING_REASON_LABEL[job.blockingReason]} — check recorded details before continuing.
        </Text>
      )}
      {job.status === "REQUESTED" && job.blockingReason === "IMPORT_NEEDS_REVIEW" && (
        <Text>Import needs review — check the recorded details before assigning.</Text>
      )}
      <Accordion collapsible>
        <AccordionItem value="recorded">
          <AccordionHeader size="small">Recorded details &amp; notes</AccordionHeader>
          <AccordionPanel>
            <dl className={styles.facts}>
              <dt className={styles.term}>Requested on</dt>
              <dd className={styles.definition}>{requestedOnLabel(waiting)}</dd>
              <dt className={styles.term}>Waiting time</dt>
              <dd className={styles.definition}>
                {waitingLabel(waiting)}
                <span className={styles.hint}>{waitingHint(waiting, boardDate)}</span>
              </dd>
              {job.status === "REQUESTED" && job.scheduledFor && (
                <>
                  <dt className={styles.term}>Planned day</dt>
                  <dd className={styles.definition}>
                    {scheduleLabel(job)}
                    <span className={styles.hint}>
                      Recorded before assignment; it can be kept or changed when assigning.
                    </span>
                  </dd>
                </>
              )}
              {job.status !== "REQUESTED" && (
                <>
                  <dt className={styles.term}>Van</dt>
                  <dd className={styles.definition}>
                    {job.van?.code ?? "None"}
                    {job.technician ? ` with ${job.technician.name}` : " (no technician)"}
                  </dd>
                  <dt className={styles.term}>Scheduled</dt>
                  <dd className={styles.definition}>{scheduleLabel(job)}</dd>
                </>
              )}
              {job.sourceStatus && (
                <>
                  <dt className={styles.term}>Imported status</dt>
                  <dd className={styles.definition}>“{job.sourceStatus}”</dd>
                </>
              )}
            </dl>

            {job.blockingReason && (
              <Text as="p">
                <strong>{BLOCKING_REASON_LABEL[job.blockingReason]}: </strong>
                {job.blockingDetail ?? "No further detail was recorded."}
              </Text>
            )}
            {job.notes && <Text as="p">Notes: {job.notes}</Text>}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {actions && <div className={styles.actions}>{actions}</div>}
    </article>
  );
}

function waitingHint(waiting: WaitingTime, boardDate: string): string {
  const today = isIsoDay(boardDate) ? formatDay(boardDate) : boardDate;
  switch (waiting.kind) {
    case "waiting":
      return `Calendar days from the request date to ${today}. The scheduled date doesn't change it.`;
    case "missing-date":
      return "The request date wasn't recorded, so waiting time can't be counted.";
    case "invalid-date":
      return "The recorded request date isn't a real calendar day, so waiting time can't be counted.";
    case "future-date":
      return `The recorded request date is after ${today}. It is shown as recorded; check it with the customer.`;
    case "not-counted":
      return "The server didn't count waiting time for this job.";
  }
}
