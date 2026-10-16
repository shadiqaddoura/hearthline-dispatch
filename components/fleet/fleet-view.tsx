"use client";
import { useRef, useState } from "react";
import { Button, Field, Input, Select, MessageBar, MessageBarBody, Spinner, Text, makeStyles, tokens, useRestoreFocusTarget } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import type { VanDto } from "@/lib/contracts/fleet";
import { fleetApi } from "@/lib/api/fleet";
import { FleetTable } from "./fleet-table";
import { FleetDetails } from "./fleet-details";
import { FleetForm } from "./fleet-form";
import { FleetConfirmation } from "./fleet-confirmation";
import { useFleet } from "./use-fleet";
const useStyles = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  toolbar: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalM, alignItems: "end" },
  surface: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow2, overflow: "hidden" },
});
export function FleetView() {
  const styles = useStyles();
  const fleet = useFleet();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("code");
  const [selected, setSelected] = useState<VanDto | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "create" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const deleting = useRef(false);
  const addRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const deleteProblemRef = useRef<HTMLDivElement>(null);
  const restore = useRestoreFocusTarget();
  const van = fleet.data?.vans.find(v => v.id === selected?.id) ?? selected;
  const refresh = () => { fleet.refresh(); window.dispatchEvent(new Event("fleet-changed")); };
  const saved = (v: VanDto) => { setSelected(v); setMode("view"); setNotice(`${v.code} saved.`); refresh(); };
  const remove = async () => {
    if (!van || deleting.current) return;
    deleting.current = true; setPending(true); setProblem("");
    try { await fleetApi.remove(van.id); setNotice(`${van.code} permanently deleted.`); setConfirm(false); setMode(null); refresh(); requestAnimationFrame(() => addRef.current?.focus()); }
    catch (e) { setProblem(e instanceof Error ? e.message : "Unable to confirm deletion. Refresh before retrying."); refresh(); requestAnimationFrame(() => deleteProblemRef.current?.focus()); }
    finally { deleting.current = false; setPending(false); }
  };
  const visible = (fleet.data?.vans ?? []).filter(v => [v.code, v.plate, v.zone, v.technician?.name].some(s => s?.toLowerCase().includes(query.trim().toLowerCase())) && (status === "ALL" || status === "UNDRIVEN" ? status !== "UNDRIVEN" || !v.technician : v.status === status)).sort((a, b) => {
    if (sort === "work") return (fleet.data?.jobs.filter(j => j.van?.id === b.id).length ?? 0) - (fleet.data?.jobs.filter(j => j.van?.id === a.id).length ?? 0);
    const field = sort === "zone" ? "zone" : "code";
    return (a[field] ?? "").localeCompare(b[field] ?? "", undefined, { numeric: true }) * (sort === "desc" ? -1 : 1);
  });
  return <div className={styles.page}>
    <Text>Manage vans, drivers and service availability. Physical inventory stays with its vehicle.</Text>
    {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}
    {fleet.problem && <MessageBar intent="error"><MessageBarBody>{fleet.data && "The list may be out of date. "}{fleet.problem} <Button onClick={() => { fleet.refresh(); searchRef.current?.focus(); }}>Retry</Button></MessageBarBody></MessageBar>}
    <div className={styles.toolbar}>
      <Field label="Search fleet"><Input ref={searchRef} value={query} placeholder="Van, plate, technician or zone" onChange={(_, d) => setQuery(d.value)} /></Field>
      <Field label="Status filter"><Select value={status} onChange={(_, d) => setStatus(d.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="GARAGE">Garage</option><option value="SOLD">Sold</option><option value="UNDRIVEN">No technician</option></Select></Field>
      <Field label="Sort by"><Select value={sort} onChange={(_, d) => setSort(d.value)}><option value="code">Identifier A–Z</option><option value="desc">Identifier Z–A</option><option value="zone">Usual zone</option><option value="work">Most assigned work</option></Select></Field>
      <Button {...restore} ref={addRef} appearance="primary" icon={<AddRegular />} onClick={() => { setMode("create"); setNotice(""); }}>Add van</Button>
      <Button onClick={refresh}>Refresh</Button>
    </div>
    {fleet.loading ? <Spinner label="Loading fleet" /> : fleet.data && <><Text size={200}>{visible.length} of {fleet.data.vans.length} vans</Text><section className={styles.surface}>{visible.length ? <FleetTable vans={visible} jobs={fleet.data.jobs} onSelect={v => { setSelected(v); setMode("view"); setProblem(""); }} /> : <p style={{ padding: 24 }}>{fleet.data.vans.length ? "No vans match these filters." : "No vans yet. Add your first van."}</p>}</section></>}
    {van && <FleetDetails key={van.id} van={van} open={mode === "view"} jobs={fleet.data?.jobs ?? []} revision={fleet.revision} onClose={() => setMode(null)} onEdit={() => setMode("edit")} onDelete={() => { setProblem(""); setConfirm(true); }} />}
    {(mode === "create" || mode === "edit") && <FleetForm key={mode === "create" ? "new" : van?.id} van={mode === "edit" ? van : null} open onClose={() => setMode(mode === "edit" ? "view" : null)} onSaved={saved} onRefresh={refresh} technicians={fleet.data?.technicians ?? []} />}
    <FleetConfirmation open={confirm} title={`Permanently delete ${van?.code}?`} onClose={() => setConfirm(false)} onConfirm={() => void remove()} action="Permanently delete" pending={pending}>
      <p>Van {van?.code}, registration plate {van?.plate ?? "not recorded"}. This permanently removes an unused van and its empty inventory location.</p><p>Stock, equipment, reservations, jobs, movements, restock records, corrections and protected import records block deletion. For a van with history, use Edit → Sold when appropriate.</p><div ref={deleteProblemRef} tabIndex={-1}>{problem && <MessageBar intent="error"><MessageBarBody>{problem}</MessageBarBody></MessageBar>}</div>
    </FleetConfirmation>
  </div>;
}
