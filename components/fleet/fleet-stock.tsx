"use client";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import type { StockLineDto } from "@/lib/contracts/inventory";
export function FleetStock({ lines }: { lines: StockLineDto[] }) {
  return <section aria-label="Stock on this van" style={{ display: "grid", gap: 12 }}><Text as="h3" weight="semibold">Stock on this van</Text><div style={{ overflowX: "auto" }} tabIndex={0} aria-label="Scrollable stock table"><Table aria-label="Stock on this van" size="small" style={{ minWidth: 620 }}><TableHeader><TableRow>{["Product", "Working", "Reserved", "Available", "Broken", "Unverified"].map(h => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{lines.map(l => <TableRow key={l.productId}><TableCell>{l.name}<br /><Text size={200}>{l.sku} · {l.baseUnit}</Text></TableCell>{[l.working, l.reserved, l.available, l.broken, l.needsVerification ?? "—"].map((n, i) => <TableCell key={i}>{n}</TableCell>)}</TableRow>)}</TableBody></Table></div></section>;
}
