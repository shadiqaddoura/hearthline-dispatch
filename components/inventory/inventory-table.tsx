"use client";

import { Button, makeStyles, mergeClasses, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from "@fluentui/react-components";
import { BoxMultipleRegular, BoxSearchRegular, VehicleTruckProfileRegular } from "@fluentui/react-icons";
import type { StockLineDto } from "@/lib/contracts/inventory";
import { EmptyMessage } from "@/components/products/product-states";

export interface InventoryRow { locationId: string; locationName: string; kind?: "VAN" | "HUB"; line: StockLineDto; }
export type InventoryEmptyState = "locations" | "recorded" | "matching";

const useStyles = makeStyles({
  scroller: { maxWidth: "100%", overflowX: "auto" },
  table: { width: "100%", minWidth: "860px", tableLayout: "fixed" },
  locationColumn: { width: "132px" },
  productColumn: { width: "auto" },
  unitColumn: { width: "64px" },
  quantityColumn: { width: "76px" },
  availableColumn: { width: "96px" },
  verificationColumn: { width: "130px" },
  numericHeader: {
    paddingInline: tokens.spacingHorizontalXS, textAlign: "right", verticalAlign: "bottom",
    whiteSpace: "normal", overflowWrap: "anywhere",
  },
  numericHeaderButton: {
    width: "100%", minWidth: 0, justifyContent: "flex-end", textAlign: "right",
    whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: tokens.lineHeightBase200,
  },
  numericCell: { paddingInline: tokens.spacingHorizontalXS, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  verificationHeader: { paddingInlineEnd: tokens.spacingHorizontalL },
  verificationCell: { paddingInlineEnd: tokens.spacingHorizontalL },
  productCell: { minWidth: 0 },
  productButton: {
    width: "100%", minWidth: 0, flexDirection: "column", alignItems: "flex-start",
    justifyContent: "center", textAlign: "left", whiteSpace: "normal",
  },
  productName: { display: "block", overflowWrap: "anywhere" },
  sku: { display: "block", fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
});

export function InventoryTable({ rows, onSelect, onSort, sort, emptyState, onClearFilters }: {
  rows: InventoryRow[];
  onSelect: (row: InventoryRow) => void;
  onSort: (key: "location" | "product" | "working" | "available") => void;
  sort: { key: string; direction: "asc" | "desc" };
  emptyState?: InventoryEmptyState;
  onClearFilters?: () => void;
}) {
  const styles = useStyles();
  const header = (label: string, key: "location" | "product" | "working" | "available", numeric = false) => (
    <TableHeaderCell className={numeric ? styles.numericHeader : undefined} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <Button className={numeric ? styles.numericHeaderButton : undefined} appearance="subtle" size="small" onClick={() => onSort(key)}>{label}{sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</Button>
    </TableHeaderCell>
  );
  return <div className={styles.scroller} role="region" aria-label="Inventory by location and product" tabIndex={0}>
    <Table className={styles.table} aria-label="Inventory by location and product">
      <colgroup>
        <col className={styles.locationColumn} />
        <col className={styles.productColumn} />
        <col className={styles.unitColumn} />
        <col className={styles.quantityColumn} />
        <col className={styles.quantityColumn} />
        <col className={styles.availableColumn} />
        <col className={styles.quantityColumn} />
        <col className={styles.verificationColumn} />
      </colgroup>
      <TableHeader><TableRow>
        {header("Location", "location")}{header("Product / SKU", "product")}
        <TableHeaderCell>Unit</TableHeaderCell>{header("Working physical", "working", true)}
        <TableHeaderCell className={styles.numericHeader}><div>Reserved</div></TableHeaderCell>{header("Available", "available", true)}
        <TableHeaderCell className={styles.numericHeader}><div>Broken</div></TableHeaderCell><TableHeaderCell className={mergeClasses(styles.numericHeader, styles.verificationHeader)}><div>Awaiting serial verification</div></TableHeaderCell>
      </TableRow></TableHeader>
      <TableBody>{rows.length ? rows.map((row) => <TableRow key={`${row.locationId}:${row.line.productId}`}>
        <TableCell><Button appearance="subtle" onClick={() => onSelect(row)}>{row.locationName}</Button></TableCell>
        <TableCell className={styles.productCell}><Button className={styles.productButton} appearance="subtle" onClick={() => onSelect(row)}><span className={styles.productName}>{row.line.name}</span><Text as="span" size={200} className={styles.sku}>{row.line.sku}</Text></Button></TableCell>
        <TableCell>{row.line.baseUnit}</TableCell>
        <TableCell className={styles.numericCell}><Quantity value={row.line.working} negative={row.line.working < 0} /></TableCell>
        <TableCell className={styles.numericCell}>{row.line.reserved.toLocaleString("en")}</TableCell>
        <TableCell className={styles.numericCell}>{row.line.available.toLocaleString("en")}</TableCell>
        <TableCell className={styles.numericCell}>{row.line.broken.toLocaleString("en")}</TableCell>
        <TableCell className={mergeClasses(styles.numericCell, styles.verificationCell)}>{row.line.needsVerification === null ? "—" : row.line.needsVerification.toLocaleString("en")}</TableCell>
      </TableRow>) : emptyState ? <TableRow><TableCell colSpan={8} style={{ padding: 0, verticalAlign: "middle" }}><InventoryEmpty state={emptyState} onClearFilters={onClearFilters} /></TableCell></TableRow> : null}</TableBody>
    </Table>
  </div>;
}

function InventoryEmpty({ state, onClearFilters }: { state: InventoryEmptyState; onClearFilters?: () => void }) {
  if (state === "locations") return <EmptyMessage icon={<VehicleTruckProfileRegular />} title="No inventory locations yet" minHeight={260}>
    Add a van in Fleet to start tracking its inventory.
  </EmptyMessage>;
  if (state === "recorded") return <EmptyMessage icon={<BoxMultipleRegular />} title="No inventory recorded yet." minHeight={260}>
    Inventory will appear here after stock is received or a physical count is recorded.
  </EmptyMessage>;
  return <EmptyMessage icon={<BoxSearchRegular />} title="No matching inventory." minHeight={260} action={onClearFilters ? <Button onClick={onClearFilters}>Clear filters</Button> : undefined}>
    Try a different search or adjust the location and condition filters.
  </EmptyMessage>;
}

function Quantity({ value, negative }: { value: number; negative: boolean }) {
  return <span title={negative ? "Imported negative count: reconcile with a physical count" : undefined} style={negative ? { color: "var(--colorPaletteRedForeground1)", fontWeight: 600 } : undefined}>
    {value.toLocaleString("en")}{negative ? " · Reconcile" : ""}
  </span>;
}
