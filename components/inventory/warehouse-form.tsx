"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button, Checkbox, Field, Input, MessageBar, MessageBarBody, Spinner, Text, Textarea } from "@fluentui/react-components";
import { FleetSheet } from "@/components/fleet/fleet-sheet";
import type { ProductDto } from "@/lib/contracts/products";
import { createWarehouseRequest } from "@/lib/contracts/inventory";
import { inventoryApi } from "@/lib/api/inventory";

export function WarehouseForm({ products, existingName, onClose, onSaved }: {
  products: ProductDto[]; existingName?: string; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(existingName ?? "");
  const [actor, setActor] = useState("");
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState<Record<string, { quantity: string; brokenQuantity: string }>>({});
  const [problem, setProblem] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const close = () => { if (!busy.current) onClose(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    const parsed = createWarehouseRequest.safeParse({ name, performedBy: actor, note,
      openingStock: Object.entries(counts).flatMap(([productId, count]) => [
        { productId, quantity: count.quantity.trim() ? Number(count.quantity) : NaN, condition: "WORKING" },
        { productId, quantity: count.brokenQuantity.trim() ? Number(count.brokenQuantity) : NaN, condition: "BROKEN" },
      ]),
    });
    if (!parsed.success) { setProblem(parsed.error.issues.map((issue) => issue.message).join(". ")); return; }
    busy.current = true; setPending(true); setProblem("");
    try { await inventoryApi.createWarehouse(parsed.data); onSaved(); }
    catch (error) { setProblem(error instanceof Error ? error.message : "Warehouse creation could not be confirmed. Refresh inventory before retrying."); }
    finally { busy.current = false; setPending(false); }
  };
  return <FleetSheet title="Create warehouse" open onClose={close} busy={pending} wide footer={<>
    <Button disabled={pending} onClick={close}>Cancel</Button>
    <Button appearance="primary" type="submit" form="warehouse-form" disabled={pending}>{pending ? <Spinner size="tiny" /> : "Create warehouse"}</Button>
  </>}>
    <form id="warehouse-form" onSubmit={(event) => void submit(event)} style={{ display: "grid", gap: 16 }}>
      {problem && <MessageBar intent="error"><MessageBarBody>{problem}</MessageBarBody></MessageBar>}
      <MessageBar intent="info"><MessageBarBody>{existingName ? "Setup reuses the existing warehouse location and preserves its movement history. " : "The app supports one warehouse. "}Enter today&apos;s physical counts. Unselected products receive no stock. After setup, collections reduce warehouse stock. Use Correct count for later changes.</MessageBarBody></MessageBar>
      <Field label="Warehouse name" required><Input required maxLength={120} disabled={pending} value={name} onChange={(_, data) => setName(data.value)} /></Field>
      <Text as="h3" weight="semibold">Opening stock from Products Catalog</Text>
      <Text>Quantities use each product&apos;s base unit. Serialised units without recorded serials will await verification.</Text>
      {!products.length && <Text>No products are available. You can create the warehouse without stock.</Text>}
      {products.map((product) => <div key={product.id} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
        <Checkbox disabled={pending} label={`${product.name} · ${product.sku}`} checked={Boolean(counts[product.id])} onChange={(_, data) => setCounts((previous) => {
          const next = { ...previous }; if (data.checked) next[product.id] = { quantity: "", brokenQuantity: "0" }; else delete next[product.id]; return next;
        })} />
        {counts[product.id] && <>
          <Field label={`Working physical quantity (${product.baseUnit})`} required><Input aria-label={`${product.sku} physical quantity`} type="number" required min={0} max={100000} step={1} disabled={pending} value={counts[product.id].quantity} onChange={(_, data) => setCounts((previous) => ({ ...previous, [product.id]: { ...previous[product.id], quantity: data.value } }))} /></Field>
          <Field label={`Broken physical quantity (${product.baseUnit})`} required><Input aria-label={`${product.sku} broken quantity`} type="number" required min={0} max={100000} step={1} disabled={pending} value={counts[product.id].brokenQuantity} onChange={(_, data) => setCounts((previous) => ({ ...previous, [product.id]: { ...previous[product.id], brokenQuantity: data.value } }))} /></Field>
        </>}
      </div>)}
      <Field label="Recorded by" required><Input required disabled={pending} value={actor} onChange={(_, data) => setActor(data.value)} /></Field>
      <Field label="Opening count reason or reference" required><Textarea required minLength={3} maxLength={500} disabled={pending} value={note} onChange={(_, data) => setNote(data.value)} /></Field>
    </form>
  </FleetSheet>;
}
