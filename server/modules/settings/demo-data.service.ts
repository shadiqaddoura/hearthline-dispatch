import "server-only";
import type { DemoClaimKind, DemoEntityType, DemoSection, Prisma } from "@/generated/prisma/client";
import type { DemoCategoryCount, DemoDataOverview, DemoSectionPreview } from "@/lib/contracts/demo-data";
import { prisma } from "@/server/db/prisma";
import { lockLocations, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, invalidState } from "@/server/http/errors";
import { moveStock } from "@/server/modules/inventory/stock-ledger";

const DESCRIPTORS: Record<DemoSection, { title: string; description: string; records: string[]; dependencies: string[] }> = {
  PRODUCTS: {
    title: "Products Catalog",
    description: "Two clearly labelled catalog products with restocking rules. No stock is created.",
    records: ["Demo paper rolls", "Demo ethernet cables"],
    dependencies: [],
  },
  CUSTOMERS: {
    title: "Customers and branches",
    description: "One demo customer with two branches. No requests or jobs are created.",
    records: ["Demo Hearth Cafe", "Downtown branch", "Airport branch"],
    dependencies: [],
  },
  FLEET: {
    title: "Fleet and technicians",
    description: "One active demo van, its stock location, and one technician. The van starts empty.",
    records: ["Demo van DEMO-V1", "Demo technician Dana", "Van stock location"],
    dependencies: [],
  },
  INVENTORY: {
    title: "Inventory locations and stock",
    description: "Adds a retry-safe opening balance of demo paper to the demo van through the stock ledger.",
    records: ["25 working demo paper rolls", "Opening-balance movement"],
    dependencies: ["Demo paper product", "Demo van and its location"],
  },
  DISPATCH: {
    title: "Dispatch requests and jobs",
    description: "Creates one unassigned demo delivery request with one product line.",
    records: ["Request DEMO-REQ-001", "One demo paper line"],
    dependencies: ["Demo paper product", "Demo customer and Downtown branch"],
  },
  RESTOCKING: {
    title: "Restocking",
    description: "Creates one open demo pick list without moving stock or recalculating operational vans.",
    records: ["One open restock job", "Demo paper pick-list line"],
    dependencies: ["Demo paper product", "Demo van and its location"],
  },
  IMPORTS: {
    title: "Imports",
    description: "Creates an isolated demo import batch, source row, and informational issue; it does not import operational records.",
    records: ["demo-stock-book.xlsx batch", "One preserved source row", "One informational issue"],
    dependencies: [],
  },
};

const ENTITY_LABEL: Record<DemoEntityType, string> = {
  PRODUCT: "Products",
  CUSTOMER: "Customers",
  BRANCH: "Branches",
  TECHNICIAN: "Technicians",
  LOCATION: "Locations",
  VAN: "Vans",
  STOCK_BALANCE: "Stock balances",
  STOCK_MOVEMENT: "Stock movements",
  JOB: "Requests and jobs",
  JOB_ITEM: "Job product lines",
  RESTOCK_JOB: "Restock jobs",
  RESTOCK_ITEM: "Restock lines",
  IMPORT_BATCH: "Import batches",
  IMPORT_SOURCE_ROW: "Import source rows",
  IMPORT_ISSUE: "Import issues",
};

export async function demoDataOverview(): Promise<DemoDataOverview> {
  const sections = Object.keys(DESCRIPTORS) as DemoSection[];
  return { sections: await Promise.all(sections.map(sectionPreview)) };
}

export async function seedDemoSection(section: DemoSection, actor: string) {
  try {
    const affected = await runInTransaction(async (tx) => {
      switch (section) {
        case "PRODUCTS": await seedProducts(tx, section); break;
        case "CUSTOMERS": await seedCustomers(tx, section); break;
        case "FLEET": await seedFleet(tx, section); break;
        case "INVENTORY": await seedInventory(tx, section, actor); break;
        case "DISPATCH": await seedDispatch(tx, section); break;
        case "RESTOCKING": await seedRestocking(tx, section); break;
        case "IMPORTS": await seedImports(tx, section); break;
      }
      return countsForSection(tx, section);
    });
    return { section, message: `${DESCRIPTORS[section].title} demo data is ready. Repeating Seed will not add duplicates.`, affected, overview: await demoDataOverview() };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if ((error as { code?: string }).code === "P2002") {
      throw new AppError("CONFLICT", "A real record already uses one of the demo fixture values. Nothing was changed.");
    }
    throw error;
  }
}

export async function clearDemoSection(section: DemoSection, expected?: DemoCategoryCount[]) {
  const affected = await runInTransaction(async (tx) => {
    const records = await tx.demoRecord.findMany({ where: { claims: { some: { section } } }, include: { claims: true } });
    const exclusive = records.filter((record) => record.claims.length === 1);
    const result = countRecords(exclusive);
    if (expected && JSON.stringify(expected) !== JSON.stringify(result)) {
      throw invalidState("The demo-data counts changed after confirmation. Review the refreshed preview and confirm again.", { expected, current: result });
    }
    const blockers = await clearBlockers(tx, exclusive);
    if (blockers.length) {
      throw invalidState(`Cannot clear ${DESCRIPTORS[section].title}: ${blockers.join(" ")}`, { dependencies: blockers });
    }
    await deleteEntities(tx, exclusive);
    await tx.demoRecordClaim.deleteMany({ where: { section } });
    await tx.demoRecord.deleteMany({ where: { claims: { none: {} } } });
    return result;
  });
  return { section, message: `${DESCRIPTORS[section].title} demo data was cleared. Shared demo dependencies and all non-demo data were preserved.`, affected, overview: await demoDataOverview() };
}

async function sectionPreview(section: DemoSection): Promise<DemoSectionPreview> {
  const records = await prisma.demoRecord.findMany({ where: { claims: { some: { section } } }, include: { claims: true } });
  const exclusive = records.filter((record) => record.claims.length === 1);
  const shared = records.filter((record) => record.claims.length > 1);
  return {
    section,
    ...DESCRIPTORS[section],
    missingDependencies: await missingDependencies(section),
    seeded: countRecords(records),
    clearable: countRecords(exclusive),
    preservedShared: countRecords(shared),
    blockers: await runInTransaction((tx) => clearBlockers(tx, exclusive)),
  };
}

async function missingDependencies(section: DemoSection) {
  const keys: Partial<Record<DemoSection, string[]>> = {
    INVENTORY: ["product.paper", "fleet.van"],
    DISPATCH: ["product.paper", "customer.downtown"],
    RESTOCKING: ["product.paper", "fleet.van"],
  };
  const needed = keys[section] ?? [];
  if (!needed.length) return [];
  const present = new Set((await prisma.demoRecord.findMany({ where: { fixtureKey: { in: needed } }, select: { fixtureKey: true } })).map((row) => row.fixtureKey));
  return needed.filter((key) => !present.has(key)).map((key) => `Seed will also create and track ${fixtureLabel(key)} as a declared dependency.`);
}

function fixtureLabel(key: string) {
  return ({ "product.paper": "the demo paper product", "fleet.van": "the demo van and fleet records", "customer.downtown": "the demo customer and Downtown branch" } as Record<string, string>)[key] ?? key;
}

async function seedProducts(tx: Tx, section: DemoSection) {
  await ensureProduct(tx, section, "PRIMARY", "product.paper", { sku: "DEMO-PAPER", name: "Demo Paper Rolls", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 20, vanMinimum: 10 });
  await ensureProduct(tx, section, "PRIMARY", "product.cable", { sku: "DEMO-CABLE", name: "Demo Ethernet Cable", serialised: false, baseUnit: "each", vanMinimum: 5 });
}

async function seedCustomers(tx: Tx, section: DemoSection) {
  await ensureBranch(tx, section, "PRIMARY", "customer.downtown", "Downtown", "Central");
  await ensureBranch(tx, section, "PRIMARY", "customer.airport", "Airport", "South");
}

async function seedFleet(tx: Tx, section: DemoSection) { await ensureVan(tx, section, "PRIMARY"); }

async function seedInventory(tx: Tx, section: DemoSection, actor: string) {
  const product = await ensureProduct(tx, section, "DEPENDENCY", "product.paper", { sku: "DEMO-PAPER", name: "Demo Paper Rolls", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 20, vanMinimum: 10 });
  const van = await ensureVan(tx, section, "DEPENDENCY");
  const existing = await tx.demoRecord.findUnique({ where: { fixtureKey: "inventory.paper.opening" } });
  if (existing) { await claim(tx, existing.id, section, "PRIMARY"); return; }
  await lockLocations(tx, [van.locationId]);
  const movement = await moveStock(tx, { type: "OPENING_BALANCE", productId: product.id, condition: "WORKING", quantity: 25, to: { locationId: van.locationId }, performedBy: actor, note: "Settings demo fixture", operationKey: "demo:inventory:paper:opening:v1" });
  await register(tx, "inventory.paper.balance", "STOCK_BALANCE", balanceId(van.locationId, product.id, "WORKING"), "25 working demo paper rolls", section, "PRIMARY");
  await register(tx, "inventory.paper.opening", "STOCK_MOVEMENT", movement.id, "Opening-balance movement", section, "PRIMARY");
}

async function seedDispatch(tx: Tx, section: DemoSection) {
  const product = await ensureProduct(tx, section, "DEPENDENCY", "product.paper", { sku: "DEMO-PAPER", name: "Demo Paper Rolls", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 20, vanMinimum: 10 });
  const branch = await ensureBranch(tx, section, "DEPENDENCY", "customer.downtown", "Downtown", "Central");
  const existing = await findFixture(tx, "dispatch.request");
  if (existing) { await claim(tx, existing.record.id, section, "PRIMARY"); return; }
  assertUniqueAvailable(await tx.job.findUnique({ where: { reference: "DEMO-REQ-001" } }), "request reference DEMO-REQ-001");
  const job = await tx.job.create({ data: { reference: "DEMO-REQ-001", type: "DELIVERY", branchId: branch.id, requestedOn: new Date("2026-10-18T00:00:00.000Z"), notes: "Demo request created from Settings" } });
  const item = await tx.jobItem.create({ data: { jobId: job.id, productId: product.id, quantity: 4 } });
  await register(tx, "dispatch.request", "JOB", job.id, "Request DEMO-REQ-001", section, "PRIMARY");
  await register(tx, "dispatch.request.paper", "JOB_ITEM", item.id, "Demo paper request line", section, "PRIMARY");
}

async function seedRestocking(tx: Tx, section: DemoSection) {
  const product = await ensureProduct(tx, section, "DEPENDENCY", "product.paper", { sku: "DEMO-PAPER", name: "Demo Paper Rolls", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 20, vanMinimum: 10 });
  const van = await ensureVan(tx, section, "DEPENDENCY");
  const existing = await findFixture(tx, "restocking.job");
  if (existing) { await claim(tx, existing.record.id, section, "PRIMARY"); return; }
  const operationalOpen = await tx.restockJob.findFirst({ where: { vanId: van.id, status: "OPEN" } });
  if (operationalOpen) throw invalidState("The demo van already has an untracked open restock job. Nothing was changed.");
  const job = await tx.restockJob.create({ data: { vanId: van.id } });
  const item = await tx.restockItem.create({ data: { restockJobId: job.id, productId: product.id, outstandingQuantity: 10 } });
  await register(tx, "restocking.job", "RESTOCK_JOB", job.id, "Open demo restock job", section, "PRIMARY");
  await register(tx, "restocking.item.paper", "RESTOCK_ITEM", item.id, "Demo paper pick-list line", section, "PRIMARY");
}

async function seedImports(tx: Tx, section: DemoSection) {
  const existing = await findFixture(tx, "imports.batch");
  if (existing) { await claim(tx, existing.record.id, section, "PRIMARY"); return; }
  const batch = await tx.importBatch.create({ data: { fileName: "demo-stock-book.xlsx", summary: { demo: true, rows: 1 } } });
  const row = await tx.importSourceRow.create({ data: { batchId: batch.id, sheet: "Demo Preview", rowNumber: 2, raw: { note: "Isolated demo import row" } } });
  const issue = await tx.importIssue.create({ data: { batchId: batch.id, sourceRowId: row.id, severity: "INFO", code: "DEMO_PREVIEW", message: "Demo import workflow preview only" } });
  await register(tx, "imports.batch", "IMPORT_BATCH", batch.id, "demo-stock-book.xlsx", section, "PRIMARY");
  await register(tx, "imports.row", "IMPORT_SOURCE_ROW", row.id, "Demo Preview row 2", section, "PRIMARY");
  await register(tx, "imports.issue", "IMPORT_ISSUE", issue.id, "Demo informational issue", section, "PRIMARY");
}

type ProductCreate = Pick<Prisma.ProductCreateInput, "sku" | "name" | "serialised" | "baseUnit" | "packUnit" | "packSize" | "vanMinimum">;
async function ensureProduct(tx: Tx, section: DemoSection, kind: DemoClaimKind, key: string, data: ProductCreate) {
  const fixture = await findFixture(tx, key);
  if (fixture) { await claim(tx, fixture.record.id, section, kind); return tx.product.findUniqueOrThrow({ where: { id: fixture.record.entityId } }); }
  assertUniqueAvailable(await tx.product.findUnique({ where: { sku: data.sku } }), `product SKU ${data.sku}`);
  const product = await tx.product.create({ data });
  await register(tx, key, "PRODUCT", product.id, data.name, section, kind);
  return product;
}

async function ensureBranch(tx: Tx, section: DemoSection, kind: DemoClaimKind, key: string, name: string, zone: string) {
  let customerFixture = await findFixture(tx, "customer.main");
  let customer;
  if (customerFixture) customer = await tx.customer.findUniqueOrThrow({ where: { id: customerFixture.record.entityId } });
  else {
    assertUniqueAvailable(await tx.customer.findUnique({ where: { name: "Demo Hearth Cafe" } }), "customer name Demo Hearth Cafe");
    customer = await tx.customer.create({ data: { name: "Demo Hearth Cafe" } });
    await register(tx, "customer.main", "CUSTOMER", customer.id, "Demo Hearth Cafe", section, kind);
    customerFixture = await findFixture(tx, "customer.main");
  }
  await claim(tx, customerFixture!.record.id, section, kind);
  const fixture = await findFixture(tx, key);
  if (fixture) { await claim(tx, fixture.record.id, section, kind); return tx.branch.findUniqueOrThrow({ where: { id: fixture.record.entityId } }); }
  assertUniqueAvailable(await tx.branch.findUnique({ where: { customerId_name: { customerId: customer.id, name } } }), `branch ${name}`);
  const branch = await tx.branch.create({ data: { customerId: customer.id, name, zone } });
  await register(tx, key, "BRANCH", branch.id, `${name} branch`, section, kind);
  return branch;
}

async function ensureVan(tx: Tx, section: DemoSection, kind: DemoClaimKind) {
  const existing = await findFixture(tx, "fleet.van");
  if (existing) {
    await claim(tx, existing.record.id, section, kind);
    const van = await tx.van.findUniqueOrThrow({ where: { id: existing.record.entityId } });
    for (const key of ["fleet.technician", "fleet.location"]) { const dep = await findFixture(tx, key); if (dep) await claim(tx, dep.record.id, section, kind); }
    return van;
  }
  assertUniqueAvailable(await tx.van.findUnique({ where: { code: "DEMO-V1" } }), "van code DEMO-V1");
  assertUniqueAvailable(await tx.technician.findUnique({ where: { name: "Demo Dana" } }), "technician name Demo Dana");
  assertUniqueAvailable(await tx.location.findUnique({ where: { name: "Van DEMO-V1" } }), "location name Van DEMO-V1");
  const technician = await tx.technician.create({ data: { name: "Demo Dana" } });
  const location = await tx.location.create({ data: { kind: "VAN", name: "Van DEMO-V1" } });
  const van = await tx.van.create({ data: { code: "DEMO-V1", plate: "DEMO-001", zone: "Central", currentTechnicianId: technician.id, locationId: location.id } });
  await register(tx, "fleet.technician", "TECHNICIAN", technician.id, "Demo technician Dana", section, kind);
  await register(tx, "fleet.location", "LOCATION", location.id, "Demo van stock location", section, kind);
  await register(tx, "fleet.van", "VAN", van.id, "Demo van DEMO-V1", section, kind);
  return van;
}

async function findFixture(tx: Tx, fixtureKey: string) {
  const record = await tx.demoRecord.findUnique({ where: { fixtureKey } });
  if (!record) return null;
  if (!(await entityExists(tx, record.entityType, record.entityId))) throw invalidState(`Demo provenance for ${record.label} exists, but the tracked record is missing. Repair that inconsistency before seeding.`);
  return { record };
}

async function register(tx: Tx, fixtureKey: string, entityType: DemoEntityType, entityId: string, label: string, section: DemoSection, kind: DemoClaimKind) {
  const record = await tx.demoRecord.create({ data: { fixtureKey, entityType, entityId, label } });
  await claim(tx, record.id, section, kind);
}
async function claim(tx: Tx, recordId: string, section: DemoSection, kind: DemoClaimKind) {
  await tx.demoRecordClaim.upsert({ where: { recordId_section: { recordId, section } }, create: { recordId, section, kind }, update: { kind } });
}
function assertUniqueAvailable(value: unknown, label: string): asserts value is null { if (value) throw new AppError("CONFLICT", `A non-demo record already uses ${label}. Nothing was changed.`); }

async function entityExists(tx: Tx, type: DemoEntityType, id: string) {
  if (type === "STOCK_BALANCE") { const [locationId, productId, condition] = id.split("|"); return Boolean(await tx.stockBalance.findUnique({ where: { locationId_productId_condition: { locationId, productId, condition: condition as "WORKING" | "BROKEN" } } })); }
  const delegates: Partial<Record<DemoEntityType, { findUnique(args: unknown): Promise<unknown> }>> = { PRODUCT: tx.product as never, CUSTOMER: tx.customer as never, BRANCH: tx.branch as never, TECHNICIAN: tx.technician as never, LOCATION: tx.location as never, VAN: tx.van as never, STOCK_MOVEMENT: tx.stockMovement as never, JOB: tx.job as never, JOB_ITEM: tx.jobItem as never, RESTOCK_JOB: tx.restockJob as never, RESTOCK_ITEM: tx.restockItem as never, IMPORT_BATCH: tx.importBatch as never, IMPORT_SOURCE_ROW: tx.importSourceRow as never, IMPORT_ISSUE: tx.importIssue as never };
  const delegate = delegates[type];
  if (!delegate) return false;
  return Boolean(await delegate.findUnique({ where: { id }, select: { id: true } }));
}

async function countsForSection(tx: Tx, section: DemoSection) { return countRecords(await tx.demoRecord.findMany({ where: { claims: { some: { section } } } })); }
function countRecords(records: { entityType: DemoEntityType }[]): DemoCategoryCount[] {
  const totals = new Map<string, number>();
  for (const record of records) totals.set(ENTITY_LABEL[record.entityType], (totals.get(ENTITY_LABEL[record.entityType]) ?? 0) + 1);
  return [...totals].map(([category, count]) => ({ category, count })).sort((a, b) => a.category.localeCompare(b.category));
}

async function clearBlockers(tx: Tx, records: { entityType: DemoEntityType; entityId: string; label: string }[]) {
  const exclusive = new Map<DemoEntityType, Set<string>>();
  for (const record of records) { const ids = exclusive.get(record.entityType) ?? new Set(); ids.add(record.entityId); exclusive.set(record.entityType, ids); }
  const blockers: string[] = [];
  const has = (type: DemoEntityType, id: string) => exclusive.get(type)?.has(id) ?? false;
  for (const record of records) {
    if (!(await entityExists(tx, record.entityType, record.entityId))) { blockers.push(`${record.label} is missing while its provenance remains.`); continue; }
    if (record.entityType === "JOB") {
      const job = await tx.job.findUniqueOrThrow({ where: { id: record.entityId }, include: { items: true, reservations: true, movements: true, completion: true } });
      if (job.status !== "REQUESTED" || job.vanId || job.technicianId || job.importRowId || job.reservations.length || job.movements.length || job.completion || job.items.some((item) => !has("JOB_ITEM", item.id))) blockers.push(`${record.label} has operational assignment, history, or untracked lines.`);
    }
    if (record.entityType === "STOCK_BALANCE") {
      const [locationId, productId, condition] = record.entityId.split("|");
      const balance = await tx.stockBalance.findUniqueOrThrow({ where: { locationId_productId_condition: { locationId, productId, condition: condition as "WORKING" | "BROKEN" } } });
      const movements = await tx.stockMovement.findMany({ where: { productId, condition: condition as "WORKING" | "BROKEN", OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } });
      const tracked = movements.filter((movement) => has("STOCK_MOVEMENT", movement.id));
      const expected = tracked.reduce((sum, movement) => sum + (movement.toLocationId === locationId ? movement.quantity : -movement.quantity), 0);
      if (movements.some((movement) => !has("STOCK_MOVEMENT", movement.id)) || balance.quantity !== expected) blockers.push(`${record.label} has non-demo movement history or its count changed (current ${balance.quantity}, demo contribution ${expected}).`);
    }
    if (record.entityType === "VAN") {
      const van = await tx.van.findUniqueOrThrow({ where: { id: record.entityId } });
      const jobs = await tx.job.findMany({ where: { vanId: van.id }, select: { id: true } });
      const restocks = await tx.restockJob.findMany({ where: { vanId: van.id }, select: { id: true } });
      if (jobs.some((row) => !has("JOB", row.id)) || restocks.some((row) => !has("RESTOCK_JOB", row.id))) blockers.push(`${record.label} is linked to non-demo jobs or restocking.`);
    }
    if (record.entityType === "LOCATION") {
      const balances = await tx.stockBalance.findMany({ where: { locationId: record.entityId } });
      const movements = await tx.stockMovement.findMany({ where: { OR: [{ fromLocationId: record.entityId }, { toLocationId: record.entityId }] } });
      const equipment = await tx.equipmentUnit.count({ where: { locationId: record.entityId } });
      const reservations = await tx.reservation.count({ where: { locationId: record.entityId } });
      const corrections = await tx.stockCorrection.count({ where: { locationId: record.entityId } });
      if (balances.some((row) => !has("STOCK_BALANCE", balanceId(row.locationId, row.productId, row.condition))) || movements.some((row) => !has("STOCK_MOVEMENT", row.id)) || equipment || reservations || corrections) blockers.push(`${record.label} has non-demo stock, movement, equipment, reservation, or correction history.`);
    }
    if (record.entityType === "BRANCH") {
      const jobs = await tx.job.findMany({ where: { branchId: record.entityId }, select: { id: true } });
      if (jobs.some((row) => !has("JOB", row.id)) || await tx.equipmentUnit.count({ where: { branchId: record.entityId } }) || await tx.stockMovement.count({ where: { branchId: record.entityId } })) blockers.push(`${record.label} is linked to non-demo customer activity.`);
    }
    if (record.entityType === "CUSTOMER") {
      const branches = await tx.branch.findMany({ where: { customerId: record.entityId }, select: { id: true } });
      if (branches.some((row) => !has("BRANCH", row.id))) blockers.push(`${record.label} has a non-demo branch.`);
    }
    if (record.entityType === "TECHNICIAN") {
      const vans = await tx.van.findMany({ where: { currentTechnicianId: record.entityId }, select: { id: true } });
      const jobs = await tx.job.findMany({ where: { technicianId: record.entityId }, select: { id: true } });
      if (vans.some((row) => !has("VAN", row.id)) || jobs.some((row) => !has("JOB", row.id))) blockers.push(`${record.label} is linked to non-demo fleet or job activity.`);
    }
    if (record.entityType === "RESTOCK_JOB") {
      const restock = await tx.restockJob.findUniqueOrThrow({ where: { id: record.entityId }, include: { items: true, movements: true, returns: true } });
      if (restock.status !== "OPEN" || restock.movements.length || restock.returns.length || restock.items.some((item) => !has("RESTOCK_ITEM", item.id))) blockers.push(`${record.label} has collection, return, status, or untracked pick-list history.`);
    }
    if (record.entityType === "PRODUCT") {
      const [items, movements, balances, restockItems] = await Promise.all([
        tx.jobItem.findMany({ where: { productId: record.entityId }, select: { id: true } }), tx.stockMovement.findMany({ where: { productId: record.entityId }, select: { id: true } }), tx.stockBalance.findMany({ where: { productId: record.entityId } }), tx.restockItem.findMany({ where: { productId: record.entityId }, select: { id: true } }),
      ]);
      const other = await Promise.all([tx.reservation.count({ where: { productId: record.entityId } }), tx.equipmentUnit.count({ where: { productId: record.entityId } }), tx.jobCompletionLine.count({ where: { productId: record.entityId } }), tx.restockReturn.count({ where: { productId: record.entityId } }), tx.stockCorrection.count({ where: { productId: record.entityId } })]);
      if (items.some((row) => !has("JOB_ITEM", row.id)) || movements.some((row) => !has("STOCK_MOVEMENT", row.id)) || balances.some((row) => !has("STOCK_BALANCE", balanceId(row.locationId, row.productId, row.condition))) || restockItems.some((row) => !has("RESTOCK_ITEM", row.id)) || other.some(Boolean)) blockers.push(`${record.label} is linked to non-demo stock or operational history.`);
    }
    if (record.entityType === "IMPORT_BATCH") {
      const rows = await tx.importSourceRow.findMany({ where: { batchId: record.entityId }, include: { job: true, movements: true } });
      if (rows.some((row) => !has("IMPORT_SOURCE_ROW", row.id) || row.job || row.movements.length)) blockers.push(`${record.label} is linked to imported operational records.`);
    }
  }
  return [...new Set(blockers)];
}

async function deleteEntities(tx: Tx, records: { entityType: DemoEntityType; entityId: string }[]) {
  const ids = (type: DemoEntityType) => records.filter((record) => record.entityType === type).map((record) => record.entityId);
  for (const type of ["IMPORT_ISSUE", "IMPORT_SOURCE_ROW", "JOB_ITEM", "RESTOCK_ITEM", "STOCK_MOVEMENT"] as DemoEntityType[]) await deleteSimple(tx, type, ids(type));
  for (const id of ids("STOCK_BALANCE")) { const [locationId, productId, condition] = id.split("|"); await tx.stockBalance.delete({ where: { locationId_productId_condition: { locationId, productId, condition: condition as "WORKING" | "BROKEN" } } }); }
  for (const type of ["JOB", "RESTOCK_JOB", "VAN", "BRANCH", "IMPORT_BATCH", "LOCATION", "TECHNICIAN", "CUSTOMER", "PRODUCT"] as DemoEntityType[]) await deleteSimple(tx, type, ids(type));
}
async function deleteSimple(tx: Tx, type: DemoEntityType, ids: string[]) {
  if (!ids.length) return;
  const delegates: Partial<Record<DemoEntityType, { deleteMany(args: unknown): Promise<unknown> }>> = { PRODUCT: tx.product as never, CUSTOMER: tx.customer as never, BRANCH: tx.branch as never, TECHNICIAN: tx.technician as never, LOCATION: tx.location as never, VAN: tx.van as never, STOCK_MOVEMENT: tx.stockMovement as never, JOB: tx.job as never, JOB_ITEM: tx.jobItem as never, RESTOCK_JOB: tx.restockJob as never, RESTOCK_ITEM: tx.restockItem as never, IMPORT_BATCH: tx.importBatch as never, IMPORT_SOURCE_ROW: tx.importSourceRow as never, IMPORT_ISSUE: tx.importIssue as never };
  await delegates[type]?.deleteMany({ where: { id: { in: ids } } });
}
function balanceId(locationId: string, productId: string, condition: string) { return `${locationId}|${productId}|${condition}`; }
