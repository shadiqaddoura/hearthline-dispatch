"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useMediaQuery } from "@/components/shell/use-media-query";
import type { StockShortageDto } from "@/lib/contracts/dispatch";
import type { StockLineDto } from "@/lib/contracts/inventory";
import type { JobItemDto } from "@/lib/contracts/jobs";
import { hasVisibleStock } from "@/components/inventory/has-visible-stock";

const useStyles = makeStyles({
  table: { width: "100%" },
  stockTable: { width: "100%", tableLayout: "fixed" },
  stockNumber: {
    textAlign: "end",
    fontVariantNumeric: "tabular-nums",
    width: "12%",
    paddingInline: tokens.spacingHorizontalXS,
    overflowWrap: "anywhere",
  },
  heading: { margin: 0 },
  number: { textAlign: "end", fontVariantNumeric: "tabular-nums", width: "64px" },
  product: { display: "flex", flexDirection: "column", paddingBlock: tokens.spacingVerticalXXS },
  sku: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  short: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  comparison: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  cards: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  item: {
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    minWidth: 0,
  },
  productName: { fontWeight: tokens.fontWeightSemibold, overflowWrap: "anywhere" },
  quantities: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: tokens.spacingHorizontalS,
    margin: `${tokens.spacingVerticalS} 0 0`,
  },
  value: { margin: 0, fontVariantNumeric: "tabular-nums" },
});

/**
 * Physical stock and what can still be promised, kept apart. Figures come from
 * the API: "available" already excludes broken units, units waiting for a
 * serial and stock reserved for other jobs.
 */
export function StockTable({ lines, title, asOf }: { lines: StockLineDto[]; title: string; asOf?: string }) {
  const styles = useStyles();
  const visibleLines = lines.filter(hasVisibleStock);
  const mobile = useMediaQuery("(max-width: 1023px)") ?? false;
  const quantities = (line: StockLineDto) =>
    [
      ["Working", line.working],
      ["Reserved", line.reserved],
      ["Available", line.available],
      ["Broken", line.broken],
      ["Unverified", line.needsVerification ?? "—"],
    ] as const;
  const product = (line: StockLineDto) => (
    <span className={styles.product}>
      <span className={styles.productName}>{line.name}</span>
      <span className={styles.sku}>{line.sku}</span>
      {line.working < 0 && <span className={styles.short}>Count below zero — needs a recount</span>}
    </span>
  );
  return (
    <section className={styles.comparison} aria-label={title}>
      <Text as="h4" weight="semibold" className={styles.heading}>
        {title}
      </Text>
      {asOf && (
        <Text size={200} className={styles.note}>
          As of {asOf}
        </Text>
      )}
      {mobile ? (
        <ul className={styles.cards} aria-label={title}>
          {visibleLines.map((line) => (
            <li key={line.productId} className={styles.item}>
              {product(line)}
              <dl className={styles.quantities}>
                {quantities(line).map(([label, value]) => (
                  <div key={label}>
                    <dt className={styles.note}>{label}</dt>
                    <dd className={mergeClasses(styles.value, label === "Working" && line.working < 0 && styles.short)}>
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <Table size="small" aria-label={title} className={styles.stockTable}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Product</TableHeaderCell>
              {["Working", "Reserved", "Available", "Broken", "Unverified"].map((label) => (
                <TableHeaderCell key={label} className={styles.stockNumber}>
                  {label}
                </TableHeaderCell>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleLines.map((line) => (
              <TableRow key={line.productId}>
                <TableCell>{product(line)}</TableCell>
                {quantities(line).map(([label, value]) => (
                  <TableCell key={label} className={styles.stockNumber}>
                    <span className={label === "Working" && line.working < 0 ? styles.short : undefined}>{value}</span>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** Compare the request with assignable stock; unverified units never reduce the shortfall. */
export function JobItemsOnVan({
  items,
  lines,
  vanCode,
  shortages,
  showStockDetails = false,
}: {
  items: JobItemDto[];
  lines: StockLineDto[];
  vanCode: string;
  /** Undefined for assigned work: its own reservations make a new-work check inappropriate. */
  shortages?: StockShortageDto[];
  /** Assignment dialogs have no full-inventory section; retain stock detail behind a disclosure. */
  showStockDetails?: boolean;
}) {
  const styles = useStyles();
  const mobile = useMediaQuery("(max-width: 600px)") ?? false;
  const rows = items.map((item) => {
    const line = lines.find((entry) => entry.productId === item.productId);
    const shortage = shortages?.find((entry) => entry.productId === item.productId);
    return {
      item,
      line,
      needed: shortage?.required ?? item.quantity,
      available: shortage?.available ?? line?.available ?? null,
      shortfall: shortage ? Math.max(0, shortage.required - shortage.available) : shortages ? 0 : null,
    };
  });
  const product = ({ item }: (typeof rows)[number]) => (
    <span className={styles.product}>
      <span className={styles.productName}>{item.name}</span>
      <span className={styles.sku}>{item.sku}</span>
    </span>
  );

  return (
    <section className={styles.comparison} aria-label={`Required products on ${vanCode}`}>
      <Text weight="semibold">Required products on {vanCode}</Text>
      <Text size={200} className={styles.note}>
        {shortages
          ? "Shortfall counts assignable stock only; unverified units are physically present but unavailable."
          : "Availability is for new work. Shortfall is not checked here for an already assigned job."}
      </Text>
      {mobile ? (
        <ul className={styles.cards} aria-label={`Product comparison on ${vanCode}`}>
          {rows.map((row) => (
            <li key={row.item.productId} className={styles.item}>
              {product(row)}
              <dl className={styles.quantities}>
                <div>
                  <dt className={styles.note}>Needed</dt>
                  <dd className={styles.value}>{row.needed}</dd>
                </div>
                <div>
                  <dt className={styles.note}>Available</dt>
                  <dd className={styles.value}>{row.available ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt className={styles.note}>Shortfall</dt>
                  <dd className={mergeClasses(styles.value, !!row.shortfall && styles.short)}>
                    {row.shortfall ?? "Not checked"}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <Table size="small" aria-label={`Product comparison on ${vanCode}`} className={styles.table}>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Product</TableHeaderCell>
              <TableHeaderCell className={styles.number}>Needed</TableHeaderCell>
              <TableHeaderCell className={styles.number}>Available</TableHeaderCell>
              <TableHeaderCell className={styles.number}>Shortfall</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.item.productId}>
                <TableCell>{product(row)}</TableCell>
                <TableCell className={styles.number}>{row.needed}</TableCell>
                <TableCell className={styles.number}>{row.available ?? "Not recorded"}</TableCell>
                <TableCell className={styles.number}>
                  <span className={row.shortfall ? styles.short : undefined}>{row.shortfall ?? "Not checked"}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {showStockDetails && (
        <Accordion collapsible>
          <AccordionItem value="stock-details">
            <AccordionHeader size="small">Stock details</AccordionHeader>
            <AccordionPanel>
              <StockTable
                lines={lines.filter((line) => items.some((item) => item.productId === line.productId))}
                title={`Required-product stock on ${vanCode}`}
              />
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}
    </section>
  );
}
