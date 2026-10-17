"use client";
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import type { StockLineDto } from "@/lib/contracts/inventory";
import { hasVisibleStock } from "@/components/inventory/has-visible-stock";
export function FleetStock({ lines }: { lines: StockLineDto[] }) {
  return <section aria-label="Stock on this van" style={{ display: "grid", gap: 12, minWidth: 0 }}><Text as="h3" weight="semibold">Stock on this van</Text><div style={{ overflowX: "auto", minWidth: 0, maxWidth: "100%" }} tabIndex={0} aria-label="Scrollable stock table"><Table aria-label="Stock on this van" size="small" style={{ minWidth: 800, tableLayout: "fixed" }}><TableHeader><TableRow>{["Product", "Working", "Reserved", "Available", "Broken", "Unverified"].map(h => <TableHeaderCell key={h} style={{ width: h === "Product" ? "35%" : "13%" }}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{lines.filter(hasVisibleStock).map(l => <TableRow key={l.productId}><TableCell style={{ overflowWrap: "anywhere" }}>{l.name}<br /><Text size={200}>{l.sku} · {l.baseUnit}</Text></TableCell>{[l.working, l.reserved, l.available, l.broken, l.needsVerification ?? "—"].map((n, i) => <TableCell key={i}>{n}</TableCell>)}</TableRow>)}</TableBody></Table></div></section>;
}
