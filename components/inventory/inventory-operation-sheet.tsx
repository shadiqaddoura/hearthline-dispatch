"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Button, Field, Input, makeStyles, MessageBar, MessageBarBody, Select, Spinner, Textarea, tokens } from "@fluentui/react-components";
import type { ProductDto } from "@/lib/contracts/products";
import type { InventoryLocationDto } from "@/lib/contracts/inventory";
import type { StockCondition } from "@/generated/prisma/enums";
import { inventoryApi } from "@/lib/api/inventory";
import { FleetSheet } from "@/components/fleet/fleet-sheet";
import { FleetConfirmation } from "@/components/fleet/fleet-confirmation";
import type { InventoryOperation } from "./inventory-details";
import type { InventoryRow } from "./inventory-table";

const TITLES: Record<InventoryOperation, string> = { receive: "Add stock", correct: "Correct count", verify: "Verify serials", transfer: "Transfer stock" };
const useStyles = makeStyles({
  sheet: {
    width: "min(560px, 100vw)", maxWidth: "100vw", minWidth: 0,
    boxSizing: "border-box", overflowX: "hidden",
  },
  body: {
    width: "100%", minWidth: 0, minHeight: 0, boxSizing: "border-box",
    overflowX: "hidden", overflowY: "auto",
  },
  form: {
    display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: tokens.spacingVerticalM,
    width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box",
    "& > *": { width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" },
    "& input, & textarea, & select": { minWidth: 0, maxWidth: "100%", boxSizing: "border-box" },
  },
  message: {
    minWidth: 0, maxWidth: "100%", overflowWrap: "anywhere", wordBreak: "break-word",
    "& *": { minWidth: 0, overflowWrap: "anywhere", wordBreak: "break-word" },
  },
  footer: {
    width: "100%", minWidth: 0, boxSizing: "border-box", justifyContent: "flex-end",
  },
});

export function InventoryOperationSheet({ operation, row, locations, products, onClose, onSaved }: {
  operation: InventoryOperation | null; row: InventoryRow | null; locations: InventoryLocationDto[]; products: ProductDto[];
  onClose: () => void; onSaved: () => void;
}) {
  const styles = useStyles();
  const active = operation !== null;
  const [productId, setProductId] = useState(row?.line.productId ?? "");
  const [locationId, setLocationId] = useState(row?.locationId ?? locations.find((location) => location.kind === "VAN")?.locationId ?? "");
  const [destinationId, setDestinationId] = useState("");
  const [condition, setCondition] = useState<StockCondition>("WORKING");
  const [quantity, setQuantity] = useState(operation === "correct" ? String(row?.line.working ?? 0) : "1");
  const [serials, setSerials] = useState("");
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const busy = useRef(false);
  const operationKey = useRef<string | null>(null);
  const product = products.find((item) => item.id === productId) ?? null;
  const otherLocations = useMemo(() => locations.filter((location) => location.locationId !== locationId), [locations, locationId]);
  const close = () => {
    if (pending) return;
    if (dirty) { setDiscard(true); return; }
    onClose();
  };
  const discardChanges = () => {
    setProductId(row?.line.productId ?? "");
    setLocationId(row?.locationId ?? locations.find((location) => location.kind === "VAN")?.locationId ?? "");
    setDestinationId("");
    setCondition("WORKING");
    setQuantity(operation === "correct" ? String(row?.line.working ?? 0) : "1");
    setSerials("");
    setActor("");
    setNote("");
    setProblem("");
    setDirty(false);
    setDiscard(false);
    onClose();
  };
  const update = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setDirty(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!operation || busy.current) return;
    setProblem("");
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < (operation === "correct" ? 0 : 1)) { setProblem(operation === "correct" ? "Enter a whole number of 0 or more." : "Enter a positive whole quantity."); return; }
    if (!actor.trim()) { setProblem("Enter who is recording this operation."); return; }
    const serialList = serials.split(/[\n,;]/).map((value) => value.trim()).filter(Boolean);
    const duplicateSerials = [...new Set(serialList.filter((serial, index) => serialList.indexOf(serial) !== index))];
    if (duplicateSerials.length) { setProblem(`Serial listed more than once: ${duplicateSerials.join(", ")}`); return; }
    if ((operation === "receive" || operation === "correct") && !note.trim()) { setProblem("Enter a reason or reference."); return; }
    if (product?.serialised && serialList.length > 0 && serialList.length !== count && operation === "transfer") { setProblem("Transfers of serialised stock need one selected serial per unit, or no serials to choose units automatically."); return; }
    busy.current = true; setPending(true);
    try {
      if (operation === "receive") {
        operationKey.current ??= crypto.randomUUID();
        await inventoryApi.receive({ operationKey: operationKey.current, locationId, productId, quantity: count, condition, serials: serialList.length ? serialList : undefined, performedBy: actor.trim(), note: note.trim() });
      } else if (operation === "correct" && row) {
        await inventoryApi.correct({ locationId: row.locationId, productId: row.line.productId, condition, countedQuantity: count, correctedBy: actor.trim(), reason: note.trim() });
      } else if (operation === "verify" && row) {
        if (serialList.length !== 1) { setProblem("Enter exactly one serial number to verify."); return; }
        await inventoryApi.verify({ locationId: row.locationId, productId: row.line.productId, serialNumber: serialList[0], verifiedBy: actor.trim() });
      } else if (operation === "transfer" && row) {
        if (!destinationId) { setProblem("Choose a destination location."); return; }
        await inventoryApi.transfer({ fromLocationId: row.locationId, toLocationId: destinationId, productId: row.line.productId, quantity: count, condition, serials: serialList.length ? serialList : undefined, performedBy: actor.trim(), note: note.trim() });
      }
      setDirty(false); onSaved();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The operation could not be confirmed. Refresh inventory before retrying.");
    } finally { busy.current = false; setPending(false); }
  };
  const markDirty = () => setDirty(true);
  const showProduct = operation === "receive";
  const showLocation = operation === "receive";
  const showSerials = operation === "receive" || operation === "verify" || operation === "transfer";
  return <>
    <FleetSheet title={operation ? TITLES[operation] : "Inventory operation"} open={active} onClose={close} busy={pending}
    className={styles.sheet} bodyClassName={styles.body} footerClassName={styles.footer}
    footer={<><Button onClick={close} disabled={pending}>Cancel</Button><Button appearance="primary" type="submit" form="inventory-operation-form" disabled={pending || !operation}>{pending ? <Spinner size="tiny" /> : TITLES[operation ?? "receive"]}</Button></>}>
    {operation && <form id="inventory-operation-form" className={styles.form} onSubmit={(event) => void submit(event)}>
      {problem && <MessageBar className={styles.message} intent="error"><MessageBarBody>{problem}</MessageBarBody></MessageBar>}
      {showProduct && <Field label="Product" required><Select value={productId} onChange={(_, data) => { setProductId(data.value); markDirty(); }}><option value="">Choose a product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</Select></Field>}
      {showLocation && <Field label="Receive at" required><Select value={locationId} onChange={(_, data) => { setLocationId(data.value); markDirty(); }}><option value="">Choose a van</option>{locations.filter((location) => location.kind === "VAN").map((location) => <option key={location.locationId} value={location.locationId}>{location.locationName}</option>)}</Select></Field>}
      {operation === "transfer" && row && <><Field label="From" ><Input value={row.locationName} readOnly /></Field><Field label="To location" required><Select value={destinationId} onChange={(_, data) => { setDestinationId(data.value); markDirty(); }}><option value="">Choose a destination</option>{otherLocations.map((location) => <option key={location.locationId} value={location.locationId}>{location.locationName}</option>)}</Select></Field></>}
      {operation === "verify" && row && <Field label="Product and location"><Input value={`${row.line.name} · ${row.locationName}`} readOnly /></Field>}
      {operation !== "receive" && row && <Field label="Product"><Input value={`${row.line.name} · ${row.line.sku}`} readOnly /></Field>}
      {operation !== "verify" && <Field label="Condition" required><Select value={condition} onChange={(_, data) => update(setCondition)(data.value as StockCondition)}><option value="WORKING">Working</option><option value="BROKEN">Broken</option></Select></Field>}
      {operation !== "verify" && <Field label={operation === "correct" ? "Resulting physical count" : "Quantity"} required>
        <Input type="number" min={operation === "correct" ? 0 : 1} step={1} value={quantity} onChange={(_, data) => update(setQuantity)(data.value)} />
      </Field>}
      {showSerials && <Field label={operation === "verify" ? "Serial number" : "Serial numbers (optional)"} hint={operation === "verify" ? "Records the serial for one unit awaiting verification." : product?.serialised || row?.line.serialised ? "Enter one serial per unit, separated by commas or new lines. Leave blank for units without serial details." : "This product is not serial tracked."}>
        <Textarea value={serials} onChange={(_, data) => update(setSerials)(data.value)} disabled={operation !== "verify" && !product?.serialised && !row?.line.serialised} resize="vertical" />
      </Field>}
      {operation !== "verify" && <Field label="Reason or reference" required={operation === "receive" || operation === "correct"} hint={operation === "transfer" ? "Optional" : undefined}><Textarea value={note} onChange={(_, data) => update(setNote)(data.value)} /></Field>}
      <Field label="Recorded by" required><Input value={actor} onChange={(_, data) => update(setActor)(data.value)} autoComplete="name" /></Field>
      {operation === "receive" && !product?.serialised && <MessageBar className={styles.message} intent="info"><MessageBarBody>Only existing catalogue products can receive stock. Product setup stays in Products Catalog.</MessageBarBody></MessageBar>}
      {operation === "correct" && <MessageBar className={styles.message} intent="warning"><MessageBarBody>A count records what is physically present. Units with known serials cannot be silently written off. Imported negative balances are reconciled against the physical count, without creating units for the accounting difference. If the count is below known serialised units, use the separate missing-device reporting and recovery workflow; it is not implemented in Inventory.</MessageBarBody></MessageBar>}
    </form>}
    </FleetSheet>
    <FleetConfirmation open={discard} title="Discard unsaved changes?" onClose={() => setDiscard(false)} onConfirm={discardChanges} action="Discard changes" cancelLabel="Keep editing">
      Your changes to this inventory operation will be lost.
    </FleetConfirmation>
  </>;
}
