"use client";

import { Badge, MessageBar, MessageBarBody, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { RestockJobDto } from "@/lib/contracts/restocking";
import { brokenLabel, formatTimestamp, restockProgress, toCollectLabel } from "@/lib/restocking/presentation";
import { BrokenReturns } from "./broken-returns";
import { PickList } from "./pick-list";
import { PolicyNotice } from "./policy-notice";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  header: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXS },
  title: { margin: 0 },
  secondary: { color: tokens.colorNeutralForeground3 },
  badges: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  sectionTitle: { margin: 0 },
});

/** One van's restock job: who drives it, what to collect, what to return, and what policy leaves out. */
export function RestockDetails({ job, compact }: { job: RestockJobDto; compact: boolean }) {
  const styles = useStyles();
  const progress = restockProgress(job);
  const titleId = `restock-${job.id}-title`;

  return (
    <article className={styles.root} aria-labelledby={titleId}>
      <VanSummary job={job} titleId={titleId} />

      <section className={styles.section} aria-labelledby={`${titleId}-pick`}>
        <Text as="h3" id={`${titleId}-pick`} size={400} weight="semibold" className={styles.sectionTitle}>
          Working stock to collect
        </Text>
        <Text size={200} className={styles.secondary}>
          Planned collection: to collect = minimum − working units in the van, never below zero. Reserved units still
          count as in the van; broken ones don&apos;t. Nothing is added to the van until a collection is confirmed at the
          hub, which isn&apos;t available on this page yet.
        </Text>
        {job.items.length === 0 || progress.toCollect === 0 ? (
          <MessageBar intent="success">
            <MessageBarBody>Nothing left to collect for {job.van.code}.</MessageBarBody>
          </MessageBar>
        ) : null}
        {job.items.length > 0 && <PickList items={job.items} vanCode={job.van.code} compact={compact} />}
      </section>

      <PolicyNotice exclusions={job.policyExclusions} vanCode={job.van.code} />
      <BrokenReturns job={job} />
    </article>
  );
}

function VanSummary({ job, titleId }: { job: RestockJobDto; titleId: string }) {
  const styles = useStyles();
  const progress = restockProgress(job);
  return (
    <header className={styles.header}>
      <Text as="h2" id={titleId} size={500} weight="semibold" className={styles.title}>
        {job.van.code} restock
      </Text>
      <Text className={styles.secondary}>
        {job.van.technician ? `Driven by ${job.van.technician.name}` : "No driver assigned"} · open since{" "}
        {formatTimestamp(job.createdAt)} · pick list updated {formatTimestamp(job.updatedAt)}
      </Text>
      <span className={styles.badges}>
        <Badge appearance="tint" color="brand" shape="rounded">
          {job.status === "OPEN" ? "Open" : "Closed"}
        </Badge>
        <Badge appearance="tint" color="informative" shape="rounded">
          {toCollectLabel(progress.toCollect)}
        </Badge>
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
        {!job.van.technician && (
          <Badge appearance="tint" color="danger" shape="rounded">
            No driver
          </Badge>
        )}
      </span>
    </header>
  );
}
