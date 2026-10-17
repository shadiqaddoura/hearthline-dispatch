"use client";

import { Badge, Button, makeStyles, mergeClasses, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, Tooltip, tokens } from "@fluentui/react-components";
import { BoxMultipleRegular, BoxSearchRegular, VehicleTruckProfileRegular } from "@fluentui/react-icons";
import type { StockLineDto } from "@/lib/contracts/inventory";
import { EmptyMessage } from "@/components/products/product-states";

export interface InventoryRow { locationId: string; locationName: string; kind?: "VAN" | "HUB"; line: StockLineDto; }
export type InventoryEmptyState = "locations" | "recorded" | "matching";

const useStyles = makeStyles({
  table: { width: "100%", minWidth: 0, tableLayout: "fixed" },
  productColumn: { width: "29%" },
  unitColumn: { width: "8%" },
  workingColumn: { width: "14%" },
  reservedColumn: { width: "9%" },
  availableColumn: { width: "10%" },
  brokenColumn: { width: "9%" },
  verificationColumn: { width: "21%" },
  locationRow: { backgroundColor: tokens.colorNeutralBackground2 },
  locationHeading: { paddingBlock: tokens.spacingVerticalS },
  locationHeadingContent: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: tokens.spacingHorizontalS },
  locationName: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  locationType: {
    display: "inline-flex", alignItems: "center", borderRadius: tokens.borderRadiusMedium,
    paddingInline: tokens.spacingHorizontalS, paddingBlock: tokens.spacingVerticalXXS,
    backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular,
  },
  headerCell: {
    paddingInline: tokens.spacingHorizontalS,
    verticalAlign: "middle",
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200,
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  numericHeader: {
    textAlign: "right",
  },
  numericHeaderButton: {
    width: "100%", minWidth: 0, justifyContent: "flex-end", textAlign: "right",
    paddingInline: 0, whiteSpace: "normal", overflowWrap: "anywhere",
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200,
  },
  productHeaderButton: {
    minWidth: 0, justifyContent: "flex-start", textAlign: "left", paddingInline: 0,
    fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase200, whiteSpace: "normal", overflowWrap: "anywhere",
  },
  dataCell: { paddingInline: tokens.spacingHorizontalS, verticalAlign: "middle" },
  unitCell: { textAlign: "left" },
  numericCell: { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis" },
  verificationTrigger: {
    display: "inline-flex", maxWidth: "100%", borderRadius: tokens.borderRadiusSmall,
    "&:focus-visible": {
      outlineStyle: "solid", outlineWidth: "2px", outlineColor: tokens.colorStrokeFocus2,
      outlineOffset: "2px",
    },
  },
  productCell: { minWidth: 0, textAlign: "left" },
  productButton: {
    width: "100%", minWidth: 0, flexDirection: "column", alignItems: "flex-start",
    justifyContent: "center", textAlign: "left", whiteSpace: "normal", paddingInline: 0,
  },
  productName: { display: "block", overflowWrap: "anywhere" },
  sku: { display: "block", fontFamily: tokens.fontFamilyMonospace, color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
  mobileHeaderLabel: {
    display: "none",
    "@media (max-width: 640px)": {
      display: "block", marginBottom: tokens.spacingVerticalXXS,
      color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100,
      fontWeight: tokens.fontWeightRegular, textAlign: "left", whiteSpace: "normal",
    },
  },
  mobileTable: {
    "@media (max-width: 640px)": {
      "& .inventory-header-row": {
        position: "absolute", width: "1px", height: "1px", padding: 0,
        margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap", border: 0,
      },
      "& .inventory-product-row": {
        display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        paddingBlock: tokens.spacingVerticalXS,
      },
      "& .inventory-product-row > *": {
        minWidth: 0, paddingInline: tokens.spacingHorizontalXS,
        whiteSpace: "normal", overflowWrap: "anywhere", textAlign: "left",
      },
      "& .inventory-product-row > .inventory-numeric-cell": { textAlign: "right" },
      "& .inventory-product-cell": { gridColumn: "1 / -1" },
      "& .inventory-location-row": { display: "block" },
      "& .inventory-location-row > *": { display: "block", width: "100%" },
    },
  },
});

export function InventoryTable({ rows, onSelect, onSort, sort, emptyState, onClearFilters }: {
  rows: InventoryRow[];
  onSelect: (row: InventoryRow) => void;
  onSort: (key: "product" | "working" | "available") => void;
  sort: { key: string; direction: "asc" | "desc" };
  emptyState?: InventoryEmptyState;
  onClearFilters?: () => void;
}) {
  const styles = useStyles();
  const header = (label: string, key: "product" | "working" | "available", numeric = false) => (
    <TableHeaderCell className={mergeClasses(styles.headerCell, numeric && styles.numericHeader)} aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <Button className={numeric ? styles.numericHeaderButton : styles.productHeaderButton} appearance="subtle" size="small" onClick={() => onSort(key)}>{label}{sort.key === key ? (sort.direction === "asc" ? " ↑" : " ↓") : ""}</Button>
    </TableHeaderCell>
  );
  const groups = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const group = groups.get(row.locationId) ?? [];
    group.push(row);
    groups.set(row.locationId, group);
  }
  const sortedGroups = [...groups.values()].map((group) => ({
    locationName: group[0].locationName,
    kind: group[0].kind,
    rows: group.sort((a, b) => {
      const cmp = sort.key === "product" ? a.line.name.localeCompare(b.line.name) : sort.key === "working" ? a.line.working - b.line.working : a.line.available - b.line.available;
      return cmp * (sort.direction === "asc" ? 1 : -1);
    }),
  })).sort((a, b) => a.locationName.localeCompare(b.locationName));
  const tableRows = sortedGroups.flatMap((group) => [
    <TableRow key={`location:${group.rows[0].locationId}`} className={mergeClasses(styles.locationRow, "inventory-location-row")}>
      <TableHeaderCell colSpan={7} className={styles.locationHeading}>
        <div className={styles.locationHeadingContent}>
          <span className={styles.locationName}>{formatLocationName(group.kind, group.locationName)}</span>
          <span className={styles.locationType}>{group.kind === "VAN" ? "Van" : "Warehouse"}</span>
        </div>
      </TableHeaderCell>
    </TableRow>,
    ...group.rows.map((row) => <TableRow key={`${row.locationId}:${row.line.productId}`} className="inventory-product-row">
      <TableCell className={mergeClasses(styles.dataCell, styles.productCell, "inventory-product-cell")} data-label="Product / SKU"><span className={styles.mobileHeaderLabel}>Product / SKU</span><Button className={styles.productButton} appearance="subtle" onClick={() => onSelect(row)}><span className={styles.productName}>{row.line.name}</span><Text as="span" size={200} className={styles.sku}>{row.line.sku}</Text></Button></TableCell>
      <TableCell className={mergeClasses(styles.dataCell, styles.unitCell)} data-label="Unit"><span className={styles.mobileHeaderLabel}>Unit</span>{row.line.baseUnit}</TableCell>
      <TableCell className={mergeClasses(styles.dataCell, styles.numericCell, "inventory-numeric-cell")} data-label="Working physical"><span className={styles.mobileHeaderLabel}>Working physical</span><Quantity value={row.line.working} negative={row.line.working < 0} /></TableCell>
      <TableCell className={mergeClasses(styles.dataCell, styles.numericCell, "inventory-numeric-cell")} data-label="Reserved"><span className={styles.mobileHeaderLabel}>Reserved</span>{row.line.reserved.toLocaleString("en")}</TableCell>
      <TableCell className={mergeClasses(styles.dataCell, styles.numericCell, "inventory-numeric-cell")} data-label="Available"><span className={styles.mobileHeaderLabel}>Available</span>{row.line.available.toLocaleString("en")}</TableCell>
      <TableCell className={mergeClasses(styles.dataCell, styles.numericCell, "inventory-numeric-cell")} data-label="Broken"><span className={styles.mobileHeaderLabel}>Broken</span>{row.line.broken.toLocaleString("en")}</TableCell>
      <TableCell className={mergeClasses(styles.dataCell, styles.numericCell, "inventory-numeric-cell")} data-label="Awaiting serial verification"><span className={styles.mobileHeaderLabel}>Awaiting serial verification</span><VerificationCount count={row.line.needsVerification} /></TableCell>
    </TableRow>),
  ]);
  if (tableRows.length === 0 && emptyState) {
    tableRows.push(<TableRow key="empty-state"><TableCell colSpan={7} style={{ padding: 0, verticalAlign: "middle" }}><InventoryEmpty state={emptyState} onClearFilters={onClearFilters} /></TableCell></TableRow>);
  }
  return <Table className={mergeClasses(styles.table, styles.mobileTable)} aria-label="Inventory stock by location">
      <colgroup>
        <col className={styles.productColumn} />
        <col className={styles.unitColumn} />
        <col className={styles.workingColumn} />
        <col className={styles.reservedColumn} />
        <col className={styles.availableColumn} />
        <col className={styles.brokenColumn} />
        <col className={styles.verificationColumn} />
      </colgroup>
      <TableHeader><TableRow className="inventory-header-row">
        {header("Product / SKU", "product")}
        <TableHeaderCell className={mergeClasses(styles.headerCell, styles.unitCell)}>Unit</TableHeaderCell>{header("Working physical", "working", true)}
        <TableHeaderCell className={mergeClasses(styles.headerCell, styles.numericHeader)}>Reserved</TableHeaderCell>{header("Available", "available", true)}
        <TableHeaderCell className={mergeClasses(styles.headerCell, styles.numericHeader)}>Broken</TableHeaderCell><TableHeaderCell className={mergeClasses(styles.headerCell, styles.numericHeader)}><div>Awaiting serial verification</div></TableHeaderCell>
      </TableRow></TableHeader>
      <TableBody>{tableRows}</TableBody>
    </Table>
}

function VerificationCount({ count }: { count: number | null }) {
  const styles = useStyles();
  if (count === null) return <>—</>;
  if (count <= 0) return <>{count.toLocaleString("en")}</>;
  const description = `${count.toLocaleString("en")} unit${count === 1 ? "" : "s"} ${count === 1 ? "needs" : "need"} serial verification.`;
  return <Tooltip content={description} relationship="description">
    <span className={styles.verificationTrigger} tabIndex={0}>
      <Badge appearance="outline" color="danger" shape="rounded" size="small">{count.toLocaleString("en")}</Badge>
    </span>
  </Tooltip>;
}

function formatLocationName(kind: InventoryRow["kind"], name: string) {
  if (kind !== "VAN") return name;
  return `Van ${name.replace(/^Van\s+/i, "")}`;
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
