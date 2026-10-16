"use client";

import type { ReactNode } from "react";
import {
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
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
import { BlockingBadge, JobStatusBadge } from "./job-badges";
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
});

interface RequestDetailsProps {
  job: JobDto;
  /** The day waiting time is counted to. */
  boardDate: string;
  eligibility: EligibilityState;
  onRetryEligibility: () => void;
  /** Extra controls for the layout, e.g. "Show vans" on phones. */
  footer?: ReactNode;
}

export function RequestDetails({ job, boardDate, eligibility, onRetryEligibility, footer }: RequestDetailsProps) {
  const styles = useStyles();
  const waiting = describeWaitingTime(job);

  return (
    <article className={styles.root} aria-labelledby={`request-${job.id}-title`}>
      <header className={styles.header}>
        <Text as="h2" id={`request-${job.id}-title`} size={500} weight="semibold" className={styles.title}>
          {job.customer.name} — {job.branch.name}
        </Text>
        <Text size={200} className={styles.secondary}>
          {job.reference} · {JOB_TYPE_LABEL[job.type]} · zone {job.branch.zone ?? "not set"}
        </Text>
        <span className={styles.badges}>
          <JobStatusBadge status={job.status} />
          {job.blockingReason && <BlockingBadge reason={job.blockingReason} />}
        </span>
      </header>

      <dl className={styles.facts}>
        <dt className={styles.term}>Requested on</dt>
        <dd className={styles.definition}>{requestedOnLabel(waiting)}</dd>
        <dt className={styles.term}>Waiting time</dt>
        <dd className={styles.definition}>
          {waitingLabel(waiting)}
          <span className={styles.hint}>{waitingHint(waiting, boardDate)}</span>
        </dd>
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
        <MessageBar intent={job.blockingReason === "IMPORT_NEEDS_REVIEW" ? "warning" : "error"} layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{BLOCKING_REASON_LABEL[job.blockingReason]}</MessageBarTitle>
            {job.blockingDetail ?? "No further detail was recorded."}
          </MessageBarBody>
        </MessageBar>
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

      {job.notes && (
        <Text>
          <span className={styles.term}>Notes: </span>
          {job.notes}
        </Text>
      )}

      {job.status === "REQUESTED" ? (
        <EligibilitySummary state={eligibility} onRetry={onRetryEligibility} />
      ) : (
        <Text size={200} className={styles.secondary}>
          Already on {job.van?.code ?? "a van"}. Moving or rescheduling it isn&apos;t available yet.
        </Text>
      )}

      {footer}
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
