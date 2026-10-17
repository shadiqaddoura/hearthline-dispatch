"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
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
import { DatabaseRegular, DeleteRegular } from "@fluentui/react-icons";
import { ApiRequestError } from "@/lib/api/client";
import { demoDataApi } from "@/lib/api/demo-data";
import type { DemoDataOverview, DemoSection, DemoSectionPreview } from "@/lib/contracts/demo-data";
import { ClearAllData } from "./clear-all-data";

const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXL },
  intro: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS, maxWidth: "820px" },
  muted: { color: tokens.colorNeutralForeground2 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: tokens.spacingHorizontalL },
  card: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM, padding: tokens.spacingHorizontalL },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalM },
  list: { margin: 0, paddingInlineStart: tokens.spacingHorizontalL },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS, marginTop: "auto" },
  counts: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalXS },
  warning: { color: tokens.colorPaletteDarkOrangeForeground1 },
  danger: { ":enabled": { backgroundColor: tokens.colorStatusDangerBackground3, color: tokens.colorNeutralForegroundOnBrand } },
  dialogList: { marginBlock: tokens.spacingVerticalS, paddingInlineStart: tokens.spacingHorizontalL },
});

type Pending = { section: DemoSection; action: "seed" | "clear" } | null;

export function SettingsView() {
  const styles = useStyles();
  const [overview, setOverview] = useState<DemoDataOverview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [confirm, setConfirm] = useState<DemoSectionPreview | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void demoDataApi.overview(controller.signal).then(setOverview).catch((error) => {
      if (!(error instanceof DOMException && error.name === "AbortError")) setProblem(messageOf(error));
    });
    return () => controller.abort();
  }, []);

  const mutate = async (section: DemoSection, action: "seed" | "clear") => {
    setPending({ section, action }); setProblem(null); setNotice(null);
    try {
      const confirmed = overview?.sections.find((item) => item.section === section);
      const result = action === "seed" ? await demoDataApi.seed(section) : await demoDataApi.clear(section, confirmed?.clearable ?? []);
      setOverview(result.overview); setNotice(result.message); setConfirm(null);
    } catch (error) { setProblem(messageOf(error)); }
    finally { setPending(null); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.intro}>
        <Text as="p" size={400}>Seed or clear one demo domain at a time. Every disposable record is tracked with explicit provenance.</Text>
        <Text className={styles.muted}>Seed is safe to repeat. Clear removes only records created here, preserves shared dependencies, and stops if operational activity or history uses a demo record.</Text>
      </div>

      {notice && <MessageBar intent="success"><MessageBarBody><MessageBarTitle>Done</MessageBarTitle>{notice}</MessageBarBody></MessageBar>}
      {problem && <MessageBar intent="error" layout="multiline"><MessageBarBody><MessageBarTitle>Nothing changed</MessageBarTitle>{problem}</MessageBarBody></MessageBar>}

      {!overview ? <Spinner label="Loading demo data previews" /> : (
        <div className={styles.grid}>
          {overview.sections.map((section) => <SectionCard key={section.section} section={section} pending={pending} onSeed={() => void mutate(section.section, "seed")} onClear={() => setConfirm(section)} />)}
        </div>
      )}

      <ClearAllData onCleared={(message) => {
        setOverview({ sections: overview?.sections.map((section) => ({ ...section, seeded: [], clearable: [], preservedShared: [], blockers: [] })) ?? [] });
        setNotice(message);
      }} />

      <ClearDialog section={confirm} pending={pending?.action === "clear"} onClose={() => !pending && setConfirm(null)} onConfirm={() => confirm && void mutate(confirm.section, "clear")} />
    </div>
  );
}

function SectionCard({ section, pending, onSeed, onClear }: { section: DemoSectionPreview; pending: Pending; onSeed: () => void; onClear: () => void }) {
  const styles = useStyles();
  const busy = pending?.section === section.section;
  const total = section.seeded.reduce((sum, item) => sum + item.count, 0);
  return (
    <Card className={styles.card} aria-label={section.title}>
      <div className={styles.cardHeader}><Text as="h2" size={500} weight="semibold">{section.title}</Text><Badge appearance="tint" color={total ? "success" : "informative"}>{total ? `${total} tracked` : "Not seeded"}</Badge></div>
      <Text className={styles.muted}>{section.description}</Text>
      <div><Text weight="semibold">Seed preview</Text><ul className={styles.list}>{section.records.map((record) => <li key={record}>{record}</li>)}</ul></div>
      {section.dependencies.length > 0 && <div><Text weight="semibold">Required demo data</Text><ul className={styles.list}>{section.dependencies.map((dependency) => <li key={dependency}>{dependency}</li>)}</ul></div>}
      {section.missingDependencies.map((warning) => <Text key={warning} size={200} className={styles.warning}>{warning}</Text>)}
      {section.seeded.length > 0 && <div className={styles.counts}>{section.seeded.map((item) => <Badge key={item.category} appearance="outline">{item.category}: {item.count}</Badge>)}</div>}
      {section.preservedShared.length > 0 && <Text size={200} className={styles.muted}>Clear will preserve shared: {formatCounts(section.preservedShared)}.</Text>}
      {section.blockers.length > 0 && <MessageBar intent="warning"><MessageBarBody><MessageBarTitle>Clear is blocked</MessageBarTitle>{section.blockers.join(" ")}</MessageBarBody></MessageBar>}
      <div className={styles.actions}>
        <Button appearance="primary" icon={busy && pending?.action === "seed" ? <Spinner size="tiny" appearance="inverted" /> : <DatabaseRegular />} disabled={pending !== null} onClick={onSeed}>Seed</Button>
        <Button icon={<DeleteRegular />} disabled={pending !== null || section.clearable.length === 0 || section.blockers.length > 0} onClick={onClear}>Clear demo data</Button>
      </div>
    </Card>
  );
}

function ClearDialog({ section, pending, onClose, onConfirm }: { section: DemoSectionPreview | null; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const styles = useStyles();
  return <Dialog open={section !== null} modalType="alert" onOpenChange={(_, data) => { if (!data.open && !pending) onClose(); }}><DialogSurface><DialogBody><DialogTitle>Clear {section?.title} demo data?</DialogTitle><DialogContent>
    <Text>This permanently deletes only the following provenance-tracked demo records:</Text>
    <ul className={styles.dialogList}>{section?.clearable.map((item) => <li key={item.category}>{item.category}: {item.count}</li>)}</ul>
    {section && section.preservedShared.length > 0 && <Text>Shared records kept: {formatCounts(section.preservedShared)}.</Text>}
    <Text weight="semibold">Real, imported, and operational records and their history are not included.</Text>
  </DialogContent><DialogActions><Button disabled={pending} onClick={onClose}>Cancel</Button><Button appearance="primary" className={styles.danger} disabled={pending} icon={pending ? <Spinner size="tiny" appearance="inverted" /> : <DeleteRegular />} onClick={onConfirm}>{pending ? "Clearing…" : "Clear demo data"}</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
}

function formatCounts(counts: { category: string; count: number }[]) { return counts.map((item) => `${item.count} ${item.category.toLowerCase()}`).join(", "); }
function messageOf(error: unknown) { return error instanceof ApiRequestError || error instanceof Error ? error.message : "The operation failed."; }
