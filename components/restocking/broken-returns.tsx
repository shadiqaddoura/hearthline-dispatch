"use client";

import { Text, makeStyles, tokens } from "@fluentui/react-components";
import type { RestockJobDto } from "@/lib/contracts/restocking";
import { formatAmount, formatTimestamp } from "@/lib/restocking/presentation";

const useStyles = makeStyles({
  section: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  title: { margin: 0 },
  hint: { color: tokens.colorNeutralForeground3 },
  list: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  sku: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  serials: { display: "block", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
});

/**
 * Broken equipment in the van, listed apart from working stock to collect. The two
 * are never netted: a dead printer going back doesn't reduce what has to be picked.
 */
export function BrokenReturns({ job }: { job: RestockJobDto }) {
  const styles = useStyles();
  const titleId = `broken-${job.id}`;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <Text as="h3" id={titleId} size={400} weight="semibold" className={styles.title}>
        Broken equipment to return
      </Text>
      {job.brokenAwaitingReturn.length === 0 ? (
        <Text className={styles.hint}>No broken equipment is waiting in {job.van.code}.</Text>
      ) : (
        <>
          <Text size={200} className={styles.hint}>
            In the van now, waiting to go back to the hub. Not counted as working stock, and separate from what to collect.
          </Text>
          <ul className={styles.list}>
            {job.brokenAwaitingReturn.map((line) => (
              <li key={line.productId}>
                <Text>
                  <span className={styles.sku}>{line.sku}</span> {line.name}: {formatAmount(line.quantity, line.baseUnit)}
                </Text>
                <span className={styles.serials}>
                  {line.serials.length === 0
                    ? "No serials recorded"
                    : `Serials: ${line.serials.join(", ")}${line.serials.length < line.quantity ? ` (${line.quantity - line.serials.length} without a recorded serial)` : ""}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {job.returns.length > 0 && (
        <>
          <Text size={300} weight="semibold">
            Already returned under this job
          </Text>
          <ul className={styles.list}>
            {job.returns.map((r, i) => (
              <li key={`${r.productId}-${i}`}>
                <Text size={200}>
                  <span className={styles.sku}>{r.sku}</span> × {r.quantity} by {r.returnedBy}, {formatTimestamp(r.returnedAt)}
                  {r.serials.length > 0 ? ` (${r.serials.join(", ")})` : ""}
                </Text>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
