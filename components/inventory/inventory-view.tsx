"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Input, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Select, Spinner, Text, makeStyles, tokens, useRestoreFocusTarget } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import type { ProductDto } from "@/lib/contracts/products";
import { fetchProducts } from "@/lib/api/products";
import { InventoryTable, type InventoryRow } from "./inventory-table";
import { InventoryDetails, type InventoryOperation } from "./inventory-details";
import { InventoryOperationSheet } from "./inventory-operation-sheet";
import { useInventory } from "./use-inventory";

const stylesHook = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  description: { color: tokens.colorNeutralForeground2, maxWidth: "760px" },
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "end", gap: tokens.spacingHorizontalM },
  surface: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow2, overflow: "hidden" },
  tableHeading: { padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL} 0` },
});

type SortKey = "location" | "product" | "working" | "available";

export function InventoryView() {
  const styles = stylesHook();
  const inventory = useInventory();
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [conditionFilter, setConditionFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("location");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<InventoryRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [operation, setOperation] = useState<InventoryOperation | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [productsError, setProductsError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const restore = useRestoreFocusTarget();

  useEffect(() => {
    const controller = new AbortController();
    fetchProducts(controller.signal).then((result) => { if (!controller.signal.aborted) { setProducts(result); setProductsError(""); } }, (error) => {
      if (!controller.signal.aborted) setProductsError(error instanceof Error ? error.message : "Products could not be loaded.");
    });
    return () => controller.abort();
  }, [inventory.revision]);

  const allRows = useMemo<InventoryRow[]>(() => (inventory.locations ?? []).flatMap((location) => location.lines.map((line) => ({
    locationId: location.locationId, locationName: location.locationName, line,
  }))), [inventory.locations]);
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      const matchesQuery = !q || [row.locationName, row.line.name, row.line.sku, row.line.baseUnit].some((value) => value.toLowerCase().includes(q));
      const matchesLocation = locationFilter === "ALL" || row.locationId === locationFilter;
      const matchesCondition = conditionFilter === "ALL" || (conditionFilter === "WORKING" ? row.line.working !== 0 : row.line.broken !== 0);
      return matchesQuery && matchesLocation && matchesCondition;
    }).sort((a, b) => {
      const cmp = sortKey === "location" ? a.locationName.localeCompare(b.locationName) : sortKey === "product" ? a.line.name.localeCompare(b.line.name) : sortKey === "working" ? a.line.working - b.line.working : a.line.available - b.line.available;
      return cmp * (direction === "asc" ? 1 : -1);
    });
  }, [allRows, query, locationFilter, conditionFilter, sortKey, direction]);
  const setSort = (key: SortKey) => {
    if (sortKey === key) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDirection("asc"); }
  };
  const afterSave = () => {
    setOperation(null); setDetailsOpen(false); inventory.refresh();
    window.dispatchEvent(new Event("inventory-changed"));
  };

  return <div className={styles.page}>
    <Text as="p" className={styles.description}>Physical stock by van and product. Available quantities come from the stock ledger and exclude reservations, broken units and unverified serialised equipment.</Text>
    {(inventory.locations ?? []).some((location) => location.kind === "HUB") && <MessageBar intent="info"><MessageBarBody><MessageBarTitle>Warehouse shelf stock is not counted here.</MessageBarTitle>The warehouse is available as a receipt source. This screen shows counted van stock; receipts add stock to a van and update the stock ledger.</MessageBarBody></MessageBar>}
    {inventory.problem && <MessageBar intent="error" layout="multiline"><MessageBarBody><MessageBarTitle>Inventory could not be loaded</MessageBarTitle>{inventory.problem}</MessageBarBody><MessageBarActions><Button onClick={inventory.refresh}>Retry</Button></MessageBarActions></MessageBar>}
    {productsError && <MessageBar intent="error"><MessageBarBody>{productsError} <Button onClick={() => inventory.refresh()}>Retry</Button></MessageBarBody></MessageBar>}
    <div className={styles.toolbar}>
      <Field label="Search inventory"><Input ref={searchRef} value={query} onChange={(_, data) => setQuery(data.value)} placeholder="Product, SKU or location" disabled={!allRows.length} /></Field>
      <Field label="Location"><Select value={locationFilter} onChange={(_, data) => setLocationFilter(data.value)}><option value="ALL">All locations</option>{(inventory.locations ?? []).map((location) => <option key={location.locationId} value={location.locationId}>{location.kind === "HUB" ? `${location.locationName} · uncounted warehouse` : location.locationName}</option>)}</Select></Field>
      <Field label="Condition"><Select value={conditionFilter} onChange={(_, data) => setConditionFilter(data.value)}><option value="ALL">Working and broken</option><option value="WORKING">Working stock</option><option value="BROKEN">Broken stock</option></Select></Field>
      <Button {...restore} ref={addRef} appearance="primary" icon={<AddRegular />} disabled={!products.length || !inventory.locations?.length} onClick={() => { setSelected(null); setOperation("receive"); }}>Add stock</Button>
      <Button onClick={inventory.refresh}>Refresh</Button>
    </div>
    <section ref={surfaceRef} tabIndex={-1} className={styles.surface} aria-label="Inventory">
      <Text as="h2" weight="semibold" className={styles.tableHeading}>Inventory by location and product</Text>
      {inventory.loading && !inventory.locations ? <Spinner label="Loading inventory" /> : inventory.problem ? <div style={{ padding: 24 }}><Button onClick={() => { inventory.refresh(); surfaceRef.current?.focus(); }}>Retry inventory</Button></div> : visibleRows.length ? <><Text size={200} style={{ paddingInline: 20 }}>{visibleRows.length} of {allRows.length} stock lines</Text><InventoryTable rows={visibleRows} onSelect={(row) => { setSelected(row); setDetailsOpen(true); }} onSort={setSort} sort={{ key: sortKey, direction }} /></> : allRows.length ? <div style={{ padding: 24 }}><Text>{(inventory.locations ?? []).find((location) => location.locationId === locationFilter)?.kind === "HUB" ? "Warehouse shelf balances are not tracked in this milestone." : "No stock lines match these filters."}</Text><Button onClick={() => { setQuery(""); setLocationFilter("ALL"); setConditionFilter("ALL"); searchRef.current?.focus(); }}>Clear filters</Button></div> : inventory.locations?.some((location) => location.kind === "VAN") ? <div style={{ padding: 24 }}><Text>No stock balances recorded for the current vans.</Text></div> : <div style={{ padding: 24 }}><Text>No van locations are configured yet.</Text></div>}
    </section>
    <InventoryDetails row={selected} open={detailsOpen} revision={inventory.revision} onClose={() => setDetailsOpen(false)} onOperation={(next) => { setDetailsOpen(false); setOperation(next); }} />
    <InventoryOperationSheet key={`${operation ?? "closed"}:${selected?.locationId ?? "new"}:${selected?.line.productId ?? "new"}`} operation={operation} row={selected} locations={inventory.locations ?? []} products={products} onClose={() => setOperation(null)} onSaved={afterSave} />
  </div>;
}
