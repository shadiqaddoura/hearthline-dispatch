"use client";
import { useEffect, useState } from "react";
import { Button, MessageBar, MessageBarBody, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, useRestoreFocusTarget } from "@fluentui/react-components";
import type { VanDto } from "@/lib/contracts/fleet";
import type { JobDto } from "@/lib/contracts/jobs";
import type { LocationStockDto } from "@/lib/contracts/inventory";
import { fleetApi } from "@/lib/api/fleet";
import { FleetStock } from "./fleet-stock";
import { FleetSheet } from "./fleet-sheet";
export function FleetDetails({ van, open, jobs, revision, onClose, onEdit, onDelete }: { van: VanDto; open: boolean; jobs: JobDto[]; revision: number; onClose: () => void; onEdit: () => void; onDelete: () => void }) {
  const [stock, setStock] = useState<LocationStockDto | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const restore = useRestoreFocusTarget();
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    fleetApi.stock(van.id, controller.signal).then(value => { if (!controller.signal.aborted) { setStock(value); setProblem(""); } }, e => { if (!controller.signal.aborted) setProblem(e.message); });
    return () => controller.abort();
  }, [van.id, open, revision, attempt]);
  const work = jobs.filter(j => j.van?.id === van.id);
  return <FleetSheet title={`${van.code} details`} open={open} onClose={onClose} footer={<><Button {...restore} appearance="primary" onClick={onEdit}>Edit</Button><Button {...restore} onClick={onDelete}>Delete…</Button></>}>
    <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 16, margin: 0 }}>{[["Registration plate", van.plate ?? "Not recorded"], ["Technician", van.technician?.name ?? "Unassigned"], ["Usual zone", van.zone ?? "Not set"], ["Status", van.status], ["Pool vehicle", van.isPool ? "Yes" : "No"], ["Notes", van.statusNote ?? "None"]].map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{v}</dd></div>)}</dl>
    {problem ? <MessageBar intent="error"><MessageBarBody>{problem} <Button onClick={() => setAttempt(n => n + 1)}>Retry stock</Button></MessageBarBody></MessageBar> : stock?.vanId === van.id ? <><FleetStock lines={stock.lines} />{stock.lines.length === 0 && <Text>No stock or equipment recorded.</Text>}</> : <Spinner label="Loading stock" />}
    <section aria-label="Assigned jobs" style={{ display: "grid", gap: 12 }}><Text as="h3" weight="semibold">Assigned jobs</Text>{work.length ? <div style={{ overflowX: "auto" }} tabIndex={0} aria-label="Scrollable assigned jobs"><Table aria-label="Assigned jobs" style={{ minWidth: 620 }}><TableHeader><TableRow>{["Job", "Customer / branch", "Status", "Scheduled", "Technician"].map(h => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{work.map(j => <TableRow key={j.id}><TableCell>{j.reference}</TableCell><TableCell>{j.customer.name} / {j.branch.name}</TableCell><TableCell>{j.status}</TableCell><TableCell>{j.scheduledFor ?? "Unscheduled"}</TableCell><TableCell>{j.technician?.name ?? "None"}</TableCell></TableRow>)}</TableBody></Table></div> : <Text>No assigned or in-progress jobs.</Text>}</section>
    <Text size={200}>Working is physical stock; available excludes reservations, broken and unverified equipment. Vehicle status and technician changes never transfer stock.</Text>
  </FleetSheet>;
}
