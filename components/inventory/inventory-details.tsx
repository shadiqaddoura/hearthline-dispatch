"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Input,
  makeStyles,
  mergeClasses,
  MessageBar,
  MessageBarBody,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  tokens,
} from "@fluentui/react-components";
import { CheckmarkRegular } from "@fluentui/react-icons";
import type { EquipmentUnitDto, InventoryDetailDto } from "@/lib/contracts/inventory";
import type { InventoryRow } from "./inventory-table";
import { inventoryApi } from "@/lib/api/inventory";
import { FleetSheet } from "@/components/fleet/fleet-sheet";

export type InventoryOperation = "receive" | "correct" | "verify" | "transfer";

const useStyles = makeStyles({
  section: { display: "grid", gap: tokens.spacingVerticalM, minWidth: 0 },
  scroller: { width: "100%", maxWidth: "100%", overflowX: "auto", overscrollBehaviorX: "contain" },
  summaryTable: { width: "100%", minWidth: "680px", tableLayout: "fixed" },
  equipmentTable: { width: "100%", minWidth: "940px", tableLayout: "fixed" },
  reservationTable: { width: "100%", minWidth: "620px", tableLayout: "fixed" },
  movementTable: { width: "100%", minWidth: "1057px", tableLayout: "fixed" },
  headerCell: {
    paddingInline: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalS,
    verticalAlign: "bottom",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  cell: {
    paddingInline: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalS,
    verticalAlign: "top",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  numericHeader: { textAlign: "right" },
  numericCell: { textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" },
  timestamp: { display: "flex", flexDirection: "column", whiteSpace: "nowrap" },
  mutedTime: { color: tokens.colorNeutralForeground3 },
  verifyInput: { width: "100%", minWidth: 0, maxWidth: "100%" },
  recordedByInput: { width: "100%", minWidth: 0, maxWidth: "140px" },
  verifyError: { display: "block", color: tokens.colorPaletteRedForeground1, overflowWrap: "anywhere" },
  verifyAction: { color: tokens.colorPaletteGreenForeground1 },
});

export function InventoryDetails({ row, open, revision, onClose, onOperation, onVerified }: {
  row: InventoryRow | null;
  open: boolean;
  revision: number;
  onClose: () => void;
  onOperation: (operation: InventoryOperation) => void;
  onVerified: () => void;
}) {
  const styles = useStyles();
  const [detail, setDetail] = useState<InventoryDetailDto | null>(null);
  const [problem, setProblem] = useState("");
  const [verificationDrafts, setVerificationDrafts] = useState<Record<string, { serialNumber: string; verifiedBy: string }>>({});
  const [verificationErrors, setVerificationErrors] = useState<Record<string, string>>({});
  const [verifyingUnitId, setVerifyingUnitId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const locationId = row?.locationId;
  const productId = row?.line.productId;

  useEffect(() => {
    if (!open || !locationId || !productId) return;
    const controller = new AbortController();
    inventoryApi.detail(locationId, productId, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) {
          setDetail(value);
          setProblem("");
        }
      },
      (error) => {
        if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : "Inventory details could not be loaded.");
      },
    );
    return () => controller.abort();
  }, [open, locationId, productId, revision, attempt]);

  const updateVerificationDraft = (unitId: string, field: "serialNumber" | "verifiedBy", value: string) => {
    setVerificationDrafts((current) => ({
      ...current,
      [unitId]: { serialNumber: current[unitId]?.serialNumber ?? "", verifiedBy: current[unitId]?.verifiedBy ?? "", [field]: value },
    }));
    setVerificationErrors((current) => ({ ...current, [unitId]: "" }));
  };
  const verifyUnit = async (unit: EquipmentUnitDto) => {
    if (!row || verifyingUnitId) return;
    const draft = verificationDrafts[unit.id] ?? { serialNumber: "", verifiedBy: "" };
    const serialNumber = draft.serialNumber.trim();
    const verifiedBy = draft.verifiedBy.trim();
    if (!serialNumber || !verifiedBy) {
      setVerificationErrors((current) => ({ ...current, [unit.id]: !serialNumber ? "Enter a serial number." : "Enter who recorded this verification." }));
      return;
    }
    setVerifyingUnitId(unit.id);
    setVerificationErrors((current) => ({ ...current, [unit.id]: "" }));
    try {
      const verified = await inventoryApi.verify({ locationId: row.locationId, productId: row.line.productId, unitId: unit.id, serialNumber, verifiedBy });
      setDetail((current) => current ? { ...current, units: current.units.map((currentUnit) => currentUnit.id === unit.id ? verified : currentUnit) } : current);
      setVerificationDrafts((current) => { const next = { ...current }; delete next[unit.id]; return next; });
      onVerified();
    } catch (error) {
      setVerificationErrors((current) => ({ ...current, [unit.id]: error instanceof Error ? error.message : "Serial verification failed. Retry this unit." }));
    } finally {
      setVerifyingUnitId(null);
    }
  };

  return (
    <FleetSheet
      title={row ? `${row.line.name} · ${row.locationName}` : "Inventory details"}
      open={open}
      onClose={onClose}
      wide
      footer={
        <>
          {row?.kind !== "HUB" && <Button appearance="primary" onClick={() => onOperation("receive")}>Add stock</Button>}
          <Button onClick={() => onOperation("correct")}>Correct count</Button>
          <Button onClick={() => onOperation("transfer")}>Transfer stock</Button>
        </>
      }
    >
      {row && (
        <>
          <Text size={200}>{row.line.sku} · {row.line.baseUnit}{row.line.serialised ? " · Serialised" : ""}</Text>
          <section aria-labelledby="inventory-summary-heading" className={styles.section}>
            <Text as="h3" id="inventory-summary-heading" weight="semibold">Stock summary</Text>
            <div className={styles.scroller} role="region" aria-label="Stock summary" tabIndex={0}>
              <Table className={styles.summaryTable} aria-label={`Stock summary for ${row.line.name} at ${row.locationName}`}>
                <colgroup>
                  <col style={{ width: "28%" }} /><col style={{ width: "16%" }} /><col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} /><col style={{ width: "24%" }} />
                </colgroup>
                <TableHeader><TableRow>
                  {["Working physical", "Reserved", "Available", "Broken", "Awaiting verification"].map((heading, index) => (
                    <TableHeaderCell key={heading} className={mergeClasses(styles.headerCell, index > 0 && styles.numericHeader)}>{heading}</TableHeaderCell>
                  ))}
                </TableRow></TableHeader>
                <TableBody><TableRow>
                  <TableCell className={styles.cell}>{row.line.working}</TableCell>
                  <TableCell className={mergeClasses(styles.cell, styles.numericCell)}>{row.line.reserved}</TableCell>
                  <TableCell className={mergeClasses(styles.cell, styles.numericCell)}>{row.line.available}</TableCell>
                  <TableCell className={mergeClasses(styles.cell, styles.numericCell)}>{row.line.broken}</TableCell>
                  <TableCell className={mergeClasses(styles.cell, styles.numericCell)}>{row.line.needsVerification ?? "—"}</TableCell>
                </TableRow></TableBody>
              </Table>
            </div>
            {row.line.working < 0 && <MessageBar intent="warning"><MessageBarBody>Imported negative count. Use Correct count after a physical reconciliation.</MessageBarBody></MessageBar>}
          </section>

          {problem ? (
            <MessageBar intent="error"><MessageBarBody>{problem} <Button onClick={() => setAttempt((n) => n + 1)}>Retry details</Button></MessageBarBody></MessageBar>
          ) : !detail ? (
            <Spinner label="Loading equipment, reservations and movements" />
          ) : (
            <>
              {row.line.serialised && (
                <section aria-labelledby="equipment-heading" className={styles.section}>
                  <Text as="h3" id="equipment-heading" weight="semibold">Equipment units</Text>
                  {detail.units.length ? (
                    <div className={styles.scroller} role="region" aria-label="Equipment units" tabIndex={0}>
                      <Table className={styles.equipmentTable} aria-label="Equipment units">
                        <colgroup>
                          <col style={{ width: "22%" }} /><col style={{ width: "18%" }} /><col style={{ width: "12%" }} />
                          <col style={{ width: "18%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} />
                        </colgroup>
                        <TableHeader><TableRow>{["Serial", "Verification", "Condition", "Recorded by", "Verified", "Action"].map((heading) => <TableHeaderCell key={heading} className={styles.headerCell}>{heading}</TableHeaderCell>)}</TableRow></TableHeader>
                        <TableBody>{detail.units.map((unit) => (
                          <TableRow key={unit.id}>
                            <TableCell className={styles.cell}>{unit.verification === "NEEDS_VERIFICATION" ? <Input className={styles.verifyInput} size="small" value={verificationDrafts[unit.id]?.serialNumber ?? ""} aria-label="Serial number for unit awaiting verification" aria-invalid={Boolean(verificationErrors[unit.id])} aria-describedby={verificationErrors[unit.id] ? `verification-error-${unit.id}` : undefined} disabled={verifyingUnitId !== null} onChange={(_, data) => updateVerificationDraft(unit.id, "serialNumber", data.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void verifyUnit(unit); } }} /> : unit.serialNumber ?? "—"}</TableCell>
                            <TableCell className={styles.cell}>{unit.verification === "VERIFIED" ? "Verified" : "Needs verification"}</TableCell>
                            <TableCell className={styles.cell}>{unit.condition}</TableCell>
                            <TableCell className={styles.cell}>{unit.verification === "NEEDS_VERIFICATION" ? <Input className={styles.recordedByInput} size="small" value={verificationDrafts[unit.id]?.verifiedBy ?? ""} aria-label="Recorded by for unit awaiting verification" aria-invalid={Boolean(verificationErrors[unit.id])} aria-describedby={verificationErrors[unit.id] ? `verification-error-${unit.id}` : undefined} disabled={verifyingUnitId !== null} onChange={(_, data) => updateVerificationDraft(unit.id, "verifiedBy", data.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void verifyUnit(unit); } }} /> : unit.verifiedBy ?? "—"}</TableCell>
                            <TableCell className={styles.cell}>{unit.verifiedAt ? <Timestamp value={unit.verifiedAt} className={styles.timestamp} mutedClassName={styles.mutedTime} /> : "—"}</TableCell>
                            <TableCell className={styles.cell}>{unit.verification === "NEEDS_VERIFICATION" ? <>
                              <Button size="small" appearance="subtle" className={styles.verifyAction} icon={verifyingUnitId === unit.id ? <Spinner size="tiny" label="Saving verification" /> : <CheckmarkRegular />} aria-label="Verify serial" title="Verify serial" disabled={verifyingUnitId !== null} onClick={() => void verifyUnit(unit)} />
                              {verificationErrors[unit.id] && <Text as="span" size={200} role="alert" id={`verification-error-${unit.id}`} className={styles.verifyError}>{verificationErrors[unit.id]}</Text>}
                            </> : "—"}</TableCell>
                          </TableRow>
                        ))}</TableBody>
                      </Table>
                    </div>
                  ) : <Text>No equipment units recorded.</Text>}
                </section>
              )}

              <section aria-labelledby="reservations-heading" className={styles.section}>
                <Text as="h3" id="reservations-heading" weight="semibold">Reservations</Text>
                {detail.reservations.length ? (
                  <div className={styles.scroller} role="region" aria-label="Reservations" tabIndex={0}>
                    <Table className={styles.reservationTable} aria-label="Reservations">
                      <colgroup><col style={{ width: "16%" }} /><col style={{ width: "42%" }} /><col style={{ width: "15%" }} /><col style={{ width: "27%" }} /></colgroup>
                      <TableHeader><TableRow>{["Job", "Customer / branch", "Quantity", "Status"].map((heading) => <TableHeaderCell key={heading} className={styles.headerCell}>{heading}</TableHeaderCell>)}</TableRow></TableHeader>
                      <TableBody>{detail.reservations.map((reservation) => (
                        <TableRow key={reservation.id}>
                          <TableCell className={styles.cell}>{reservation.jobReference}</TableCell>
                          <TableCell className={styles.cell}>{reservation.customer} / {reservation.branch}</TableCell>
                            <TableCell className={mergeClasses(styles.cell, styles.numericCell)}>{reservation.quantity}</TableCell>
                          <TableCell className={styles.cell}>{reservation.status}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                ) : <Text>No reservations for this product at this location.</Text>}
              </section>

              <section aria-labelledby="movement-heading" className={styles.section}>
                <Text as="h3" id="movement-heading" weight="semibold">Movement history</Text>
                {detail.movements.length ? (
                  <div className={styles.scroller} role="region" aria-label="Movement history" tabIndex={0}>
                    <Table className={styles.movementTable} aria-label="Movement history">
                      <colgroup>
                        <col style={{ width: "140px" }} /><col style={{ width: "150px" }} /><col style={{ width: "92px" }} />
                        <col style={{ width: "115px" }} /><col style={{ width: "180px" }} /><col style={{ width: "240px" }} /><col style={{ width: "140px" }} />
                      </colgroup>
                      <TableHeader><TableRow>
                        {[
                          { label: "When" }, { label: "Operation" }, { label: "Quantity", numeric: true },
                          { label: "Condition" }, { label: "Serials" }, { label: "Reference / reason" }, { label: "By" },
                        ].map(({ label, numeric }) => <TableHeaderCell key={label} className={mergeClasses(styles.headerCell, numeric && styles.numericHeader)}>{label}</TableHeaderCell>)}
                      </TableRow></TableHeader>
                      <TableBody>{detail.movements.map((movement) => (
                        <TableRow key={movement.id}>
                          <TableCell className={styles.cell}><Timestamp value={movement.createdAt} className={styles.timestamp} mutedClassName={styles.mutedTime} /></TableCell>
                          <TableCell className={styles.cell}>{movement.type.replaceAll("_", " ")}</TableCell>
                          <TableCell className={mergeClasses(styles.cell, styles.numericCell)}>{movement.quantity}</TableCell>
                          <TableCell className={styles.cell}>{movement.condition}</TableCell>
                          <TableCell className={styles.cell}>{movement.serials.join(", ") || "—"}</TableCell>
                          <TableCell className={styles.cell}>{movement.note ?? movement.jobId ?? "—"}</TableCell>
                          <TableCell className={styles.cell}>{movement.performedBy}</TableCell>
                        </TableRow>
                      ))}</TableBody>
                    </Table>
                  </div>
                ) : <Text>No movements recorded.</Text>}
              </section>

              <MessageBar intent="info"><MessageBarBody>Inventory is an operational ledger. Recorded stock, equipment and history cannot be deleted. Use an audited correction with a reason.</MessageBarBody></MessageBar>
            </>
          )}
        </>
      )}
    </FleetSheet>
  );
}

function Timestamp({ value, className, mutedClassName }: { value: string | Date; className: string; mutedClassName: string }) {
  const date = new Date(value);
  return <time className={className} dateTime={date.toISOString()}>
    <span>{date.toLocaleDateString()}</span>
    <span className={mutedClassName}>{date.toLocaleTimeString()}</span>
  </time>;
}
