"use client";

import { Field, Input, Text, makeStyles, tokens } from "@fluentui/react-components";
import type { JobDto } from "@/lib/contracts/jobs";
import { describeWaitingTime, formatDay, isIsoDay, requestedOnLabel } from "@/lib/dispatch/presentation";
import type { ScheduleInput } from "@/lib/dispatch/scheduling";
import type { FieldErrors } from "./use-assignment";

const useStyles = makeStyles({
  root: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: tokens.spacingHorizontalM,
    "@media (max-width: 479px)": { gridTemplateColumns: "1fr" },
  },
  requested: { color: tokens.colorNeutralForeground3 },
});

interface ScheduleFieldsProps {
  job: JobDto;
  value: ScheduleInput;
  onChange: (value: ScheduleInput) => void;
  errors: FieldErrors;
  /** The board's day (London), the earliest day the server accepts for a new schedule. */
  today: string;
  /** Jobs already on the chosen van, to show which positions are taken that day. */
  vanJobs: JobDto[];
  vanCode: string | null;
  disabled?: boolean;
}

/**
 * The planned calendar day and position in the van's day. Both optional. The
 * request date is shown beside them and never changes.
 */
export function ScheduleFields({ job, value, onChange, errors, today, vanJobs, vanCode, disabled }: ScheduleFieldsProps) {
  const styles = useStyles();
  const sameDay = isIsoDay(value.date)
    ? vanJobs.filter((j) => j.id !== job.id && j.scheduledFor === value.date)
    : [];

  return (
    <fieldset className={styles.root} style={{ border: 0, padding: 0, margin: 0 }} disabled={disabled}>
      <Text weight="semibold" as="h3" size={300} style={{ margin: 0 }}>
        Schedule (optional)
      </Text>
      <Text size={200} className={styles.requested}>
        Requested on {requestedOnLabel(describeWaitingTime(job))}. That date stays as recorded, and waiting time keeps
        counting from it.
      </Text>
      <div className={styles.row}>
        <Field
          label="Scheduled day"
          validationMessage={errors.scheduledFor}
          hint="Leave empty to schedule later."
        >
          <Input
            type="date"
            value={value.date}
            min={isIsoDay(today) ? today : undefined}
            onChange={(_, data) => onChange({ ...value, date: data.value })}
          />
        </Field>
        <Field
          label="Position in the van's day"
          validationMessage={errors.sequence}
          hint={positionHint(sameDay, vanCode, value.date)}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={value.position}
            disabled={!value.date}
            onChange={(_, data) => onChange({ ...value, position: data.value })}
          />
        </Field>
      </div>
    </fieldset>
  );
}

function positionHint(sameDay: JobDto[], vanCode: string | null, date: string): string {
  if (!isIsoDay(date)) return "Choose a day first.";
  if (!vanCode) return "1 is the van's first visit that day.";
  if (sameDay.length === 0) return `${vanCode} has nothing else on ${formatDay(date)}.`;
  const taken = [...sameDay]
    .sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity))
    .map((j) => (j.sequence ? `#${j.sequence} ${j.reference}` : `${j.reference} (no position)`));
  return `Already on ${vanCode} that day: ${taken.join(", ")}.`;
}
