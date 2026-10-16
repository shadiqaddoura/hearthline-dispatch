"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { StockShortageDto } from "@/lib/contracts/dispatch";
import type { StockLineDto } from "@/lib/contracts/inventory";
import type { JobItemDto } from "@/lib/contracts/jobs";

const useStyles = makeStyles({
  table: { width: "100%" },
  number: { textAlign: "end", fontVariantNumeric: "tabular-nums", width: "64px" },
  product: { display: "flex", flexDirection: "column", paddingBlock: tokens.spacingVerticalXXS },
  sku: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  note: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  short: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  items: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXS },
  itemLine: { display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: tokens.spacingHorizontalS },
});

/**
 * Physical stock and what can still be promised, kept apart. Figures come from
 * the API: "available" already excludes broken units, units waiting for a
 * serial and stock reserved for other jobs.
 */
export function StockTable({ lines, caption }: { lines: StockLineDto[]; caption: string }) {
  const styles = useStyles();
  return (
    <Table size="extra-small" aria-label={caption} className={styles.table}>
      <StockHeader />
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.productId}>
            <TableCell>
              <ProductCell line={line} />
            </TableCell>
            <NumberCells line={line} />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The selected job's items against this van's stock; `shortages` are the backend's verdict. */
export function JobItemsOnVan({
  items,
  lines,
  vanCode,
  shortages = [],
}: {
  items: JobItemDto[];
  lines: StockLineDto[];
  vanCode: string;
  shortages?: StockShortageDto[];
}) {
  const styles = useStyles();
  return (
    <ul className={styles.items} aria-label={`Selected job's products on ${vanCode}`}>
      {items.map((item) => {
        const line = lines.find((l) => l.productId === item.productId);
        const short = shortages.some((s) => s.productId === item.productId);
        return (
          <li key={item.productId}>
            <Text size={200} className={styles.itemLine}>
              <span className={styles.sku}>{item.sku}</span>
              <span>needs {item.quantity}</span>
              <span className={short ? styles.short : undefined}>
                {line ? `${line.available} available` : "not carried"}
                {short ? " (short)" : ""}
              </span>
            </Text>
            {line && (
              <Text size={200} className={styles.note}>
                Working {line.working} · Reserved {line.reserved}
                {notesFor(line).map((note) => ` · ${note}`)}
              </Text>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function StockHeader() {
  const styles = useStyles();
  return (
    <TableHeader>
      <TableRow>
        <TableHeaderCell>Product</TableHeaderCell>
        <TableHeaderCell className={styles.number}>Working</TableHeaderCell>
        <TableHeaderCell className={styles.number}>Reserved</TableHeaderCell>
        <TableHeaderCell className={styles.number}>Available</TableHeaderCell>
      </TableRow>
    </TableHeader>
  );
}

function ProductCell({ line }: { line: StockLineDto }) {
  const styles = useStyles();
  return (
    <span className={styles.product}>
      <span className={styles.sku}>{line.sku}</span>
      <Notes line={line} />
    </span>
  );
}

/** Stock that is in the van but can never be promised, and counts that need a recount. */
function notesFor(line: StockLineDto): string[] {
  return [
    line.working < 0 ? "count below zero, needs a recount" : null,
    line.broken > 0 ? `${line.broken} broken` : null,
    line.needsVerification ? `${line.needsVerification} need a serial` : null,
  ].filter((note): note is string => note !== null);
}

function Notes({ line }: { line: StockLineDto }) {
  const styles = useStyles();
  const notes = notesFor(line);
  return notes.length > 0 ? <span className={styles.note}>{notes.join(" · ")}</span> : null;
}

function NumberCells({ line }: { line: StockLineDto }) {
  const styles = useStyles();
  return (
    <>
      <TableCell className={styles.number}>{line.working}</TableCell>
      <TableCell className={styles.number}>{line.reserved}</TableCell>
      <TableCell className={styles.number}>{line.available}</TableCell>
    </>
  );
}
