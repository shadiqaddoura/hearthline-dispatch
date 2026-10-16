"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
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
import { JOB_STATUS_LABEL } from "@/lib/dispatch/presentation";
import { ScheduleFields } from "./schedule-fields";
import { useReschedule, type SaveConfirmation } from "./use-assignment";

const useStyles = makeStyles({
  surface: { maxWidth: "560px", width: "calc(100vw - 32px)" },
  content: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  subtitle: { color: tokens.colorNeutralForeground3 },
});

interface RescheduleDialogProps {
  open: boolean;
  job: JobDto;
  board: DispatchBoardDto;
  onClose: () => void;
  onSaved: (job: JobDto, how: SaveConfirmation) => void;
  onDataChanged: () => void;
}

export function RescheduleDialog({ open, ...props }: RescheduleDialogProps) {
  return (
    <Dialog open={open} modalType="modal">
      <RescheduleForm key={open ? "open" : "closed"} {...props} />
    </Dialog>
  );
}

function RescheduleForm({ job, board, onClose, onSaved, onDataChanged }: Omit<RescheduleDialogProps, "open">) {
  const styles = useStyles();
  const form = useReschedule({ job, onSaved, onDataChanged });
  const problemRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (form.problem) problemRef.current?.focus();
  }, [form.problem]);
  const van = board.vans.find((v) => v.van.id === job.van?.id);
  const editable = job.status === "ASSIGNED";
  const close = () => {
    if (!form.pending) onClose();
  };

  return (
    <DialogSurface
      className={styles.surface}
      aria-describedby={`schedule-${job.id}-subtitle`}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
        noValidate
      >
        <DialogBody>
          <DialogTitle
            action={
              <Button appearance="subtle" aria-label="Close" icon={<DismissRegular />} onClick={close} disabledFocusable={form.pending} />
            }
          >
            Schedule {job.reference}
          </DialogTitle>
          <DialogContent className={styles.content}>
            <Text id={`schedule-${job.id}-subtitle`} className={styles.subtitle}>
              {job.customer.name} — {job.branch.name} · on {job.van?.code ?? "no van"}
              {job.technician ? ` with ${job.technician.name}` : ""}. Changing the schedule doesn&apos;t move or
              reserve any stock.
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
            {editable ? (
              <ScheduleFields
                job={job}
                value={form.schedule}
                onChange={form.setSchedule}
                errors={form.fieldErrors}
                today={board.date}
                vanJobs={van ? [...van.assignedJobs, ...van.jobsToday] : []}
                vanCode={job.van?.code ?? null}
                disabled={form.pending}
              />
            ) : (
              <MessageBar intent="info">
                <MessageBarBody>
                  This job is {JOB_STATUS_LABEL[job.status].toLowerCase()}, so its schedule can&apos;t change.
                </MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={close} disabledFocusable={form.pending}>
              {editable ? "Cancel" : "Close"}
            </Button>
            {editable && (
              <Button
                type="submit"
                appearance="primary"
                disabledFocusable={form.pending}
                icon={form.pending ? <Spinner size="tiny" appearance="inverted" /> : undefined}
              >
                {form.pending ? "Saving…" : "Save schedule"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </form>
    </DialogSurface>
  );
}
