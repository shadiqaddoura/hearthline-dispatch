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
import type { RestockItemDto } from "@/lib/contracts/restocking";
import { describeUnit } from "@/lib/products/catalogue";
import { describePick, formatAmount, orderPickList } from "@/lib/restocking/presentation";

const useStyles = makeStyles({
  table: { width: "100%" },
  number: { textAlign: "end", fontVariantNumeric: "tabular-nums" },
  sku: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  product: { display: "flex", flexDirection: "column", paddingBlock: tokens.spacingVerticalXXS },
  note: { display: "block", color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  warning: { color: tokens.colorPaletteRedForeground1 },
  outstanding: { fontWeight: tokens.fontWeightSemibold },
  done: { color: tokens.colorNeutralForeground3 },
  cards: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  facts: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
    margin: 0,
  },
  term: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  definition: { margin: 0, fontSize: tokens.fontSizeBase200 },
});

interface PickListProps {
  items: RestockItemDto[];
  vanCode: string;
  /** Narrow layouts get one card per product instead of a wide table. */
  compact: boolean;
}

/**
 * What to collect at the hub. "To collect" is the backend's outstanding quantity
 * (minimum − working stock, never below zero); "Received" is what has already been
 * confirmed as collected under this job.
 */
export function PickList({ items, vanCode, compact }: PickListProps) {
  const styles = useStyles();
  const ordered = orderPickList(items);

  if (compact) {
    return (
      <ul className={styles.cards} aria-label={`Pick list for ${vanCode}`}>
        {ordered.map((item) => (
          <li key={item.productId} className={styles.card}>
            <ProductName item={item} />
            <dl className={styles.facts}>
              <dt className={styles.term}>To collect</dt>
              <dd className={styles.definition}>
                <ToCollect item={item} />
              </dd>
              <dt className={styles.term}>Minimum</dt>
              <dd className={styles.definition}>{formatAmount(item.vanMinimum, item.pick.baseUnit)}</dd>
              <dt className={styles.term}>Working in van</dt>
              <dd className={styles.definition}>
                <Working item={item} />
              </dd>
              <dt className={styles.term}>Received</dt>
              <dd className={styles.definition}>{received(item)}</dd>
              <dt className={styles.term}>Unit</dt>
              <dd className={styles.definition}>{describeUnit(item.pick)}</dd>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Table size="small" aria-label={`Pick list for ${vanCode}`} className={styles.table}>
      <TableHeader>
        <TableRow>
          <TableHeaderCell style={{ width: "30%" }}>Product</TableHeaderCell>
          <TableHeaderCell>Unit</TableHeaderCell>
          <TableHeaderCell className={styles.number}>Minimum</TableHeaderCell>
          <TableHeaderCell className={styles.number}>Working in van</TableHeaderCell>
          <TableHeaderCell style={{ width: "22%" }}>To collect</TableHeaderCell>
          <TableHeaderCell className={styles.number}>Received</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((item) => (
          <TableRow key={item.productId}>
            <TableCell>
              <ProductName item={item} />
            </TableCell>
            <TableCell>{describeUnit(item.pick)}</TableCell>
            <TableCell className={styles.number}>{formatAmount(item.vanMinimum, item.pick.baseUnit)}</TableCell>
            <TableCell className={styles.number}>
              <Working item={item} />
            </TableCell>
            <TableCell>
              <ToCollect item={item} />
            </TableCell>
            <TableCell className={styles.number}>{received(item)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ProductName({ item }: { item: RestockItemDto }) {
  const styles = useStyles();
  return (
    <span className={styles.product}>
      <span className={styles.sku}>{item.sku}</span>
      <Text size={200}>{item.name}</Text>
    </span>
  );
}

function ToCollect({ item }: { item: RestockItemDto }) {
  const styles = useStyles();
  if (item.outstanding === 0) return <span className={styles.done}>Nothing left</span>;
  const pick = describePick(item.pick);
  return (
    <span>
      <span className={styles.outstanding}>{pick.practical}</span>
      {pick.exact && <span className={styles.note}>exactly {pick.exact}</span>}
      {pick.wholePacksOnly && <span className={styles.note}>Whole boxes only: {pick.wholePacksOnly}</span>}
    </span>
  );
}

function Working({ item }: { item: RestockItemDto }) {
  const styles = useStyles();
  return (
    <span>
      {formatAmount(item.working, item.pick.baseUnit)}
      {item.balanceNeedsReview && (
        <span className={mergeClasses(styles.note, styles.warning)}>Below zero: counted as 0 until reviewed</span>
      )}
    </span>
  );
}

function received(item: RestockItemDto): string {
  return item.collected > 0 ? formatAmount(item.collected, item.pick.baseUnit) : "None yet";
}
