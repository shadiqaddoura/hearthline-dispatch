"use client";

import { useEffect, useState } from "react";
import { Button, MessageBar, MessageBarBody, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text } from "@fluentui/react-components";
import type { InventoryDetailDto, StockLineDto } from "@/lib/contracts/inventory";
import type { InventoryRow } from "./inventory-table";
import { inventoryApi } from "@/lib/api/inventory";
import { FleetSheet } from "@/components/fleet/fleet-sheet";

export type InventoryOperation = "receive" | "correct" | "verify" | "transfer";

export function InventoryDetails({ row, open, revision, onClose, onOperation }: {
  row: InventoryRow | null; open: boolean; revision: number; onClose: () => void; onOperation: (operation: InventoryOperation) => void;
}) {
  const [detail, setDetail] = useState<InventoryDetailDto | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const locationId = row?.locationId;
  const productId = row?.line.productId;
  useEffect(() => {
    if (!open || !locationId || !productId) return;
    const controller = new AbortController();
    inventoryApi.detail(locationId, productId, controller.signal).then(
      (value) => { if (!controller.signal.aborted) { setDetail(value); setProblem(""); } },
      (error) => { if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : "Inventory details could not be loaded."); },
    );
    return () => controller.abort();
  }, [open, locationId, productId, revision, attempt]);
  const line: StockLineDto | null = row?.line ?? null;
  return <FleetSheet
    title={row ? `${row.line.name} · ${row.locationName}` : "Inventory details"}
    open={open}
    onClose={onClose}
    footer={<>
      <Button appearance="primary" onClick={() => onOperation("receive")}>Add stock</Button>
      <Button onClick={() => onOperation("correct")}>Correct count</Button>
      {line?.serialised && <Button onClick={() => onOperation("verify")}>Verify serials</Button>}
      <Button onClick={() => onOperation("transfer")}>Transfer stock</Button>
    </>}
  >
    {row && <>
      <Text size={200}>{row.line.sku} · {row.line.baseUnit}{row.line.serialised ? " · Serialised" : ""}</Text>
      <section aria-labelledby="inventory-summary-heading" style={{ display: "grid", gap: 12 }}><Text as="h3" id="inventory-summary-heading" weight="semibold">Stock summary</Text>
        <div style={{ overflowX: "auto" }}><Table aria-label={`Stock summary for ${row.line.name} at ${row.locationName}`}><TableHeader><TableRow>{["Working physical", "Reserved", "Available", "Broken", "Awaiting verification"].map((h) => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody><TableRow><TableCell>{row.line.working}</TableCell><TableCell>{row.line.reserved}</TableCell><TableCell>{row.line.available}</TableCell><TableCell>{row.line.broken}</TableCell><TableCell>{row.line.needsVerification ?? "—"}</TableCell></TableRow></TableBody></Table></div>
        {row.line.working < 0 && <MessageBar intent="warning"><MessageBarBody>Imported negative count. Use Correct count after a physical reconciliation.</MessageBarBody></MessageBar>}
      </section>
      {problem ? <MessageBar intent="error"><MessageBarBody>{problem} <Button onClick={() => setAttempt((n) => n + 1)}>Retry details</Button></MessageBarBody></MessageBar>
        : !detail ? <Spinner label="Loading equipment, reservations and movements" /> : <>
          {row.line.serialised && <section aria-labelledby="equipment-heading" style={{ display: "grid", gap: 8 }}><Text as="h3" id="equipment-heading" weight="semibold">Equipment units</Text>{detail.units.length ? <div role="region" aria-label="Equipment units" tabIndex={0} style={{ overflowX: "auto" }}><Table aria-label="Equipment units"><TableHeader><TableRow>{["Serial", "Verification", "Condition", "Recorded by", "Verified"].map((h) => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{detail.units.map((unit) => <TableRow key={unit.id}><TableCell>{unit.serialNumber ?? "Not recorded"}</TableCell><TableCell>{unit.verification === "VERIFIED" ? "Verified" : "Needs verification"}</TableCell><TableCell>{unit.condition}</TableCell><TableCell>{unit.verifiedBy ?? "—"}</TableCell><TableCell>{unit.verifiedAt ? new Date(unit.verifiedAt).toLocaleString() : "—"}</TableCell></TableRow>)}</TableBody></Table></div> : <Text>No equipment units recorded.</Text>}</section>}
          <section aria-labelledby="reservations-heading" style={{ display: "grid", gap: 8 }}><Text as="h3" id="reservations-heading" weight="semibold">Reservations</Text>{detail.reservations.length ? <div role="region" aria-label="Reservations" tabIndex={0} style={{ overflowX: "auto" }}><Table aria-label="Reservations"><TableHeader><TableRow>{["Job", "Customer / branch", "Quantity", "Status"].map((h) => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{detail.reservations.map((reservation) => <TableRow key={reservation.id}><TableCell>{reservation.jobReference}</TableCell><TableCell>{reservation.customer} / {reservation.branch}</TableCell><TableCell>{reservation.quantity}</TableCell><TableCell>{reservation.status}</TableCell></TableRow>)}</TableBody></Table></div> : <Text>No reservations for this product at this location.</Text>}</section>
          <section aria-labelledby="movement-heading" style={{ display: "grid", gap: 8 }}><Text as="h3" id="movement-heading" weight="semibold">Movement history</Text>{detail.movements.length ? <div role="region" aria-label="Movement history" tabIndex={0} style={{ overflowX: "auto" }}><Table aria-label="Movement history"><TableHeader><TableRow>{["When", "Operation", "Quantity", "Condition", "Serials", "Reference / reason", "By"].map((h) => <TableHeaderCell key={h}>{h}</TableHeaderCell>)}</TableRow></TableHeader><TableBody>{detail.movements.map((movement) => <TableRow key={movement.id}><TableCell>{new Date(movement.createdAt).toLocaleString()}</TableCell><TableCell>{movement.type.replaceAll("_", " ")}</TableCell><TableCell>{movement.quantity}</TableCell><TableCell>{movement.condition}</TableCell><TableCell>{movement.serials.join(", ") || "—"}</TableCell><TableCell>{movement.note ?? movement.jobId ?? "—"}</TableCell><TableCell>{movement.performedBy}</TableCell></TableRow>)}</TableBody></Table></div> : <Text>No movements recorded.</Text>}</section>
          <MessageBar intent="info"><MessageBarBody>Inventory is an operational ledger. Recorded stock, equipment and history cannot be deleted. Use an audited correction with a reason.</MessageBarBody></MessageBar>
        </>}
    </>}
  </FleetSheet>;
}
