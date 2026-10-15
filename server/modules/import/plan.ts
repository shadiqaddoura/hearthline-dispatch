import type { JobType } from "@/generated/prisma/enums";
import { aliasKey, CUSTOMER_ALIASES, IMPORT_DECISIONS, POOL_VAN_WORDS, PRODUCT_ALIASES, TECHNICIANS } from "./aliases";
import {
  createProductResolver,
  parseDay,
  parseFaultyReturned,
  parseHubRunNote,
  parseJobKind,
  parseJobStatus,
  parseParts,
  parseQuantity,
  parseSerials,
  parseVanStatus,
  text,
  type PartLine,
  type ProductResolver,
} from "./normalise";
import { IssueLog, type PlannedIssue, type RowRef } from "./issue-log";
import type { SourceRow, StockBook } from "./read-workbook";
import { reconcileStock, type CollectedBrokenUnit, type CountRow, type HubDrop, type StockEvent } from "./stock-reconciliation";

// Step 3 of the import: validate the normalised rows and decide what to load.
// Pure: builds an ImportPlan from the rows without touching the database, so every
// decision can be tested and every doubt is recorded as an issue against its row.

export interface PlannedProduct {
  sku: string;
  name: string;
  serialised: boolean;
  baseUnit: string;
  packUnit: string | null;
  packSize: number | null;
  vanMinimum: number;
  autoRestock: boolean;
  restockPolicyNeedsReview: boolean;
  restockPolicyNote: string | null;
}

export interface PlannedVan {
  code: string;
  plate: string | null;
  zone: string | null;
  status: "ACTIVE" | "GARAGE" | "SOLD";
  statusSince: string | null;
  statusNote: string | null;
  isPool: boolean;
  technician: string | null;
}

export interface PlannedJob {
  ref: RowRef;
  reference: string;
  type: JobType;
  /** COMPLETED history, a BOOKED visit to try to assign, or REVIEW (held for a person). */
  outcome: "COMPLETED" | "BOOKED" | "REVIEW";
  reviewReason: string | null;
  requestedOn: string | null;
  visitOn: string | null;
  customer: string;
  branch: string;
  vanCode: string | null;
  technician: string | null;
  items: PartLine[];
  installedUnits: { sku: string; serial: string }[];
  sourceStatus: string | null;
  notes: string | null;
}

export interface ImportPlan {
  products: PlannedProduct[];
  technicians: string[];
  vans: PlannedVan[];
  customers: { name: string; branches: { name: string; zone: string | null }[] }[];
  jobs: PlannedJob[];
  openingBalances: { vanCode: string; sku: string; quantity: number; countedOn: string; ref: RowRef }[];
  workingMovements: StockEvent[];
  brokenInVans: CollectedBrokenUnit[];
  brokenAtHub: CollectedBrokenUnit[];
  stockRowsSuperseded: number;
  issues: PlannedIssue[];
}

export function buildImportPlan(book: StockBook): ImportPlan {
  const log = new IssueLog();

  const products = planProducts(book.minLevels, log);
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const resolveProduct = createProductResolver(
    products.map((p) => p.sku),
    PRODUCT_ALIASES,
  );
  const resolveTechnician = createTechnicianResolver();

  const vans = planVans(book.vans, resolveTechnician, log);
  const vanByCode = new Map(vans.map((v) => [v.code, v]));
  const resolveVehicle = createVehicleResolver(vans);
  const usableOn = (vanCode: string, day: string) => {
    const van = vanByCode.get(vanCode)!;
    return van.status === "ACTIVE" || !van.statusSince || day < van.statusSince;
  };

  const counts = planCounts(book.stock, { resolveVehicle, resolveProduct, productBySku }, log);
  const jobRows = planJobRows(book.jobs, { resolveVehicle, resolveProduct, resolveTechnician, productBySku, vanByCode, usableOn }, log);

  const stock = reconcileStock({
    counts,
    events: jobRows.events,
    collected: jobRows.collected,
    drops: jobRows.drops,
    log,
  });

  for (const van of vans) {
    if (van.status === "ACTIVE") continue;
    const carried = stock.openingBalances.filter((b) => b.vanCode === van.code && b.quantity !== 0);
    if (carried.length > 0) {
      log.warn(
        null,
        "STOCK_IN_INACTIVE_VAN",
        `${van.code} is ${van.status.toLowerCase()} but the book still lists ${carried.length} product(s) in it. ` +
          "Kept where the book says it is; a person must transfer or correct it.",
      );
    }
  }

  return {
    products,
    technicians: TECHNICIANS.map((t) => t.name),
    vans,
    customers: jobRows.customers,
    jobs: jobRows.jobs,
    openingBalances: stock.openingBalances,
    workingMovements: stock.workingMovements,
    brokenInVans: stock.brokenInVans,
    brokenAtHub: stock.brokenAtHub,
    stockRowsSuperseded: stock.superseded,
    issues: log.issues,
  };
}

// ─── Reference data ─────────────────────────────────────────────────────────

const refOf = (row: SourceRow): RowRef => ({ sheet: row.sheet, rowNumber: row.rowNumber });

function planProducts(rows: SourceRow[], log: IssueLog): PlannedProduct[] {
  const products: PlannedProduct[] = [];
  for (const row of rows) {
    const ref = refOf(row);
    const sku = text(row.cells.sku)?.toUpperCase();
    const name = text(row.cells.item);
    if (!sku || !name) {
      log.error(ref, "PRODUCT_INCOMPLETE", "Minimum-level row without a SKU or item name; skipped");
      continue;
    }
    const serialisedText = text(row.cells.serialised)?.toLowerCase();
    if (serialisedText !== "yes" && serialisedText !== "no") {
      log.error(ref, "PRODUCT_SERIALISATION_UNKNOWN", `${sku}: serialised is "${serialisedText ?? ""}", expected yes/no; skipped`);
      continue;
    }

    // "box (50 rolls)": stored in rolls, picked in boxes of 50.
    const unit = text(row.cells.unit) ?? "each";
    const pack = unit.match(/^(\w+)\s*\((\d+)\s*(\w+?)s?\)$/i);
    const packUnit = pack ? pack[1].toLowerCase() : null;
    const packSize = pack ? Number(pack[2]) : null;
    const baseUnit = pack ? pack[3].toLowerCase() : unit.toLowerCase();

    const minimum = typeof row.cells.min_per_van === "number" ? row.cells.min_per_van : null;
    if (minimum === null) log.warn(ref, "MINIMUM_MISSING", `${sku}: no minimum per van; 0 used`);
    const vanMinimum = (minimum ?? 0) * (packSize ?? 1);
    if (packSize && minimum !== null) {
      log.info(ref, "MINIMUM_CONVERTED", `${sku}: minimum ${minimum} ${packUnit}(es) stored as ${vanMinimum} ${baseUnit}s`);
    }

    const policy = IMPORT_DECISIONS.restockPolicyOverrides[sku];
    if (policy) log.warn(ref, "RESTOCK_POLICY_REVIEW", `${sku}: ${policy.note}`);

    products.push({
      sku,
      name,
      serialised: serialisedText === "yes",
      baseUnit,
      packUnit,
      packSize,
      vanMinimum,
      autoRestock: policy?.autoRestock ?? true,
      restockPolicyNeedsReview: Boolean(policy),
      restockPolicyNote: policy?.note ?? null,
    });
  }
  return products;
}

type TechnicianResolver = (name: string | null) => string | null;

function createTechnicianResolver(): TechnicianResolver {
  const lookup = new Map<string, string>();
  for (const t of TECHNICIANS) for (const alias of [t.name, ...t.aliases]) lookup.set(aliasKey(alias), t.name);
  return (name) => (name ? lookup.get(aliasKey(name)) ?? null : null);
}

function planVans(rows: SourceRow[], resolveTechnician: TechnicianResolver, log: IssueLog): PlannedVan[] {
  const vans: PlannedVan[] = [];
  for (const row of rows) {
    const ref = refOf(row);
    const code = text(row.cells.van)?.toUpperCase();
    if (!code) {
      log.error(ref, "VAN_INCOMPLETE", "Van row without a van code; skipped");
      continue;
    }
    const statusText = text(row.cells.status);
    const status = parseVanStatus(statusText);
    if (!status.ok) log.warn(ref, "VAN_STATUS_UNCLEAR", `${code}: ${status.reason}; treated as active`);
    else if (status.note) log.info(ref, "VAN_STATUS_DATE", `${code}: ${status.note}`);

    const technicianText = text(row.cells.technician);
    let technician = resolveTechnician(technicianText);
    if (technicianText && !technician && !technicianText.startsWith("(")) {
      log.warn(ref, "UNKNOWN_TECHNICIAN", `${code}: technician "${technicianText}" not recognised`);
    }
    const value = status.ok ? status.value : { status: "ACTIVE" as const, since: null, isPool: false };
    if (technician && value.status !== "ACTIVE") {
      log.info(ref, "DRIVER_DETACHED", `${code} is ${value.status.toLowerCase()}, so ${technician} is not recorded as driving it`);
      technician = null;
    }
    vans.push({
      code,
      plate: text(row.cells.plate),
      zone: text(row.cells.zone),
      status: value.status,
      statusSince: value.since,
      statusNote: statusText,
      isPool: value.isPool,
      technician,
    });
  }

  const pool = vans.find((v) => v.isPool);
  if (pool && !pool.technician) {
    pool.technician = IMPORT_DECISIONS.poolVanDriver;
    log.info(null, "POOL_VAN_DRIVER", `${pool.code} driver set to ${pool.technician} from the Read me note "Khalid is in the pool van"`);
  }
  return vans;
}

type VehicleResolver = (value: string | null) => string | null;

/** Accepts van codes ("V06"), plates ("RGH 5502") and "pool". */
function createVehicleResolver(vans: PlannedVan[]): VehicleResolver {
  const lookup = new Map<string, string>();
  for (const van of vans) {
    lookup.set(aliasKey(van.code), van.code);
    if (van.plate) lookup.set(aliasKey(van.plate), van.code);
    if (van.isPool) for (const word of POOL_VAN_WORDS) lookup.set(aliasKey(word), van.code);
  }
  return (value) => (value ? lookup.get(aliasKey(value)) ?? null : null);
}

// ─── Stock sheet ────────────────────────────────────────────────────────────

function planCounts(
  rows: SourceRow[],
  ctx: { resolveVehicle: VehicleResolver; resolveProduct: ProductResolver; productBySku: Map<string, PlannedProduct> },
  log: IssueLog,
): CountRow[] {
  const counts: CountRow[] = [];
  for (const row of rows) {
    const ref = refOf(row);
    const vanText = text(row.cells.van);
    const vanCode = ctx.resolveVehicle(vanText);
    if (!vanCode) {
      log.error(ref, "UNKNOWN_VEHICLE", `Vehicle "${vanText ?? ""}" is not on the Vans sheet; row not imported`);
      continue;
    }

    const skuText = text(row.cells.sku);
    const itemText = text(row.cells.item);
    const fromSku = skuText ? ctx.resolveProduct(skuText) : null;
    const fromItem = itemText ? ctx.resolveProduct(itemText) : null;
    const sku = fromSku ?? fromItem;
    if (!sku) {
      log.error(ref, "UNKNOWN_PRODUCT", `Product "${skuText ?? itemText ?? ""}" not recognised; row not imported`);
      continue;
    }
    if (fromSku && fromItem && fromSku !== fromItem) {
      log.warn(ref, "PRODUCT_MISMATCH", `SKU "${skuText}" and item "${itemText}" disagree; the SKU (${fromSku}) is used`);
    }
    const product = ctx.productBySku.get(sku)!;

    const day = parseDay(row.cells.last_counted);
    if (!day.ok) {
      log.error(ref, "UNREADABLE_COUNT_DATE", `${vanCode} ${sku}: ${day.reason}; without a date the count cannot be placed in time`);
      continue;
    }
    if (day.note) log.info(ref, "DATE_CONVERTED", day.note);

    const quantity = parseQuantity(row.cells.qty, product);
    if (!quantity.ok) {
      log.error(ref, "UNREADABLE_QUANTITY", `${vanCode} ${sku}: ${quantity.reason}; count not imported`);
      continue;
    }
    if (quantity.note) log.info(ref, "QUANTITY_CONVERTED", `${vanCode} ${sku}: ${quantity.note}`);
    if (quantity.value < 0) {
      log.warn(
        ref,
        "NEGATIVE_COUNT",
        `${vanCode} ${sku}: count of ${quantity.value} preserved for review (the hub says car-park transfers were recorded as negatives)`,
      );
    }

    const rowMinimum = typeof row.cells.min === "number" ? row.cells.min : null;
    const agreedMinimum = product.vanMinimum / (product.packSize ?? 1);
    if (rowMinimum !== null && rowMinimum !== agreedMinimum) {
      log.info(ref, "ROW_MINIMUM_IGNORED", `${vanCode} ${sku}: row minimum ${rowMinimum} differs from the 3 June agreed ${agreedMinimum}; the agreed minimum is used`);
    }

    counts.push({ ref, vanCode, sku, countedOn: day.value, quantity: quantity.value });
  }
  return counts;
}

// ─── Jobs sheet ─────────────────────────────────────────────────────────────

function planJobRows(
  rows: SourceRow[],
  ctx: {
    resolveVehicle: VehicleResolver;
    resolveProduct: ProductResolver;
    resolveTechnician: TechnicianResolver;
    productBySku: Map<string, PlannedProduct>;
    vanByCode: Map<string, PlannedVan>;
    usableOn: (vanCode: string, day: string) => boolean;
  },
  log: IssueLog,
) {
  const jobs: PlannedJob[] = [];
  const events: StockEvent[] = [];
  const collected: CollectedBrokenUnit[] = [];
  const drops: HubDrop[] = [];
  const branches = new Map<string, Map<string, string | null>>();
  const references = new Set<string>();

  for (const row of rows) {
    const ref = refOf(row);
    const c = row.cells;
    const reference = text(c.job_ref);
    const kind = parseJobKind(text(c.type));
    const statusText = text(c.status);
    const notes = text(c.notes);
    const vanText = text(c.van);
    const vanCode = ctx.resolveVehicle(vanText);
    const label = reference ?? `row ${row.rowNumber}`;

    if (kind === "UNCLEAR_RESTOCK") {
      log.warn(ref, "UNCLEAR_RESTOCK_ROW", `${label}: typed "Restock?" (status "${statusText ?? ""}", note "${notes ?? ""}"); meaning unclear, no stock effect`);
      continue;
    }

    if (kind === "HUB_RUN") {
      const day = parseDay(c.date);
      const note = parseHubRunNote(notes);
      if (parseJobStatus(statusText) !== "COMPLETED" || !day.ok) {
        log.warn(ref, "HUB_RUN_UNCLEAR", `${label}: hub run without a completed status and date; no stock effect`);
      } else if (!note) {
        log.warn(ref, "HUB_RUN_NOTE_UNCLEAR", `${label}: note "${notes ?? ""}" does not say what moved; no stock effect`);
      } else if (note.kind === "DROPPED") {
        if (note.serials.length !== note.count) {
          log.warn(ref, "HUB_RUN_COUNT_MISMATCH", `${label}: says ${note.count} dropped but lists ${note.serials.length} serial(s); the serials are used`);
        }
        drops.push({ ref, date: day.value, serials: note.serials });
      } else {
        const sku = ctx.resolveProduct(note.itemName);
        if (!sku || !vanCode) {
          log.warn(ref, "HUB_RUN_NOTE_UNCLEAR", `${label}: cannot tell which van or product "${notes}" refers to; no stock effect`);
        } else if (!ctx.usableOn(vanCode, day.value)) {
          log.warn(ref, "VAN_UNAVAILABLE_ON_DATE", `${label}: ${vanCode} was not in service on ${day.value}; pickup not applied`);
        } else {
          events.push({ ref, date: day.value, vanCode, sku, delta: note.quantity, type: "RESTOCK_COLLECTION", label: `${label} pickup` });
        }
      }
      continue;
    }

    if (!kind) {
      log.error(ref, "UNKNOWN_JOB_TYPE", `${label}: type "${text(c.type) ?? ""}" not recognised; row not imported`);
      continue;
    }
    if (!reference) {
      log.error(ref, "MISSING_JOB_REFERENCE", "Customer job without a job_ref; row not imported");
      continue;
    }
    if (references.has(reference)) {
      log.error(ref, "DUPLICATE_JOB_REFERENCE", `${reference} appears more than once; this row not imported`);
      continue;
    }
    references.add(reference);

    const customerText = text(c.customer);
    const branch = text(c.branch);
    if (!customerText || !branch) {
      log.error(ref, "MISSING_CUSTOMER", `${reference}: customer or branch missing; row not imported`);
      continue;
    }
    const customer = CUSTOMER_ALIASES[customerText] ?? customerText;
    if (customer !== customerText) log.info(ref, "CUSTOMER_ALIAS", `${reference}: customer "${customerText}" read as "${customer}"`);
    recordBranch(branches, customer, branch, text(c.zone), ref, log);

    const requested = parseDay(c.requested);
    if (!requested.ok) {
      log.warn(ref, "MISSING_REQUEST_DATE", `${reference}: request date ${requested.reason}; how long it waited is unknown`);
    }
    const visit = parseDay(c.date);
    if (!visit.ok) log.warn(ref, "MISSING_VISIT_DATE", `${reference}: visit date ${visit.reason}`);
    for (const d of [requested, visit]) if (d.ok && d.note) log.info(ref, "DATE_CONVERTED", `${reference}: ${d.note}`);
    const requestedOn = requested.ok ? requested.value : null;
    const visitOn = visit.ok ? visit.value : null;
    if (requestedOn && visitOn && requestedOn > visitOn) {
      log.warn(ref, "REQUESTED_AFTER_VISIT", `${reference}: requested ${requestedOn} but visited ${visitOn}; both kept as written`);
    }

    if (vanText && !vanCode) log.warn(ref, "UNKNOWN_VEHICLE", `${reference}: vehicle "${vanText}" not recognised`);
    const technicianText = text(c.technician);
    const technician = ctx.resolveTechnician(technicianText);
    if (technicianText && !technician) log.warn(ref, "UNKNOWN_TECHNICIAN", `${reference}: technician "${technicianText}" not recognised`);

    const parts = parseParts(text(c.parts) ?? "", ctx.resolveProduct);
    if (parts.unrecognised.length) {
      log.warn(ref, "UNRECOGNISED_PARTS", `${reference}: could not read part(s) ${parts.unrecognised.map((p) => `"${p}"`).join(", ")}`);
    }
    // Job rows give paper as "2x PAP-80" without saying boxes or rolls.
    const items = parts.lines.filter((line) => {
      const product = ctx.productBySku.get(line.sku)!;
      if (!product.packSize) return true;
      log.warn(ref, "PACK_UNIT_UNCLEAR", `${reference}: "${line.quantity} ${line.sku}" does not say ${product.packUnit}es or ${product.baseUnit}s; left off the job and not applied to stock`);
      return false;
    });

    const status = parseJobStatus(statusText);
    let outcome: PlannedJob["outcome"] = status ?? "REVIEW";
    let reviewReason: string | null = null;
    if (!status) {
      reviewReason = `Imported status "${statusText ?? "(blank)"}" is unclear`;
      log.warn(ref, "STATUS_UNCLEAR", `${reference}: ${reviewReason}; held for review, no stock effect`);
    } else if (status === "BOOKED" && (parts.unrecognised.length > 0 || items.length < parts.lines.length)) {
      outcome = "REVIEW";
      reviewReason = "Required parts could not all be read";
    }

    const installedUnits: PlannedJob["installedUnits"] = [];
    if (outcome === "COMPLETED") {
      const stockApplies = vanCode && visitOn && ctx.usableOn(vanCode, visitOn);
      if (vanCode && visitOn && !stockApplies) {
        log.warn(ref, "VAN_UNAVAILABLE_ON_DATE", `${reference}: recorded on ${vanCode}, which was ${ctx.vanByCode.get(vanCode)!.status.toLowerCase()} on ${visitOn}; stock effects not applied`);
      } else if (!vanCode || !visitOn) {
        log.warn(ref, "STOCK_EFFECT_UNKNOWN", `${reference}: no usable van or date; stock effects not applied`);
      }
      if (stockApplies) {
        for (const line of items) {
          events.push({ ref, date: visitOn, vanCode, sku: line.sku, delta: -line.quantity, type: "JOB_DELIVERY", label: reference, customer, branch });
        }
      }

      const faulty = text(c.faulty_returned);
      if (faulty) {
        const unit = parseFaultyReturned(faulty, ctx.resolveProduct);
        if (!unit.ok) log.warn(ref, "FAULTY_UNREADABLE", `${reference}: ${unit.reason}`);
        else collected.push({ ref, date: visitOn ?? "", vanCode: stockApplies ? vanCode : null, ...unit.value, customer, branch, label: reference });
      }

      const serials = parseSerials(text(c.serials));
      const serialisedLines = items.filter((line) => ctx.productBySku.get(line.sku)!.serialised);
      if (serialisedLines.length === 1 && serials.length === serialisedLines[0].quantity) {
        installedUnits.push(...serials.map((serial) => ({ sku: serialisedLines[0].sku, serial })));
      } else if (serials.length > 0) {
        log.info(ref, "SERIALS_NOT_MATCHED", `${reference}: ${serials.length} installed serial(s) kept on the source row; the sheet does not say which serial is which product`);
      }
    } else if (text(c.faulty_returned)) {
      log.warn(ref, "FAULTY_NOT_APPLIED", `${reference}: faulty unit "${text(c.faulty_returned)}" recorded, but the job status is unclear; not placed in a van`);
    }

    if (outcome === "BOOKED" && vanCode && technician) {
      const driver = ctx.vanByCode.get(vanCode)!.technician;
      if (driver && driver !== technician) {
        log.info(ref, "BOOKED_TECHNICIAN_DIFFERS", `${reference}: booked with ${technician} but ${vanCode} is driven by ${driver}; the van's driver takes the job`);
      }
    }

    jobs.push({
      ref,
      reference,
      type: kind,
      outcome,
      reviewReason,
      requestedOn,
      visitOn,
      customer,
      branch,
      vanCode,
      technician,
      items,
      installedUnits,
      sourceStatus: statusText,
      notes,
    });
  }

  const customers = [...branches].map(([name, byBranch]) => ({
    name,
    branches: [...byBranch].map(([branchName, zone]) => ({ name: branchName, zone })),
  }));
  return { jobs, events, collected, drops, customers };
}

function recordBranch(
  branches: Map<string, Map<string, string | null>>,
  customer: string,
  branch: string,
  zone: string | null,
  ref: RowRef,
  log: IssueLog,
) {
  const byBranch = branches.get(customer) ?? new Map<string, string | null>();
  branches.set(customer, byBranch);
  if (!byBranch.has(branch)) {
    byBranch.set(branch, zone);
  } else if (zone && byBranch.get(branch) && byBranch.get(branch) !== zone) {
    log.warn(ref, "BRANCH_ZONE_CONFLICT", `${customer} ${branch}: zone "${zone}" differs from earlier "${byBranch.get(branch)}"; earlier kept`);
  } else if (zone && !byBranch.get(branch)) {
    byBranch.set(branch, zone);
  }
}
