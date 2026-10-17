"use client";

import { useEffect, useState } from "react";
import {
  Button, Card, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle,
  Field, Input, MessageBar, MessageBarBody, MessageBarTitle, Spinner, Text, makeStyles, tokens,
} from "@fluentui/react-components";
import { DeleteRegular, WarningRegular } from "@fluentui/react-icons";
import { ApiRequestError } from "@/lib/api/client";
import { dataResetApi } from "@/lib/api/data-reset";
import { CLEAR_ALL_CONFIRMATION, type DataResetPreview } from "@/lib/contracts/data-reset";

const useStyles = makeStyles({
  card: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL },
  heading: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  list: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL },
  danger: { ":enabled": { backgroundColor: tokens.colorStatusDangerBackground3, color: tokens.colorNeutralForegroundOnBrand } },
  dialog: { maxWidth: "560px" },
  confirmation: { fontFamily: tokens.fontFamilyMonospace },
});

export function ClearAllData({ onCleared }: { onCleared: (message: string) => void }) {
  const styles = useStyles();
  const [preview, setPreview] = useState<DataResetPreview | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void dataResetApi.preview(controller.signal).then(setPreview).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setProblem(messageOf(error));
    });
    return () => controller.abort();
  }, []);

  const clear = async () => {
    if (!preview || confirmation !== CLEAR_ALL_CONFIRMATION) return;
    setPending(true); setProblem(null);
    try {
      const result = await dataResetApi.clear(confirmation, preview.counts);
      setPreview(result.preview); setOpen(false); setConfirmation(""); onCleared(result.message);
    } catch (error) { setProblem(messageOf(error)); }
    finally { setPending(false); }
  };

  return <>
    <Card className={styles.card} aria-label="Clear all application data">
      <div className={styles.heading}><WarningRegular /><Text as="h2" size={500} weight="semibold">Clear all application data</Text></div>
      <Text>This removes products, customers, fleet, inventory and movement history, dispatch jobs, restocking, imports, and demo provenance.</Text>
      <Text weight="semibold">User accounts, active sessions, login security records, and migration history remain intact.</Text>
      {problem && !open && <MessageBar intent="error"><MessageBarBody>{problem}</MessageBarBody></MessageBar>}
      {!preview ? <Spinner label="Counting application records" /> : <Text>{preview.total.toLocaleString("en")} records are currently included.</Text>}
      <div><Button appearance="primary" className={styles.danger} icon={<DeleteRegular />} disabled={!preview || preview.total === 0} onClick={() => { setProblem(null); setOpen(true); }}>Review and clear all data</Button></div>
    </Card>

    <Dialog open={open} modalType="alert" onOpenChange={(_, data) => { if (!data.open && !pending) { setOpen(false); setConfirmation(""); } }}>
      <DialogSurface className={styles.dialog}>
        <DialogBody>
          <DialogTitle>Clear all application data?</DialogTitle>
          <DialogContent>
            <Text>This action is permanent. The following exact counts will be removed:</Text>
            <ul className={styles.list}>{preview?.counts.map((item) => <li key={item.category}>{item.category}: {item.count}</li>)}</ul>
            <Text weight="semibold">Preserved:</Text>
            <ul className={styles.list}>{preview?.preserved.map((item) => <li key={item}>{item}</li>)}</ul>
            {problem && <MessageBar intent="error" layout="multiline"><MessageBarBody><MessageBarTitle>Nothing was cleared</MessageBarTitle>{problem}</MessageBarBody></MessageBar>}
            <Field label={<>Type <span className={styles.confirmation}>{CLEAR_ALL_CONFIRMATION}</span> to confirm</>}>
              <Input value={confirmation} onChange={(_, data) => setConfirmation(data.value)} disabled={pending} autoComplete="off" />
            </Field>
          </DialogContent>
          <DialogActions>
            <Button disabled={pending} onClick={() => { setOpen(false); setConfirmation(""); }}>Cancel</Button>
            <Button appearance="primary" className={styles.danger} disabled={pending || confirmation !== CLEAR_ALL_CONFIRMATION} icon={pending ? <Spinner size="tiny" appearance="inverted" /> : <DeleteRegular />} onClick={() => void clear()}>{pending ? "Clearing…" : "Clear all data"}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  </>;
}

function messageOf(error: unknown) { return error instanceof ApiRequestError || error instanceof Error ? error.message : "The operation failed."; }
