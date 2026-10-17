"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Field, Input, MessageBar, MessageBarActions, MessageBarBody, MessageBarTitle, Select, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, makeStyles, tokens, useRestoreFocusTarget } from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import type { ProductDto } from "@/lib/contracts/products";
import { fetchProducts } from "@/lib/api/products";
import { InventoryTable, type InventoryEmptyState, type InventoryRow } from "./inventory-table";
import { InventoryDetails, type InventoryOperation } from "./inventory-details";
import { InventoryOperationSheet } from "./inventory-operation-sheet";
import { WarehouseForm } from "./warehouse-form";
import { InventoryLocationDelete } from "./inventory-location-delete";
import { useInventory } from "./use-inventory";

const stylesHook = makeStyles({
  page: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  description: { color: tokens.colorNeutralForeground2, maxWidth: "760px" },
  toolbar: { display: "flex", flexWrap: "wrap", alignItems: "end", gap: tokens.spacingHorizontalM },
  surface: { backgroundColor: tokens.colorNeutralBackground1, borderRadius: tokens.borderRadiusLarge, boxShadow: tokens.shadow2, overflow: "hidden" },
  locationsContent: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalM },
  locationNameCell: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: tokens.spacingHorizontalS },
  createWarehouse: { alignSelf: "flex-start" },
});

type SortKey = "product" | "working" | "available";

export function InventoryView() {
  const styles = stylesHook();
  const inventory = useInventory();
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("ALL");
  const [conditionFilter, setConditionFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("product");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<InventoryRow | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [operation, setOperation] = useState<InventoryOperation | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [productsError, setProductsError] = useState("");
  const [locationNotice, setLocationNotice] = useState("");
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
    locationId: location.locationId, locationName: location.locationName, kind: location.kind, line,
  }))), [inventory.locations]);
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allRows.filter((row) => {
      const matchesQuery = !q || [row.locationName, row.line.name, row.line.sku, row.line.baseUnit].some((value) => value.toLowerCase().includes(q));
      const matchesLocation = locationFilter === "ALL" || row.locationId === locationFilter;
      const matchesCondition = conditionFilter === "ALL" || (conditionFilter === "WORKING" ? row.line.working !== 0 : row.line.broken !== 0);
      return matchesQuery && matchesLocation && matchesCondition;
    });
  }, [allRows, query, locationFilter, conditionFilter]);
  const hasVanLocations = (inventory.locations ?? []).length > 0;
  const warehouse = inventory.locations?.find((location) => location.kind === "HUB");
  const hasRecordedInventory = allRows.some(({ line }) => line.working !== 0 || line.broken !== 0 || line.reserved !== 0);
  const emptyState: InventoryEmptyState = !hasVanLocations ? "locations" : !hasRecordedInventory ? "recorded" : "matching";
  const setSort = (key: SortKey) => {
    if (sortKey === key) setDirection((current) => current === "asc" ? "desc" : "asc");
    else { setSortKey(key); setDirection("asc"); }
  };
  const afterSave = () => {
    setOperation(null); setDetailsOpen(false); inventory.refresh();
    window.dispatchEvent(new Event("inventory-changed"));
  };

  return <div className={styles.page}>
    <Text as="p" className={styles.description}>Physical stock by warehouse, van and product. Available quantities come from the stock ledger and exclude reservations, broken units and unverified serialised equipment.</Text>
    <section className={styles.surface} aria-label="Locations" style={{ padding: 20 }}>
      <Text as="h2" weight="semibold">Inventory locations</Text>
      <div className={styles.locationsContent}>
        {locationNotice && <MessageBar intent="success"><MessageBarBody>{locationNotice}</MessageBarBody></MessageBar>}
        <div style={{ overflowX: "auto" }}>
          <Table aria-label="Inventory locations">
            <TableHeader><TableRow><TableHeaderCell>Location</TableHeaderCell><TableHeaderCell>Type</TableHeaderCell><TableHeaderCell>Stock tracking</TableHeaderCell></TableRow></TableHeader>
            <TableBody>{(inventory.locations ?? []).map((location) => <TableRow key={location.locationId}>
              <TableCell><div className={styles.locationNameCell}><span>{location.locationName}</span><InventoryLocationDelete location={location} onRefresh={inventory.refresh} onDeleted={(name) => { setLocationNotice(`${name} deleted.`); inventory.refresh(); window.dispatchEvent(new Event("inventory-changed")); window.dispatchEvent(new Event("fleet-changed")); }} /></div></TableCell>
              <TableCell>{location.kind === "HUB" ? "Warehouse" : "Van"}</TableCell>
              <TableCell>{location.kind === "HUB" && !location.inventoryTracked ? "Awaiting physical opening count" : "Stock tracked"}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </div>
        <Button {...restore} className={styles.createWarehouse} appearance="primary" disabled={inventory.loading || Boolean(inventory.problem) || Boolean(warehouse?.inventoryTracked)} onClick={() => setWarehouseOpen(true)}>Create warehouse</Button>
        {warehouse?.inventoryTracked && <MessageBar intent="success"><MessageBarBody>Warehouse configured. Use its stock details for corrections, transfers and serial verification.</MessageBarBody></MessageBar>}
      </div>
    </section>
    {inventory.problem && <MessageBar intent="error" layout="multiline"><MessageBarBody><MessageBarTitle>Inventory could not be loaded</MessageBarTitle>{inventory.problem}</MessageBarBody><MessageBarActions><Button onClick={inventory.refresh}>Retry</Button></MessageBarActions></MessageBar>}
    {productsError && <MessageBar intent="error"><MessageBarBody>{productsError} <Button onClick={() => inventory.refresh()}>Retry</Button></MessageBarBody></MessageBar>}
    <div className={styles.toolbar}>
      <Field label="Search inventory"><Input ref={searchRef} value={query} onChange={(_, data) => setQuery(data.value)} placeholder="Product, SKU or location" disabled={!allRows.length} /></Field>
      <Field label="Location"><Select value={locationFilter} onChange={(_, data) => setLocationFilter(data.value)}><option value="ALL">All locations</option>{(inventory.locations ?? []).map((location) => <option key={location.locationId} value={location.locationId}>{location.kind === "HUB" ? `${location.locationName} · warehouse` : `${location.locationName} · van`}</option>)}</Select></Field>
      <Field label="Condition"><Select value={conditionFilter} onChange={(_, data) => setConditionFilter(data.value)}><option value="ALL">Working and broken</option><option value="WORKING">Working stock</option><option value="BROKEN">Broken stock</option></Select></Field>
      <Button {...restore} ref={addRef} appearance="primary" icon={<AddRegular />} disabled={!products.length || !inventory.locations?.length} onClick={() => { setSelected(null); setOperation("receive"); }}>Add stock</Button>
      <Button onClick={inventory.refresh}>Refresh</Button>
    </div>
    <section ref={surfaceRef} tabIndex={-1} className={styles.surface} aria-label="Inventory">
      {inventory.loading && !inventory.locations ? <Spinner label="Loading inventory" /> : inventory.problem ? <div style={{ padding: 24 }}><Button onClick={() => { inventory.refresh(); surfaceRef.current?.focus(); }}>Retry inventory</Button></div> : <InventoryTable rows={visibleRows} emptyState={emptyState} onClearFilters={() => { setQuery(""); setLocationFilter("ALL"); setConditionFilter("ALL"); searchRef.current?.focus(); }} onSelect={(row) => { setSelected(row); setDetailsOpen(true); }} onSort={setSort} sort={{ key: sortKey, direction }} />}
    </section>
    {warehouseOpen && <WarehouseForm products={products} existingName={warehouse?.locationName} onClose={() => setWarehouseOpen(false)} onSaved={() => { setWarehouseOpen(false); afterSave(); }} />}
    <InventoryDetails row={selected} open={detailsOpen} revision={inventory.revision} onClose={() => setDetailsOpen(false)} onOperation={(next) => { setDetailsOpen(false); setOperation(next); }} />
    <InventoryOperationSheet key={`${operation ?? "closed"}:${selected?.locationId ?? "new"}:${selected?.line.productId ?? "new"}`} operation={operation} row={selected} locations={inventory.locations ?? []} products={products} onClose={() => setOperation(null)} onSaved={afterSave} />
  </div>;
}
