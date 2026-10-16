"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  Button,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  OverlayDrawer,
  MessageBar,
  MessageBarBody,
  Spinner,
  useRestoreFocusSource,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
import {
  createJobRequest,
  updateJobRequest,
  type JobDto,
  type UpdateJobRequest,
} from "@/lib/contracts/jobs";
import {
  createRequest,
  editRequest,
  loadRequestOptions,
} from "@/lib/api/requests";
import { ApiRequestError } from "@/lib/api/client";
import { todayIsoDate } from "@/lib/dates";
import { RequestFormFields } from "./request-form-fields";
import { RequestConfirmation } from "./request-confirmation";
const useStyles = makeStyles({
  body: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXL,
  },
  footer: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  sheet: { "@media (max-width: 479px)": { width: "100vw", maxWidth: "100vw" } },
});
export function RequestFormSheet({
  job,
  open,
  onClose,
  onSaved,
  onRefresh,
}: {
  job: JobDto | null;
  open: boolean;
  onClose: () => void;
  onSaved: (job: JobDto) => void;
  onRefresh: () => void;
}) {
  const styles = useStyles();
  const formId = useId();
  const [initial] = useState<UpdateJobRequest>(() =>
    job
      ? {
          expectedUpdatedAt: job.updatedAt,
          type: job.type,
          branchId: job.branch.id,
          requestedOn: job.requestedOn,
          items: job.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          notes: job.notes ?? "",
        }
      : {
          type: "DELIVERY",
          branchId: "",
          requestedOn: todayIsoDate(),
          items: [{ productId: "", quantity: 1 }],
          notes: "",
        },
  );
  const [value, setValue] = useState(initial);
  const [options, setOptions] = useState<Awaited<
    ReturnType<typeof loadRequestOptions>
  > | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [problem, setProblem] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [discard, setDiscard] = useState(false);
  const inFlight = useRef(false);
  const problemRef = useRef<HTMLDivElement>(null);
  const restore = useRestoreFocusSource();
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  useEffect(() => {
    let active = true;
    loadRequestOptions().then(
      (o) => {
        if (active) {
          setOptions(o);
          setProblem("");
        }
      },
      (e) => {
        if (active) setProblem(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!dirty || !open) return;
    const prevent = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty, open]);
  const close = () => {
    if (inFlight.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const fail = (message: string) => {
    setProblem(message);
    requestAnimationFrame(() => problemRef.current?.focus());
  };
  const save = async () => {
    if (inFlight.current || !options) return;
    const parsed = (job ? updateJobRequest : createJobRequest).safeParse(value);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        fields[String(issue.path[0])] = issue.message;
      setErrors(fields);
      fail("Check the marked fields below, then try again.");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setErrors({});
    setProblem("");
    try {
      onSaved(
        job
          ? await editRequest(job.id, parsed.data)
          : await createRequest(createJobRequest.parse(parsed.data)),
      );
    } catch (e) {
      const uncertain = e instanceof ApiRequestError && !e.isRejection;
      onRefresh();
      fail(
        (e instanceof Error ? e.message : "Unable to save request.") +
          (uncertain
            ? " The outcome could not be confirmed. Check the refreshed board before retrying."
            : ""),
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return (
    <>
      <OverlayDrawer
        {...restore}
        className={styles.sheet}
        position="end"
        size="medium"
        open={open}
        onOpenChange={(_, d) => {
          if (!d.open) close();
        }}
        aria-label={job ? "Edit request" : "New request"}
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                aria-label="Close request form"
                icon={<DismissRegular />}
                disabled={pending}
                onClick={close}
              />
            }
          >
            {job ? "Edit request" : "New request"}
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody>
          <form
            id={formId}
            className={styles.body}
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div ref={problemRef} tabIndex={-1}>
              {problem && (
                <MessageBar intent="error">
                  <MessageBarBody>{problem}</MessageBarBody>
                </MessageBar>
              )}
            </div>
            {!options ? (
              <>
                {!problem ? (
                  <Spinner label="Loading customers and products…" />
                ) : (
                  <Button onClick={() => setAttempt((n) => n + 1)}>
                    Retry loading
                  </Button>
                )}
              </>
            ) : (
              <RequestFormFields
                value={value}
                onChange={(v) => {
                  setValue(v);
                  setErrors({});
                }}
                customers={options.customers}
                products={options.products}
                busy={pending}
                errors={errors}
              />
            )}
          </form>
        </DrawerBody>
        <DrawerFooter className={styles.footer}>
          <Button disabled={pending} onClick={close}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            disabled={pending || !options}
            type="submit"
            form={formId}
          >
            {pending ? "Saving…" : job ? "Save" : "Create"}
          </Button>
        </DrawerFooter>
      </OverlayDrawer>
      <RequestConfirmation
        open={discard}
        title="Discard unsaved changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onCancel={() => setDiscard(false)}
        onConfirm={() => {
          setDiscard(false);
          onClose();
        }}
      >
        Your changes to this request will be lost.
      </RequestConfirmation>
    </>
  );
}
