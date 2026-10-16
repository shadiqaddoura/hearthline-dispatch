"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { useEffect, useRef } from "react";
import { DismissRegular } from "@fluentui/react-icons";
import type { DispatchBoardDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { JOB_STATUS_LABEL, describeWaitingTime, formatDay, requestedOnLabel } from "@/lib/dispatch/presentation";
import { parseScheduleInput } from "@/lib/dispatch/scheduling";
import { EligibilitySummary } from "../eligibility";
import type { EligibilityState } from "../use-dispatch-data";
import { ScheduleFields } from "./schedule-fields";
import { useAssignment, type SaveConfirmation } from "./use-assignment";
import { VanChoice } from "./van-choice";

const useStyles = makeStyles({
  surface: { maxWidth: "640px", width: "calc(100vw - 32px)" },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  subtitle: { color: tokens.colorNeutralForeground3 },
  summary: {
    display: "grid",
    gridTemplateColumns: "minmax(120px, max-content) 1fr",
    columnGap: tokens.spacingHorizontalL,
    rowGap: tokens.spacingVerticalS,
    margin: 0,
    "@media (max-width: 479px)": { gridTemplateColumns: "1fr", rowGap: tokens.spacingVerticalXXS },
  },
  term: { color: tokens.colorNeutralForeground3 },
  definition: { margin: 0, "@media (max-width: 479px)": { marginBottom: tokens.spacingVerticalS } },
  items: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL },
  note: { color: tokens.colorNeutralForeground3 },
});

interface AssignDialogProps {
  open: boolean;
  job: JobDto;
  board: DispatchBoardDto;
  eligibility: EligibilityState;
  onRetryEligibility: () => void;
  initialAssignedBy: string;
  onClose: () => void;
  onAssigned: (job: JobDto, how: SaveConfirmation, assignedBy: string) => void;
  onDataChanged: () => void;
}

export function AssignDialog({ open, ...props }: AssignDialogProps) {
  return (
    <Dialog open={open} modalType="modal">
      {/* A new key per opening, so every opening starts with a fresh form. */}
      <AssignForm key={open ? "open" : "closed"} {...props} />
    </Dialog>
  );
}

function AssignForm({
  job,
  board,
  eligibility,
  onRetryEligibility,
  initialAssignedBy,
  onClose,
  onAssigned,
  onDataChanged,
}: Omit<AssignDialogProps, "open">) {
  const styles = useStyles();
  const form = useAssignment({ job, today: board.date, initialAssignedBy, onAssigned, onDataChanged });
  const titleRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLDivElement>(null);
  // Changing step removes the focused button. Without this, focus would fall back
  // to the button behind the dialog. A server problem takes focus so it is read out.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    (form.problem ? problemRef.current : titleRef.current)?.focus();
  }, [form.step, form.problem]);
  const ranking = eligibility.status === "ready" ? eligibility.vans : [];
  const chosen = ranking.find((v) => v.vanId === form.vanId && v.eligible) ?? null;
  const chosenBoardVan = chosen ? board.vans.find((v) => v.van.id === chosen.vanId) : undefined;
  const stillWaiting = job.status === "REQUESTED";
  const canReview = stillWaiting && chosen !== null;
  const close = () => {
    if (!form.pending) onClose();
  };

  return (
    <DialogSurface
      className={styles.surface}
      aria-describedby={`assign-${job.id}-subtitle`}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (form.step === "choose") form.review();
          else void form.confirm();
        }}
        noValidate
      >
        <DialogBody>
          <DialogTitle
            ref={titleRef}
            tabIndex={-1}
            action={
              <Button
                appearance="subtle"
                aria-label="Close"
                icon={<DismissRegular />}
                onClick={close}
                disabledFocusable={form.pending}
              />
            }
          >
            {form.step === "choose" ? `Assign ${job.reference}` : `Confirm assigning ${job.reference}`}
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Text id={`assign-${job.id}-subtitle`} className={styles.subtitle}>
              {job.customer.name} — {job.branch.name}
              {job.branch.zone ? ` (${job.branch.zone})` : ""}
            </Text>

            {form.problem && (
              <div ref={problemRef} tabIndex={-1}>
                <MessageBar intent="error" layout="multiline">
                  <MessageBarBody>
                    <MessageBarTitle>{form.problem.title}</MessageBarTitle>
                    {form.problem.message}
                  </MessageBarBody>
                </MessageBar>
              </div>
            )}

            {!stillWaiting && (
              <MessageBar intent="info" layout="multiline">
                <MessageBarBody>
                  This job is now {JOB_STATUS_LABEL[job.status].toLowerCase()}
                  {job.van ? ` on ${job.van.code}` : ""}, so it can&apos;t be assigned here.
                </MessageBarBody>
              </MessageBar>
            )}

            {stillWaiting && form.step === "choose" && (
              <>
                {eligibility.status === "ready" && ranking.some((v) => v.eligible) ? (
                  <VanChoice
                    job={job}
                    eligibility={ranking}
                    vans={board.vans}
                    value={form.vanId}
                    onChange={form.chooseVan}
                    error={form.fieldErrors.vanId}
                  />
                ) : (
                  <>
                    <EligibilitySummary state={eligibility} onRetry={onRetryEligibility} />
                    {eligibility.status === "ready" && (
                      <VanChoice job={job} eligibility={ranking} vans={board.vans} value={null} onChange={() => {}} />
                    )}
                  </>
                )}
                {chosen && (
                  <>
                    <ScheduleFields
                      job={job}
                      value={form.schedule}
                      onChange={form.setSchedule}
                      errors={form.fieldErrors}
                      today={board.date}
                      vanJobs={chosenBoardVan ? [...chosenBoardVan.assignedJobs, ...chosenBoardVan.jobsToday] : []}
                      vanCode={chosen?.code ?? null}
                    />
                    <Field
                      label="Your name"
                      required
                      validationMessage={form.fieldErrors.assignedBy}
                      hint="Recorded with the assignment. There's no sign-in yet, so the app can't fill this in."
                    >
                      <Input
                        value={form.assignedBy}
                        onChange={(_, data) => form.setAssignedBy(data.value)}
                        autoComplete="name"
                      />
                    </Field>
                  </>
                )}
              </>
            )}

            {stillWaiting && form.step === "confirm" && chosen && (
              <ConfirmSummary
                job={job}
                vanCode={chosen.code}
                technician={chosen.technician?.name ?? null}
                schedule={form.schedule}
                assignedBy={form.assignedBy}
                availability={chosenBoardVan?.stock.lines ?? []}
              />
            )}
          </DialogContent>
          <DialogActions>
            {form.step === "choose" || !stillWaiting ? (
              <>
                <Button onClick={close}>{stillWaiting ? "Cancel" : "Close"}</Button>
                {canReview && (
                  <Button type="submit" appearance="primary">
                    Review assignment
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button onClick={form.back} disabledFocusable={form.pending}>
                  Back
                </Button>
                <Button
                  type="submit"
                  appearance="primary"
                  disabledFocusable={form.pending}
                  icon={form.pending ? <Spinner size="tiny" appearance="inverted" /> : undefined}
                >
                  {form.pending ? "Assigning…" : "Confirm assignment"}
                </Button>
              </>
            )}
          </DialogActions>
        </DialogBody>
      </form>
    </DialogSurface>
  );
}

function ConfirmSummary({
  job,
  vanCode,
  technician,
  schedule,
  assignedBy,
  availability,
}: {
  job: JobDto;
  vanCode: string;
  technician: string | null;
  schedule: { date: string; position: string };
  assignedBy: string;
  availability: { productId: string; available: number }[];
}) {
  const styles = useStyles();
  const parsed = parseScheduleInput(schedule);
  const day = parsed.ok && parsed.scheduledFor ? formatDay(parsed.scheduledFor) : "Not scheduled yet";
  const position = parsed.ok && parsed.sequence !== null ? `#${parsed.sequence}` : "Not set";

  return (
    <>
      <dl className={styles.summary}>
        <dt className={styles.term}>Job</dt>
        <dd className={styles.definition}>
          {job.reference} · {job.customer.name}, {job.branch.name}
        </dd>
        <dt className={styles.term}>Van</dt>
        <dd className={styles.definition}>{vanCode}</dd>
        <dt className={styles.term}>Technician</dt>
        <dd className={styles.definition}>{technician ?? "None"}</dd>
        <dt className={styles.term}>Requested on</dt>
        <dd className={styles.definition}>{requestedOnLabel(describeWaitingTime(job))} (unchanged)</dd>
        <dt className={styles.term}>Scheduled day</dt>
        <dd className={styles.definition}>{day}</dd>
        <dt className={styles.term}>Position that day</dt>
        <dd className={styles.definition}>{position}</dd>
        <dt className={styles.term}>Equipment reserved</dt>
        <dd className={styles.definition}>
          <ul className={styles.items}>
            {job.items.map((item) => {
              const available = availability.find((l) => l.productId === item.productId)?.available;
              return (
                <li key={item.productId}>
                  {item.quantity} × {item.sku} {item.name}
                  {available !== undefined ? ` (${available} available on ${vanCode} now)` : ""}
                </li>
              );
            })}
          </ul>
        </dd>
        <dt className={styles.term}>Assigned by</dt>
        <dd className={styles.definition}>{assignedBy.trim()}</dd>
      </dl>
      <Text size={200} className={styles.note}>
        The server checks the van again when you confirm. If its stock, driver or status has changed, nothing is
        assigned and you can choose again.
      </Text>
    </>
  );
}
