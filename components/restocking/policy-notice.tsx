"use client";

import { MessageBar, MessageBarBody, MessageBarTitle, makeStyles, tokens } from "@fluentui/react-components";
import type { PolicyExclusionDto } from "@/lib/contracts/restocking";
import { formatAmount } from "@/lib/restocking/presentation";

const useStyles = makeStyles({
  list: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL },
});

/**
 * Products below this van's minimum that are deliberately not on the pick list,
 * because automatic restocking is off for them (e.g. the provisional kitchen-display
 * exception). Shown so nobody mistakes the gap for a bug or "fixes" it by hand.
 */
export function PolicyNotice({ exclusions, vanCode }: { exclusions: PolicyExclusionDto[]; vanCode: string }) {
  const styles = useStyles();
  if (exclusions.length === 0) return null;
  const underReview = exclusions.some((e) => e.needsReview);

  return (
    <MessageBar intent={underReview ? "warning" : "info"} layout="multiline">
      <MessageBarBody>
        <MessageBarTitle>Not on this list: automatic restocking is off</MessageBarTitle>
        <ul className={styles.list}>
          {exclusions.map((e) => (
            <li key={e.productId}>
              {e.sku} {e.name}: {vanCode} has {formatAmount(e.working, e.baseUnit)} of a minimum of{" "}
              {formatAmount(e.vanMinimum, e.baseUnit)}.
              {e.needsReview ? " The policy is flagged for review" : ""}
              {e.note ? `${e.needsReview ? ": " : " "}${e.note}` : e.needsReview ? "." : ""}
            </li>
          ))}
        </ul>
      </MessageBarBody>
    </MessageBar>
  );
}
