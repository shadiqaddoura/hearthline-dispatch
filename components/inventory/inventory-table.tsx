"use client";

import { Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import type { StockLineDto } from "@/lib/contracts/inventory";

export interface InventoryRow { locationId: string; locationName: string; line: StockLineDto; }

export function InventoryTable({ rows, onSelect, onSort, sort }: {
  rows: InventoryRow[];
  onSelect: (row: InventoryRow) => void;
  onSort: (key: "location" | "product" | "working" | "available") => void;
  sort: { key: string; direction: "asc" | "desc" };
}) {
  const header = (label: string, key: "location" | "product" | "working" | "available") => (
    <TableHeaderCell aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <Button appearance="subtle" size="small" onClick={() => onSort(key)}>{label}{sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</Button>
    </TableHeaderCell>
  );
  return <div role="region" aria-label="Inventory by location and product" tabIndex={0} style={{ overflowX: "auto" }}>
    <Table aria-label="Inventory by location and product" style={{ minWidth: 1060 }}>
      <TableHeader><TableRow>
        {header("Location", "location")}{header("Product / SKU", "product")}
        <TableHeaderCell>Unit</TableHeaderCell>{header("Working physical", "working")}
        <TableHeaderCell>Reserved</TableHeaderCell>{header("Available", "available")}
        <TableHeaderCell>Broken</TableHeaderCell><TableHeaderCell>Awaiting serial verification</TableHeaderCell>
      </TableRow></TableHeader>
      <TableBody>{rows.map((row) => <TableRow key={`${row.locationId}:${row.line.productId}`}>
        <TableCell><Button appearance="subtle" onClick={() => onSelect(row)}>{row.locationName}</Button></TableCell>
        <TableCell><Button appearance="subtle" onClick={() => onSelect(row)}>{row.line.name}<Text as="span" size={200} style={{ display: "block", fontFamily: "monospace" }}>{row.line.sku}</Text></Button></TableCell>
        <TableCell>{row.line.baseUnit}</TableCell>
        <TableCell><Quantity value={row.line.working} negative={row.line.working < 0} /></TableCell>
        <TableCell>{row.line.reserved.toLocaleString("en")}</TableCell>
        <TableCell>{row.line.available.toLocaleString("en")}</TableCell>
        <TableCell>{row.line.broken.toLocaleString("en")}</TableCell>
        <TableCell>{row.line.needsVerification === null ? "—" : row.line.needsVerification.toLocaleString("en")}</TableCell>
      </TableRow>)}</TableBody>
    </Table>
  </div>;
}

function Quantity({ value, negative }: { value: number; negative: boolean }) {
  return <span title={negative ? "Imported negative count: reconcile with a physical count" : undefined} style={negative ? { color: "var(--colorPaletteRedForeground1)", fontWeight: 600 } : undefined}>
    {value.toLocaleString("en")}{negative ? " · Reconcile" : ""}
  </span>;
}
