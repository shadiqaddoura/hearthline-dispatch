import "server-only";
import type { Tx } from "@/server/db/transaction";
import { moveStock, type MovementInput } from "@/server/modules/inventory/stock-ledger";
import { getHubLocation } from "@/server/modules/fleet/fleet.repository";
import { fromIsoDate } from "@/lib/dates";
import type { RowRef } from "./issue-log";
import type { ImportPlan } from "./plan";
import type { StockBook } from "./read-workbook";

// Step 4 of the import: write the plan in one transaction. Balances are only written
// through the stock ledger, so every imported figure has a movement pointing at the
// source row it came from.



export interface Booking {
  jobId: string;
  reference: string;
  vanCode: string | null;
  scheduledFor: string | null;
  ref: RowRef;
}

export async function persistPlan(tx: Tx, plan: ImportPlan, book: StockBook, fileName: string, actor = "stock-book import") {
  const batch = await tx.importBatch.create({ data: { fileName, summary: {} } });

  // Every original row, verbatim, with its sheet and row number.
  const allRows = [...book.minLevels, ...book.vans, ...book.stock, ...book.jobs];
  await tx.importSourceRow.createMany({
    data: allRows.map((row) => ({ batchId: batch.id, sheet: row.sheet, rowNumber: row.rowNumber, raw: row.cells })),
  });
  const savedRows = await tx.importSourceRow.findMany({ where: { batchId: batch.id }, select: { id: true, sheet: true, rowNumber: true } });
  const rowIds = new Map(savedRows.map((r) => [`${r.sheet}:${r.rowNumber}`, r.id]));
  const rowId = (ref: RowRef | null) => (ref ? rowIds.get(`${ref.sheet}:${ref.rowNumber}`) : undefined);

  const hub = await getHubLocation(tx);

  // Reference data.
  const productIds = new Map<string, string>();
  for (const p of plan.products) {
    const product = await tx.product.create({ data: p });
    productIds.set(p.sku, product.id);
  }
  const technicianIds = new Map<string, string>();
  for (const name of plan.technicians) {
    technicianIds.set(name, (await tx.technician.create({ data: { name } })).id);
  }
  const vans = new Map<string, { id: string; locationId: string }>();
  for (const v of plan.vans) {
    const location = await tx.location.create({ data: { kind: "VAN", name: `Van ${v.code}` } });
    const van = await tx.van.create({
      data: {
        code: v.code,
        plate: v.plate,
        zone: v.zone,
        status: v.status,
        statusSince: v.statusSince ? fromIsoDate(v.statusSince) : null,
        statusNote: v.statusNote,
        isPool: v.isPool,
        currentTechnicianId: v.technician ? technicianIds.get(v.technician) : null,
        locationId: location.id,
      },
    });
    vans.set(v.code, { id: van.id, locationId: location.id });
  }
  const branchIds = new Map<string, string>();
  for (const c of plan.customers) {
    const customer = await tx.customer.create({ data: { name: c.name } });
    for (const b of c.branches) {
      const branch = await tx.branch.create({ data: { customerId: customer.id, name: b.name, zone: b.zone } });
      branchIds.set(`${c.name}|${b.name}`, branch.id);
    }
  }
  const branchId = (customer: string, branch: string) => branchIds.get(`${customer}|${branch}`)!;

  // Jobs. History stays as history; bookings go through dispatch afterwards.
  const bookings: Booking[] = [];
  for (const j of plan.jobs) {
    const completed = j.outcome === "COMPLETED";
    const job = await tx.job.create({
      data: {
        reference: j.reference,
        type: j.type,
        status: completed ? "COMPLETED" : "REQUESTED",
        branchId: branchId(j.customer, j.branch),
        requestedOn: j.requestedOn ? fromIsoDate(j.requestedOn) : null,
        scheduledFor: j.visitOn ? fromIsoDate(j.visitOn) : null,
        completedOn: completed && j.visitOn ? fromIsoDate(j.visitOn) : null,
        vanId: completed && j.vanCode ? vans.get(j.vanCode)!.id : null,
        technicianId: completed && j.technician ? technicianIds.get(j.technician) : null,
        blockingReason: j.outcome === "REVIEW" ? "IMPORT_NEEDS_REVIEW" : null,
        blockingDetail: j.reviewReason,
        sourceStatus: j.sourceStatus,
        notes: j.notes,
        importRowId: rowId(j.ref),
        items: { create: j.items.map((i) => ({ productId: productIds.get(i.sku)!, quantity: i.quantity })) },
      },
    });
    if (j.outcome === "BOOKED") {
      bookings.push({ jobId: job.id, reference: j.reference, vanCode: j.vanCode, scheduledFor: j.visitOn, ref: j.ref });
    }
    if (j.installedUnits.length > 0) {
      await tx.equipmentUnit.createMany({
        data: j.installedUnits.map((u) => ({
          productId: productIds.get(u.sku)!,
          serialNumber: u.serial,
          verification: "VERIFIED" as const,
          condition: "WORKING" as const,
          status: "INSTALLED" as const,
          branchId: branchId(j.customer, j.branch),
        })),
        skipDuplicates: true,
      });
    }
  }

  // Working stock: the selected count, then later movements. Increases go first so
  // that serialised unit rows end up matching the final balance (see stock-ledger).
  const operations: { delta: number; input: Omit<MovementInput, "quantity" | "from" | "to">; van: string; other?: MovementInput["from"] }[] = [
    ...plan.openingBalances.map((b) => ({
      delta: b.quantity,
      van: b.vanCode,
      input: {
        type: "OPENING_BALANCE" as const,
        productId: productIds.get(b.sku)!,
        condition: "WORKING" as const,
        performedBy: actor,
        importRowId: rowId(b.ref),
        note: `Stock book count of ${b.countedOn}`,
      },
    })),
    ...plan.workingMovements.map((m) => ({
      delta: m.delta,
      van: m.vanCode,
      other: m.type === "JOB_DELIVERY" ? { branchId: branchId(m.customer!, m.branch!) } : { locationId: hub.id },
      input: {
        type: m.type,
        productId: productIds.get(m.sku)!,
        condition: "WORKING" as const,
        performedBy: actor,
        importRowId: rowId(m.ref),
        note: `${m.label} on ${m.date}`,
      },
    })),
  ];
  operations.sort((a, b) => Number(b.delta > 0) - Number(a.delta > 0));
  let movementsApplied = 0;
  for (const op of operations) {
    if (op.delta === 0) continue;
    const van = { locationId: vans.get(op.van)!.locationId };
    await moveStock(tx, {
      ...op.input,
      quantity: Math.abs(op.delta),
      from: op.delta > 0 ? op.other : van,
      to: op.delta > 0 ? van : op.other,
      allowNegative: true,
    });
    movementsApplied++;
  }

  // Dead units identified by serial: still in a van, or already back at the hub.
  for (const unit of plan.brokenInVans) {
    await moveStock(tx, {
      type: "BROKEN_COLLECTION",
      productId: productIds.get(unit.sku)!,
      condition: "BROKEN",
      quantity: 1,
      from: { branchId: branchId(unit.customer, unit.branch) },
      to: { locationId: vans.get(unit.vanCode!)!.locationId },
      serials: [unit.serial],
      performedBy: actor,
      importRowId: rowId(unit.ref),
      note: `Pulled out on ${unit.label} (${unit.date})`,
    });
    movementsApplied++;
  }
  for (const unit of plan.brokenAtHub) {
    const data = {
      productId: productIds.get(unit.sku)!,
      verification: "VERIFIED" as const,
      condition: "BROKEN" as const,
      status: "AT_HUB" as const,
      locationId: hub.id,
      branchId: null,
    };
    await tx.equipmentUnit.upsert({ where: { serialNumber: unit.serial }, create: { ...data, serialNumber: unit.serial }, update: data });
  }

  await tx.importIssue.createMany({
    data: plan.issues.map((issue) => ({
      batchId: batch.id,
      sourceRowId: rowId(issue.ref),
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    })),
  });

  return { batchId: batch.id, bookings, movementsApplied, sourceRows: allRows.length };
}

export async function addIssue(
  tx: Tx,
  batchId: string,
  ref: RowRef | null,
  issue: { severity: "INFO" | "WARNING" | "ERROR"; code: string; message: string },
) {
  const row = ref
    ? await tx.importSourceRow.findUnique({ where: { batchId_sheet_rowNumber: { batchId, sheet: ref.sheet, rowNumber: ref.rowNumber } } })
    : null;
  await tx.importIssue.create({ data: { batchId, sourceRowId: row?.id, ...issue } });
}
