"use client";

import { useAuthUser } from "@/components/shell/auth-user-provider";
import { useRef, useState } from "react";
import {
  Button,
  Field,
  Input,
  Textarea,
  MessageBar,
  MessageBarBody,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import type { JobDto } from "@/lib/contracts/jobs";
import { cancelRequest, deleteRequest } from "@/lib/api/requests";
import { RequestFormSheet } from "./request-form-sheet";
import { RequestConfirmation } from "./request-confirmation";
export function useRequestActions({
  job,
  reload,
  select,
  refreshEligibility,
}: {
  job: JobDto | null;
  reload: () => void;
  select: (id: string | null) => void;
  refreshEligibility: () => void;
}) {
  const [form, setForm] = useState<{
    job: JobDto | null;
    open: boolean;
    key: number;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    job: JobDto;
    mode: "delete" | "cancel";
  } | null>(null);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const actor = useAuthUser().name;
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const openings = useRef(0);
  const restore = useRestoreFocusTarget();
  const refresh = () => {
    reload();
    refreshEligibility();
  };
  const open = (mode: "delete" | "cancel") => {
    if (!job) return;
    setProblem("");
    setReason("");
    setConfirmation({ job, mode });
  };
  const protectedStatus = confirmation?.job.deletionBlockedReason;
  const run = async () => {
    if (!confirmation || inFlight.current) return;
    if (
      confirmation.mode === "cancel" &&
      (reason.trim().length < 3 || !actor.trim())
    ) {
      setProblem(
        "Enter a cancellation reason of at least 3 characters.",
      );
      return;
    }
    inFlight.current = true;
    setPending(true);
    setProblem("");
    try {
      if (confirmation.mode === "delete")
        await deleteRequest(confirmation.job.id);
      else
        await cancelRequest(confirmation.job.id, reason.trim(), actor.trim());
      setNotice(
        confirmation.mode === "delete"
          ? "Request deleted."
          : "Request cancelled. Reservations released; history retained.",
      );
      select(null);
      setConfirmation(null);
      refresh();
    } catch (e) {
      setProblem(
        e instanceof Error
          ? e.message
          : "Unable to confirm the operation. Check the refreshed board before retrying.",
      );
      refresh();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  const editable = job && ["REQUESTED", "ASSIGNED"].includes(job.status);
  return {
    newButton: (
      <Button
        {...restore}
        appearance="primary"
        onClick={() => {
          setNotice("");
          setForm({ job: null, open: true, key: ++openings.current });
        }}
      >
        New request
      </Button>
    ),
    actions: job ? (
      <>
        <Button
          {...restore}
          disabled={!editable}
          onClick={() => {
            setNotice("");
            setForm({ job, open: true, key: ++openings.current });
          }}
        >
          Edit request
        </Button>
        <Button {...restore} onClick={() => open("delete")}>
          Delete request…
        </Button>
        {editable && (
          <Button {...restore} onClick={() => open("cancel")}>
            Cancel request…
          </Button>
        )}
        {!editable && (
          <span>
            In-progress and historical requests cannot be edited or deleted.
          </span>
        )}
      </>
    ) : null,
    notice: notice ? (
      <MessageBar intent="success">
        <MessageBarBody>{notice}</MessageBarBody>
      </MessageBar>
    ) : null,
    overlays: (
      <>
        {form && (
          <RequestFormSheet
            key={form.key}
            job={form.job}
            open={form.open}
            onClose={() =>
              setForm((current) =>
                current ? { ...current, open: false } : null,
              )
            }
            onRefresh={refresh}
            onSaved={(saved) => {
              setForm((current) =>
                current ? { ...current, open: false } : null,
              );
              select(saved.id);
              setNotice(form.job ? "Request saved." : "Request created.");
              refresh();
            }}
          />
        )}
        <RequestConfirmation
          open={confirmation !== null}
          title={
            confirmation?.mode === "cancel"
              ? "Cancel request?"
              : "Delete request permanently?"
          }
          confirmLabel={
            confirmation?.mode === "cancel"
              ? "Cancel request"
              : "Delete permanently"
          }
          pending={pending}
          blocked={!!protectedStatus && confirmation?.mode === "delete"}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void run()}
        >
          {confirmation && (
            <>
              <p>
                {confirmation.job.customer.name} —{" "}
                {confirmation.job.branch.name} · {confirmation.job.reference}
              </p>
              {confirmation.mode === "delete" ? (
                <p>
                  {protectedStatus
                    ? protectedStatus
                    : "This permanently removes an unused request. The server will verify that no reservations, operational or import history exists."}
                </p>
              ) : (
                <>
                  <p>
                    Cancellation releases reservations and keeps the request
                    history. Stock does not move.
                  </p>
                  <Field label="Your name" required>
                    <Input
                      value={actor}
                      disabled={pending}
                      readOnly
                    />
                  </Field>
                  <Field label="Reason" required>
                    <Textarea
                      value={reason}
                      disabled={pending}
                      onChange={(_, d) => setReason(d.value)}
                    />
                  </Field>
                </>
              )}
              {problem && (
                <MessageBar intent="error">
                  <MessageBarBody>{problem}</MessageBarBody>
                </MessageBar>
              )}
            </>
          )}
        </RequestConfirmation>
      </>
    ),
  };
}
