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
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { useMediaQuery } from "@/components/shell/use-media-query";
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

/** Compare the request with assignable stock; unverified units never reduce the shortfall. */
export function JobItemsOnVan({
  items,
  lines,
  vanCode,
  shortages,
}: {
  items: JobItemDto[];
  lines: StockLineDto[];
  vanCode: string;
  /** Undefined for assigned work: its own reservations make a new-work check inappropriate. */
  shortages?: StockShortageDto[];
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
      unverified: shortage?.needsVerification ?? line?.needsVerification ?? 0,
    };
  });
  const product = ({ item, line, unverified }: (typeof rows)[number]) => (
    <span className={styles.product}>
      <span className={styles.productName}>{item.name}</span>
      <span className={styles.sku}>{item.sku}</span>
      {unverified > 0 && (
        <span className={styles.note}>Unverified serials: {unverified}</span>
      )}
      {line && (
        <span className={styles.note}>
          Working {line.working} · Reserved {line.reserved} · Broken {line.broken}
        </span>
      )}
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
    </section>
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
