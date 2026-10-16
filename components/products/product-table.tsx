"use client";

import type { MouseEvent, ReactNode } from "react";
import {
  Link,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  createTableColumn,
  makeStyles,
  tokens,
  useTableFeatures,
  useRestoreFocusTarget,
  useTableSort,
  type TableColumnDefinition,
  type TableColumnId,
} from "@fluentui/react-components";
import type { ProductDto } from "@/lib/contracts/products";
import { describeUnit, describeVanMinimum, summariseRestockPolicy } from "@/lib/products/catalogue";
import { RestockPolicyBadge } from "./restock-policy-badge";

const useStyles = makeStyles({
  scroller: { overflowX: "auto" },
  table: { minWidth: "100%" },
  sku: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200, whiteSpace: "nowrap" },
  stacked: { display: "flex", flexDirection: "column", paddingBlock: tokens.spacingVerticalS },
  secondary: { color: tokens.colorNeutralForeground3 },
});

interface Column {
  definition: TableColumnDefinition<ProductDto>;
  label: string;
  width?: string;
  render: (product: ProductDto) => ReactNode;
}

interface ProductTableProps {
  products: ProductDto[];
  /** Narrow screens show two stacked columns instead of six. */
  compact: boolean;
  onOpenDetails: (product: ProductDto) => void;
}

export function ProductTable({ products, compact, onOpenDetails }: ProductTableProps) {
  const styles = useStyles();
  const restoreFocusTarget = useRestoreFocusTarget();

  const nameLink = (product: ProductDto) => (
    <Link
      as="button"
      {...restoreFocusTarget}
      onClick={() => onOpenDetails(product)}
      aria-label={`${product.name}, view details`}
    >
      {product.name}
    </Link>
  );

  const restock: Column = {
    definition: createTableColumn<ProductDto>({
      columnId: "restock",
      compare: (a, b) => summariseRestockPolicy(a).label.localeCompare(summariseRestockPolicy(b).label),
    }),
    label: "Auto restock",
    width: compact ? "40%" : "18%",
    render: (product) => <RestockPolicyBadge product={product} />,
  };

  const columns: Column[] = compact
    ? [
        {
          definition: createTableColumn<ProductDto>({ columnId: "name", compare: (a, b) => a.name.localeCompare(b.name) }),
          label: "Product",
          render: (product) => (
            <span className={styles.stacked}>
              {nameLink(product)}
              <span className={styles.sku}>{product.sku}</span>
            </span>
          ),
        },
        restock,
      ]
    : [
        {
          definition: createTableColumn<ProductDto>({ columnId: "sku", compare: (a, b) => a.sku.localeCompare(b.sku) }),
          label: "SKU",
          width: "11%",
          render: (product) => <span className={styles.sku}>{product.sku}</span>,
        },
        {
          definition: createTableColumn<ProductDto>({ columnId: "name", compare: (a, b) => a.name.localeCompare(b.name) }),
          label: "Name",
          width: "27%",
          render: nameLink,
        },
        {
          definition: createTableColumn<ProductDto>({
            columnId: "unit",
            compare: (a, b) => describeUnit(a).localeCompare(describeUnit(b)),
          }),
          label: "Unit",
          width: "15%",
          render: describeUnit,
        },
        {
          definition: createTableColumn<ProductDto>({
            columnId: "serialised",
            compare: (a, b) => Number(b.serialised) - Number(a.serialised),
          }),
          label: "Serial numbers",
          width: "14%",
          render: (product) =>
            product.serialised ? "Required" : <span className={styles.secondary}>Not tracked</span>,
        },
        {
          definition: createTableColumn<ProductDto>({ columnId: "vanMinimum", compare: (a, b) => a.vanMinimum - b.vanMinimum }),
          label: "Van minimum",
          width: "15%",
          render: describeVanMinimum,
        },
        restock,
      ];

  const {
    getRows,
    sort: { getSortDirection, toggleColumnSort, sort },
  } = useTableFeatures({ columns: columns.map((c) => c.definition), items: products }, [
    useTableSort({ defaultSortState: { sortColumn: compact ? "name" : "sku", sortDirection: "ascending" } }),
  ]);

  const rows = sort(getRows());
  const sortProps = (columnId: TableColumnId) => ({
    onClick: (event: MouseEvent) => toggleColumnSort(event, columnId),
    sortDirection: getSortDirection(columnId),
  });

  return (
    <div className={styles.scroller}>
      <Table sortable aria-label="Product catalogue" className={styles.table}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHeaderCell
                key={column.definition.columnId}
                {...sortProps(column.definition.columnId)}
                style={column.width ? { width: column.width } : undefined}
              >
                {column.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ item }) => (
            <TableRow key={item.id}>
              {columns.map((column) => (
                <TableCell key={column.definition.columnId}>
                  <Text>{column.render(item)}</Text>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
