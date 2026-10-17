"use client";
import { Badge, Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, useRestoreFocusTarget } from "@fluentui/react-components";
import type { VanDto } from "@/lib/contracts/fleet";
import type { JobDto } from "@/lib/contracts/jobs";
export function FleetTable({ vans, jobs, onSelect }: { vans: VanDto[]; jobs: JobDto[]; onSelect: (van: VanDto) => void }) {
  const restore = useRestoreFocusTarget();
  return <div style={{ overflowX: "auto" }}><Table aria-label="Fleet" style={{ minWidth: 700 }}><TableHeader><TableRow>{["Van", "Registration", "Technician", "Usual zone", "Status / availability", "Assigned work"].map(h => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{vans.map(v => {
    const work = jobs.filter(j => j.van?.id === v.id);
    return <TableRow key={v.id}><TableCell><Button {...restore} appearance="transparent" onClick={() => onSelect(v)}>{v.code}</Button>{v.isPool && <Badge appearance="outline">Pool</Badge>}</TableCell><TableCell>{v.plate ?? "Not recorded"}</TableCell><TableCell>{v.technician?.name ?? "Unassigned"}</TableCell><TableCell>{v.zone ?? "Not set"}</TableCell><TableCell>{v.status === "ACTIVE" ? "Active" : v.status === "GARAGE" ? "Garage" : "Sold"}<br />{v.status !== "ACTIVE" ? "Unavailable" : !v.technician ? "Needs technician" : "In service"}</TableCell><TableCell>{work.filter(j => j.status === "ASSIGNED").length} assigned · {work.filter(j => j.status === "IN_PROGRESS").length} in progress</TableCell></TableRow>;
  })}</TableBody></Table></div>;
}
