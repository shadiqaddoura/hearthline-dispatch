"use client";

import {
  Badge,
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import type { VanEligibilityDto } from "@/lib/contracts/dispatch";
import { VAN_PROBLEM_LABEL } from "@/lib/dispatch/presentation";
import type { EligibilityState } from "./use-dispatch-data";

const useStyles = makeStyles({
  verdict: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.spacingHorizontalXS },
  problems: {
    margin: 0,
    paddingInlineStart: tokens.spacingHorizontalL,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
  },
  problemLabel: { fontWeight: tokens.fontWeightSemibold },
  secondary: { color: tokens.colorNeutralForeground3 },
  reasons: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  checking: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
});

/**
 * One van's verdict for the selected job, with the backend's specific reasons.
 * `vanStatus` (e.g. "In the garage") reads better than the API's status code.
 */
export function VanEligibilityReasons({
  eligibility,
  vanStatus,
}: {
  eligibility: VanEligibilityDto;
  vanStatus?: string;
}) {
  const styles = useStyles();
  // Product blockers are explained once in the structured product comparison.
  const otherProblems = eligibility.problems.filter(
    (problem) => problem.code !== "INSUFFICIENT_STOCK" && problem.code !== "UNITS_NEED_VERIFICATION",
  );
  return (
    <div className={styles.reasons}>
      <div className={styles.verdict}>
        {eligibility.eligible ? (
          <Badge appearance="filled" color="success" shape="rounded">
            Can take this job
          </Badge>
        ) : (
          <Badge appearance="tint" color="danger" shape="rounded">
            Can&apos;t take this job
          </Badge>
        )}
        {eligibility.zoneMatch && (
          <Badge appearance="outline" color="brand" shape="rounded">
            Same zone
          </Badge>
        )}
      </div>
      {otherProblems.length > 0 && (
        <ul className={styles.problems}>
          {otherProblems.map((problem) => (
            <li key={problem.code}>
              <Text size={200}>
                <span className={styles.problemLabel}>{VAN_PROBLEM_LABEL[problem.code]}:</span>{" "}
                {problemDetail(problem.code, eligibility, vanStatus)}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function problemDetail(
  code: VanEligibilityDto["problems"][number]["code"],
  van: VanEligibilityDto,
  vanStatus?: string,
): string {
  if (code === "VAN_NOT_ACTIVE" && vanStatus) return `${van.code} is ${vanStatus.toLowerCase()}`;
  return van.problems.find((p) => p.code === code)!.message;
}

interface EligibilitySummaryProps {
  state: EligibilityState;
  onRetry: () => void;
}

/** Which vans can take the selected request, or why none can. */
export function EligibilitySummary({ state, onRetry }: EligibilitySummaryProps) {
  const styles = useStyles();

  switch (state.status) {
    case "idle":
      return null;
    case "loading":
      return (
        <div className={styles.checking} role="status">
          <Spinner size="tiny" />
          <Text size={200}>Checking which vans can take this job…</Text>
        </div>
      );
    case "error":
      return (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>Eligible vans couldn&apos;t be checked.</MessageBarTitle>
            {state.message}
          </MessageBarBody>
          <MessageBarActions>
            <Button icon={<ArrowClockwiseRegular />} onClick={onRetry}>
              Retry
            </Button>
          </MessageBarActions>
        </MessageBar>
      );
    case "ready": {
      const eligible = state.vans.filter((v) => v.eligible);
      if (eligible.length === 0) {
        return (
          <MessageBar intent="warning" layout="multiline" role="status">
            <MessageBarBody>
              <MessageBarTitle>No van can take this job right now.</MessageBarTitle>
              {state.vans.length === 0
                ? "There are no vans to check."
                : "Review van reasons. Stock, serial or driver changes may unblock this job."}
            </MessageBarBody>
          </MessageBar>
        );
      }
      return (
        <Text role="status">
          <strong>
            {eligible.length} {eligible.length === 1 ? "van can" : "vans can"} take this job:
          </strong>{" "}
          <span className={styles.secondary}> Review van choices. Zone is a preference, not a requirement.</span>
        </Text>
      );
    }
  }
}
