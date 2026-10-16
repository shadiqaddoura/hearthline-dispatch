"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import { CalendarEditRegular, DismissRegular, VehicleTruckProfileRegular } from "@fluentui/react-icons";
import type { DispatchBoardDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { scheduleLabel } from "@/lib/dispatch/presentation";
import type { EligibilityState } from "../use-dispatch-data";
import { AssignDialog } from "./assign-dialog";
import { RescheduleDialog } from "./reschedule-dialog";
import type { SaveConfirmation } from "./use-assignment";

const useStyles = makeStyles({
  // Clears the sticky app header when scrolled into view.
  notice: { scrollMarginTop: "72px" },
});

interface Notice {
  title: string;
  message: string;
}

interface JobActionsOptions {
  board: DispatchBoardDto | null;
  job: JobDto | null;
  eligibility: EligibilityState;
  retryEligibility: () => void;
  reloadBoard: () => void;
}

/**
 * Assignment and scheduling for the selected job: the button that starts it, the
 * dialogs, and the confirmation shown once the server has saved the change.
 */
export function useJobActions({ board, job, eligibility, retryEligibility, reloadBoard }: JobActionsOptions) {
  const styles = useStyles();
  const [dialog, setDialog] = useState<"assign" | "schedule" | null>(null);
  // Remembered for the next assignment: there is no sign-in to supply it.
  const [assignedBy, setAssignedBy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const restoreFocusTarget = useRestoreFocusTarget();

  // The button that opened the dialog may be gone after a save (an assigned job has
  // no "Assign" button), so focus moves to the confirmation instead.
  const focusNoticePending = useRef(false);
  useEffect(() => {
    if (!notice || !focusNoticePending.current) return;
    focusNoticePending.current = false;
    noticeRef.current?.focus();
    noticeRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [notice]);

  const refreshAfterChange = () => {
    reloadBoard();
    retryEligibility();
  };

  const saved = (next: Notice) => {
    setDialog(null);
    focusNoticePending.current = true;
    setNotice(next);
    reloadBoard();
  };

  const onAssigned = (saved_: JobDto, how: SaveConfirmation, name: string) => {
    setAssignedBy(name);
    const reserved = saved_.activeReservations
      .map((r) => `${r.quantity} × ${saved_.items.find((i) => i.productId === r.productId)?.sku ?? "item"}`)
      .join(", ");
    saved({
      title: how === "found-saved" ? `${saved_.reference} was assigned.` : `${saved_.reference} is assigned.`,
      message: [
        `On ${saved_.van?.code ?? "a van"}${saved_.technician ? ` with ${saved_.technician.name}` : ""}.`,
        saved_.scheduledFor ? `Scheduled ${scheduleLabel(saved_)}.` : "Not scheduled yet.",
        reserved ? `Reserved: ${reserved}.` : "",
        how === "found-saved" ? "The connection dropped, but the server shows it was saved." : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  };

  const onRescheduled = (saved_: JobDto, how: SaveConfirmation) => {
    saved({
      title: `${saved_.reference}'s schedule is saved.`,
      message: [
        saved_.scheduledFor ? `Scheduled ${scheduleLabel(saved_)}.` : "No scheduled day.",
        "Stock and reservations are unchanged.",
        how === "found-saved" ? "The connection dropped, but the server shows it was saved." : "",
      ]
        .filter(Boolean)
        .join(" "),
    });
  };

  let actionButton: ReactNode = null;
  if (job?.status === "REQUESTED") {
    actionButton = (
      <Button
        {...restoreFocusTarget}
        appearance="primary"
        icon={<VehicleTruckProfileRegular />}
        onClick={() => {
          setNotice(null);
          retryEligibility(); // recheck now: the board's answer may be minutes old
          setDialog("assign");
        }}
      >
        Assign to a van…
      </Button>
    );
  } else if (job?.status === "ASSIGNED") {
    actionButton = (
      <Button
        {...restoreFocusTarget}
        icon={<CalendarEditRegular />}
        onClick={() => {
          setNotice(null);
          setDialog("schedule");
        }}
      >
        Change schedule…
      </Button>
    );
  }

  const dialogs =
    board && job ? (
      <>
        <AssignDialog
          open={dialog === "assign"}
          job={job}
          board={board}
          eligibility={eligibility}
          onRetryEligibility={retryEligibility}
          initialAssignedBy={assignedBy}
          onClose={() => setDialog(null)}
          onAssigned={onAssigned}
          onDataChanged={refreshAfterChange}
        />
        <RescheduleDialog
          open={dialog === "schedule"}
          job={job}
          board={board}
          onClose={() => setDialog(null)}
          onSaved={onRescheduled}
          onDataChanged={refreshAfterChange}
        />
      </>
    ) : null;

  const noticeBar = notice ? (
    <div ref={noticeRef} tabIndex={-1} className={styles.notice}>
      <MessageBar intent="success" layout="multiline">
        <MessageBarBody>
          <MessageBarTitle>{notice.title}</MessageBarTitle>
          {notice.message}
        </MessageBarBody>
        <MessageBarActions
          containerAction={
            <Button appearance="transparent" aria-label="Dismiss" icon={<DismissRegular />} onClick={() => setNotice(null)} />
          }
        />
      </MessageBar>
    </div>
  ) : null;

  return { actionButton, dialogs, notice: noticeBar };
}
