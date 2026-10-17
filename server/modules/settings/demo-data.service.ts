import "server-only";
import type { DemoClaimKind, DemoEntityType, Prisma } from "@/generated/prisma/client";
import type { DemoCategoryCount, DemoDataOverview, DemoSection, DemoSectionPreview } from "@/lib/contracts/demo-data";
import { prisma } from "@/server/db/prisma";
import { lockLocations, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, invalidState } from "@/server/http/errors";
import { moveStock } from "@/server/modules/inventory/stock-ledger";

const PRODUCTS: ProductFixture[] = [
  { sku: "THERMAL-PAPER-80", name: "Thermal Paper Rolls", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 20, vanMinimum: 10 },
  { sku: "ETHERNET-CAT6", name: "Cat6 Ethernet Cable", serialised: false, baseUnit: "each", vanMinimum: 5 },
  { sku: "RECEIPT-PAPER-57", name: "57mm Receipt Paper Rolls", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 20 },
  { sku: "HDMI-CABLE-2M", name: "2m HDMI Cable", serialised: false, baseUnit: "each", vanMinimum: 2 },
  { sku: "USB-C-ADAPTER", name: "USB-C Power Adapter", serialised: false, baseUnit: "each", vanMinimum: 2 },
  { sku: "RJ45-CONNECTOR", name: "RJ45 Connector Pack", serialised: false, baseUnit: "pack", vanMinimum: 3 },
  { sku: "CABLE-TIES-200", name: "200mm Cable Ties", serialised: false, baseUnit: "pack", vanMinimum: 4 },
  { sku: "LABEL-ROLL-60", name: "60mm Label Rolls", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 10, vanMinimum: 4 },
  { sku: "PRINTER-CLEAN-KIT", name: "Receipt Printer Cleaning Kit", serialised: false, baseUnit: "kit", vanMinimum: 1 },
  { sku: "POS-POWER-SUPPLY", name: "POS Terminal Power Supply", serialised: false, baseUnit: "each", vanMinimum: 2 },
].map((product, index) => ({ ...product, fixtureKey: index === 0 ? "product.paper" : index === 1 ? "product.cable" : `product.catalog.${String(index + 1).padStart(2, "0")}` }));

const CUSTOMERS = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1;
  const account = index === 0 ? "Juniper Table Group" : ["Cedar & Stone Hospitality", "Olive Grove Kitchens", "Northstar Coffee Co.", "Copper Kettle Dining", "Blue Fig Restaurants", "Crown Market Foods", "Maple Street Cafes", "Saffron House Group", "Harborview Catering"][index - 1];
  return {
    key: index === 0 ? "customer.main" : `customer.account.${String(number).padStart(2, "0")}`,
    name: account,
    branches: index === 0
      ? [{ key: "customer.downtown", name: "Downtown", zone: "Central" }, { key: "customer.airport", name: "Airport", zone: "South" }]
      : [
          { key: `customer.branch.${String(number).padStart(2, "0")}.01`, name: "City Centre", zone: "Central" },
          { key: `customer.branch.${String(number).padStart(2, "0")}.02`, name: "West End", zone: "West" },
        ],
  };
});

const FLEET = Array.from({ length: 10 }, (_, index) => {
  const number = index + 12;
  const suffix = String(index + 1).padStart(2, "0");
  return {
    vanKey: index === 0 ? "fleet.van" : `fleet.van.${suffix}`,
    technicianKey: index === 0 ? "fleet.technician" : `fleet.technician.${suffix}`,
    locationKey: index === 0 ? "fleet.location" : `fleet.location.${suffix}`,
    code: `V-${number}`,
    plate: `38-${String(24716 + index).padStart(5, "0")}`,
    technician: ["Dana Haddad", "Omar Nasser", "Lina Khalil", "Samir Odeh", "Rana Masri", "Tareq Saleh", "Maya Qasem", "Yousef Hani", "Nour Barakat", "Fadi Khatib"][index],
    zone: ["Central", "North", "South", "West", "East"][index % 5],
  };
});

const DISPATCHES = Array.from({ length: 10 }, (_, index) => {
  const number = index + 1;
  const customer = CUSTOMERS[index];
  const branch = customer.branches[index % customer.branches.length];
  const product = PRODUCTS[index === 0 ? 0 : (index + 2) % PRODUCTS.length];
  return {
    jobKey: index === 0 ? "dispatch.request" : `dispatch.request.${String(number).padStart(2, "0")}`,
    itemKey: index === 0 ? "dispatch.request.paper" : `dispatch.request.line.${String(number).padStart(2, "0")}`,
    reference: index === 0 ? "REQ-2026-1042" : `REQ-2026-${1042 + index}`,
    branchKey: branch.key,
    productIndex: index === 0 ? 0 : (index + 2) % PRODUCTS.length,
    notes: `Deliver ${product.name.toLowerCase()} to ${customer.name}, ${branch.name}.`,
    quantity: index === 0 ? 4 : (index % 5) + 1,
  };
});

const DESCRIPTORS: Record<DemoSection, { title: string; description: string; records: string[]; dependencies: string[] }> = {
  PRODUCTS: { title: "Products Catalog", description: "Fills the catalog to 10 products with varied units and restocking minimums. No stock is created.", records: PRODUCTS.map((item) => `${item.name} (${item.sku})`), dependencies: [] },
  CUSTOMERS: { title: "Customers and branches", description: "Fills the customer catalog to 10 accounts with two service branches each. No requests or jobs are created.", records: CUSTOMERS.flatMap((item) => [item.name, ...item.branches.map((branch) => `${item.name} — ${branch.name} branch (${branch.zone})`)]), dependencies: [] },
  FLEET: { title: "Fleet and technicians", description: "Fills the fleet to 10 active vans, each with its own technician and tracked stock location. Vans start empty.", records: FLEET.flatMap((item) => [`Van ${item.code} (${item.plate})`, item.technician, `${item.code} stock location`]), dependencies: [] },
  INVENTORY: { title: "Inventory locations and stock", description: "Fills inventory to 10 opening-balance stock positions across 10 van locations and 10 products through the stock ledger.", records: PRODUCTS.map((item, index) => `${item.name}: ${[25, 18, 32, 12, 16, 24, 20, 14, 8, 11][index]} working units at ${FLEET[index].code}`), dependencies: ["10 catalog products", "10 fleet vans and stock locations"] },
  DISPATCH: { title: "Dispatch requests and jobs", description: "Fills dispatch to 10 unassigned delivery requests with varied customers, branches, and product lines.", records: DISPATCHES.map((item) => `${item.reference}: ${item.notes} (${item.quantity} units)`), dependencies: ["10 catalog products", "10 customers and their branches"] },
  RESTOCKING: { title: "Restocking", description: "Fills restocking to 10 open pick lists, one per van, without moving stock.", records: FLEET.map((van, index) => `${van.code}: ${PRODUCTS[index].name}, ${10 + index * 2} units`), dependencies: ["10 catalog products", "10 fleet vans and stock locations"] },
};

const ENTITY_LABEL: Partial<Record<DemoEntityType, string>> = {
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
};

export async function demoDataOverview(): Promise<DemoDataOverview> {
  const sections = Object.keys(DESCRIPTORS) as DemoSection[];
  return { sections: await Promise.all(sections.map(sectionPreview)) };
}

export async function seedDemoSection(section: DemoSection, actor: string) {
  try {
    const affected = await runInTransaction(async (tx) => {
      const seedBlockers = await trackedSeedBlockers(tx, section);
      if (seedBlockers.length) throw invalidState(`Cannot seed ${DESCRIPTORS[section].title}: ${seedBlockers.join(" ")}`, { dependencies: seedBlockers });
      switch (section) {
        case "PRODUCTS": await seedProducts(tx, section); break;
        case "CUSTOMERS": await seedCustomers(tx, section); break;
        case "FLEET": await seedFleet(tx, section); break;
        case "INVENTORY": await seedInventory(tx, section, actor); break;
        case "DISPATCH": await seedDispatch(tx, section); break;
        case "RESTOCKING": await seedRestocking(tx, section); break;
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
  const [records, primary, dependencies, fixtureIntegrity] = await Promise.all([
    prisma.demoRecord.findMany({ where: { claims: { some: { section } } }, include: { claims: true } }),
    prisma.demoRecord.findMany({ where: { claims: { some: { section, kind: "PRIMARY" } } }, select: { fixtureKey: true, entityType: true } }),
    dependencyAdditions(section),
    runInTransaction(async (tx) => {
      const tracked = await tx.demoRecord.findMany({ where: { fixtureKey: { in: sectionFixtureKeys(section) } }, select: { fixtureKey: true, entityType: true, entityId: true, label: true } });
      const present = new Set<string>();
      const blockers: string[] = [];
      for (const record of tracked) {
        if (await entityExists(tx, record.entityType, record.entityId)) present.add(record.fixtureKey);
        else if (record.entityType !== "PRODUCT" || !PRODUCTS.some((product) => product.fixtureKey === record.fixtureKey)) {
          blockers.push(`${record.label} has a provenance marker pointing to a missing ${record.entityType.toLowerCase()} record; it will not be replaced automatically.`);
        }
      }
      return { present, blockers };
    }),
  ]);
  const seedBlockers = fixtureIntegrity.blockers;
  const exclusive = records.filter((record) => record.claims.length === 1);
  const shared = records.filter((record) => record.claims.length > 1);
  const currentPrimary = countRecords(primary.filter((record) => fixtureIntegrity.present.has(record.fixtureKey)));
  return {
    section,
    ...DESCRIPTORS[section],
    missingDependencies: dependencies.map((item) => `Seed will add or restore ${item.count} ${item.category.toLowerCase()} as declared dependencies.`),
    seedPlan: targetCounts(section).map(({ category, count }) => {
      const current = currentPrimary.find((item) => item.category === category)?.count ?? 0;
      const willAdd = Math.max(0, count - current);
      return { category, willAdd, resultingTotal: current + willAdd };
    }),
    dependencyAdditions: dependencies,
    seedBlockers,
    seeded: countRecords(records),
    clearable: countRecords(exclusive),
    preservedShared: countRecords(shared),
    blockers: await runInTransaction((tx) => clearBlockers(tx, exclusive)),
  };
}

function targetCounts(section: DemoSection) {
  switch (section) {
    case "PRODUCTS": return [{ category: "Products", count: 10 }];
    case "CUSTOMERS": return [{ category: "Customers", count: 10 }, { category: "Branches", count: 20 }];
    case "FLEET": return [{ category: "Vans", count: 10 }, { category: "Technicians", count: 10 }, { category: "Locations", count: 10 }];
    case "INVENTORY": return [{ category: "Stock balances", count: 10 }];
    case "DISPATCH": return [{ category: "Requests and jobs", count: 10 }, { category: "Job product lines", count: 10 }];
    case "RESTOCKING": return [{ category: "Restock jobs", count: 10 }, { category: "Restock lines", count: 10 }];
  }
}

async function dependencyAdditions(section: DemoSection) {
  const keys = dependencyKeys(section);
  if (!keys.length) return [];
  const existing = await runInTransaction(async (tx) => {
    const tracked = await tx.demoRecord.findMany({ where: { fixtureKey: { in: keys } }, select: { fixtureKey: true, entityType: true, entityId: true } });
    const present = new Set<string>();
    for (const record of tracked) if (await entityExists(tx, record.entityType, record.entityId)) present.add(record.fixtureKey);
    return present;
  });
  const additions = new Map<string, number>();
  for (const key of keys) {
    if (existing.has(key)) continue;
    const category = dependencyCategory(key);
    additions.set(category, (additions.get(category) ?? 0) + 1);
  }
  return [...additions].map(([category, count]) => ({ category, count }));
}

function dependencyKeys(section: DemoSection) {
  if (section === "INVENTORY" || section === "RESTOCKING") return [...PRODUCTS.map((item) => item.fixtureKey), ...FLEET.flatMap((item) => [item.vanKey, item.technicianKey, item.locationKey])];
  if (section === "DISPATCH") return [...PRODUCTS.map((item) => item.fixtureKey), ...CUSTOMERS.flatMap((item) => [item.key, ...item.branches.map((branch) => branch.key)])];
  return [];
}

function sectionFixtureKeys(section: DemoSection) {
  const dependencies = dependencyKeys(section);
  switch (section) {
    case "PRODUCTS": return PRODUCTS.map((item) => item.fixtureKey);
    case "CUSTOMERS": return CUSTOMERS.flatMap((item) => [item.key, ...item.branches.map((branch) => branch.key)]);
    case "FLEET": return FLEET.flatMap((item) => [item.vanKey, item.technicianKey, item.locationKey]);
    case "INVENTORY": return [...dependencies, ...PRODUCTS.flatMap((_, index) => [index === 0 ? "inventory.paper.balance" : `inventory.balance.${String(index + 1).padStart(2, "0")}`, index === 0 ? "inventory.paper.opening" : `inventory.opening.${String(index + 1).padStart(2, "0")}`])];
    case "DISPATCH": return [...dependencies, ...DISPATCHES.flatMap((item) => [item.jobKey, item.itemKey])];
    case "RESTOCKING": return [...dependencies, ...FLEET.flatMap((_, index) => { const suffix = String(index + 1).padStart(2, "0"); return [index === 0 ? "restocking.job" : `restocking.job.${suffix}`, index === 0 ? "restocking.item.paper" : `restocking.item.${suffix}`]; })];
  }
}

async function trackedSeedBlockers(tx: Tx, section: DemoSection) {
  const records = await tx.demoRecord.findMany({ where: { fixtureKey: { in: sectionFixtureKeys(section) } }, select: { fixtureKey: true, entityType: true, entityId: true, label: true } });
  const blockers: string[] = [];
  const recoverableProductKeys = new Set(PRODUCTS.map((product) => product.fixtureKey));
  for (const record of records) if (!(await entityExists(tx, record.entityType, record.entityId)) && !(record.entityType === "PRODUCT" && recoverableProductKeys.has(record.fixtureKey))) {
    blockers.push(`${record.label} has a provenance marker pointing to a missing ${record.entityType.toLowerCase()} record; it will not be replaced automatically.`);
  }
  return blockers;
}

function dependencyCategory(key: string) {
  if (key.startsWith("product.")) return "Products";
  if (key.startsWith("customer.branch.") || key === "customer.downtown" || key === "customer.airport") return "Branches";
  if (key.startsWith("customer.")) return "Customers";
  if (key.startsWith("fleet.van")) return "Vans";
  if (key.startsWith("fleet.technician")) return "Technicians";
  return "Locations";
}

async function seedProducts(tx: Tx, section: DemoSection) {
  for (const product of PRODUCTS) await ensureProduct(tx, section, "PRIMARY", product.fixtureKey, product);
}

async function seedCustomers(tx: Tx, section: DemoSection) {
  await ensureCustomerBranches(tx, section, "PRIMARY");
}

async function seedFleet(tx: Tx, section: DemoSection) { for (let index = 0; index < FLEET.length; index++) await ensureVan(tx, section, "PRIMARY", index); }

async function seedInventory(tx: Tx, section: DemoSection, actor: string) {
  const products = await ensureProducts(tx, section, "DEPENDENCY");
  const vans = await ensureFleet(tx, section, "DEPENDENCY");
  await lockLocations(tx, vans.map((van) => van.locationId));
  const quantities = [25, 18, 32, 12, 16, 24, 20, 14, 8, 11];
  for (let index = 0; index < 10; index++) {
    const suffix = String(index + 1).padStart(2, "0");
    const balanceKey = index === 0 ? "inventory.paper.balance" : `inventory.balance.${suffix}`;
    const movementKey = index === 0 ? "inventory.paper.opening" : `inventory.opening.${suffix}`;
    const existing = await findFixture(tx, balanceKey);
    if (existing) { await claim(tx, existing.record.id, section, "PRIMARY"); continue; }
    const product = products[index];
    const van = vans[index];
    const movement = await moveStock(tx, { type: "OPENING_BALANCE", productId: product.id, condition: "WORKING", quantity: quantities[index], to: { locationId: van.locationId }, performedBy: actor, note: "Opening balance recorded from Settings", operationKey: index === 0 ? "demo:inventory:paper:opening:v1" : `settings-seed:inventory:opening:${suffix}` });
    await register(tx, balanceKey, "STOCK_BALANCE", balanceId(van.locationId, product.id, "WORKING"), `${quantities[index]} working ${product.name.toLowerCase()} at ${van.code}`, section, "PRIMARY");
    await register(tx, movementKey, "STOCK_MOVEMENT", movement.id, `${van.code} opening-balance movement`, section, "DEPENDENCY");
  }
}

async function seedDispatch(tx: Tx, section: DemoSection) {
  const products = await ensureProducts(tx, section, "DEPENDENCY");
  const branches = await ensureCustomerBranches(tx, section, "DEPENDENCY");
  for (let index = 0; index < DISPATCHES.length; index++) {
    const fixture = DISPATCHES[index];
    const existing = await findFixture(tx, fixture.jobKey);
    let job;
    if (existing) {
      await claim(tx, existing.record.id, section, "PRIMARY");
      job = await tx.job.findUniqueOrThrow({ where: { id: existing.record.entityId } });
    } else {
      assertUniqueAvailable(await tx.job.findUnique({ where: { reference: fixture.reference } }), `request reference ${fixture.reference}`);
      const branch = branches.get(fixture.branchKey)!;
      job = await tx.job.create({ data: { reference: fixture.reference, type: "DELIVERY", branchId: branch.id, requestedOn: new Date(Date.UTC(2026, 9, 18 + index)), notes: fixture.notes } });
      await register(tx, fixture.jobKey, "JOB", job.id, `Request ${fixture.reference}`, section, "PRIMARY");
    }
    const itemFixture = await findFixture(tx, fixture.itemKey);
    if (itemFixture) await claim(tx, itemFixture.record.id, section, "PRIMARY");
    else {
      const item = await tx.jobItem.create({ data: { jobId: job.id, productId: products[fixture.productIndex].id, quantity: fixture.quantity } });
      await register(tx, fixture.itemKey, "JOB_ITEM", item.id, `${fixture.reference} product line`, section, "PRIMARY");
    }
  }
}

async function seedRestocking(tx: Tx, section: DemoSection) {
  const products = await ensureProducts(tx, section, "DEPENDENCY");
  const vans = await ensureFleet(tx, section, "DEPENDENCY");
  for (let index = 0; index < 10; index++) {
    const suffix = String(index + 1).padStart(2, "0");
    const jobKey = index === 0 ? "restocking.job" : `restocking.job.${suffix}`;
    const itemKey = index === 0 ? "restocking.item.paper" : `restocking.item.${suffix}`;
    const existing = await findFixture(tx, jobKey);
    if (existing) { await claim(tx, existing.record.id, section, "PRIMARY"); continue; }
    const operationalOpen = await tx.restockJob.findFirst({ where: { vanId: vans[index].id, status: "OPEN" } });
    if (operationalOpen) throw invalidState(`Van ${vans[index].code} already has an untracked open restock job. Nothing was changed.`);
    const job = await tx.restockJob.create({ data: { vanId: vans[index].id } });
    const item = await tx.restockItem.create({ data: { restockJobId: job.id, productId: products[index].id, outstandingQuantity: 10 + index * 2 } });
    await register(tx, jobKey, "RESTOCK_JOB", job.id, `Open restock job for ${vans[index].code}`, section, "PRIMARY");
    await register(tx, itemKey, "RESTOCK_ITEM", item.id, `${products[index].name} restock line`, section, "PRIMARY");
  }
}

type ProductCreate = Pick<Prisma.ProductCreateInput, "sku" | "name" | "serialised" | "baseUnit" | "packUnit" | "packSize" | "vanMinimum">;
type ProductFixture = ProductCreate & { fixtureKey: string };
async function ensureProduct(tx: Tx, section: DemoSection, kind: DemoClaimKind, key: string, data: ProductCreate) {
  const tracked = await tx.demoRecord.findUnique({ where: { fixtureKey: key } });
  if (tracked) {
    const productExists = await entityExists(tx, tracked.entityType, tracked.entityId);
    if (!productExists) {
      if (tracked.entityType !== "PRODUCT") throw invalidState(`Provenance for ${tracked.label} points to a missing non-product record.`);
      assertUniqueAvailable(await tx.product.findUnique({ where: { sku: data.sku } }), `product SKU ${data.sku}`);
      const product = await tx.product.create({ data: { sku: data.sku, name: data.name, serialised: data.serialised, baseUnit: data.baseUnit, packUnit: data.packUnit, packSize: data.packSize, vanMinimum: data.vanMinimum } });
      await tx.demoRecord.update({ where: { id: tracked.id }, data: { entityId: product.id, label: data.name } });
      await claim(tx, tracked.id, section, kind);
      return product;
    }
    if (tracked.entityType !== "PRODUCT") throw invalidState(`Fixture ${key} is tracked as ${tracked.entityType}, not a product.`);
    await claim(tx, tracked.id, section, kind);
    return tx.product.findUniqueOrThrow({ where: { id: tracked.entityId } });
  }
  assertUniqueAvailable(await tx.product.findUnique({ where: { sku: data.sku } }), `product SKU ${data.sku}`);
  const product = await tx.product.create({ data: { sku: data.sku, name: data.name, serialised: data.serialised, baseUnit: data.baseUnit, packUnit: data.packUnit, packSize: data.packSize, vanMinimum: data.vanMinimum } });
  await register(tx, key, "PRODUCT", product.id, data.name, section, kind);
  return product;
}

async function ensureProducts(tx: Tx, section: DemoSection, kind: DemoClaimKind) {
  return Promise.all(PRODUCTS.map((item) => ensureProduct(tx, section, kind, item.fixtureKey, item)));
}

async function ensureCustomerBranches(tx: Tx, section: DemoSection, kind: DemoClaimKind) {
  const branches = new Map<string, Awaited<ReturnType<typeof tx.branch.findUniqueOrThrow>>>();
  for (const account of CUSTOMERS) {
    const customerFixture = await findFixture(tx, account.key);
    let customer;
    if (customerFixture) {
      await claim(tx, customerFixture.record.id, section, kind);
      customer = await tx.customer.findUniqueOrThrow({ where: { id: customerFixture.record.entityId } });
    } else {
      assertUniqueAvailable(await tx.customer.findUnique({ where: { name: account.name } }), `customer name ${account.name}`);
      customer = await tx.customer.create({ data: { name: account.name } });
      await register(tx, account.key, "CUSTOMER", customer.id, account.name, section, kind);
    }
    for (const branchData of account.branches) {
      const fixture = await findFixture(tx, branchData.key);
      let branch;
      if (fixture) {
        await claim(tx, fixture.record.id, section, kind);
        branch = await tx.branch.findUniqueOrThrow({ where: { id: fixture.record.entityId } });
        if (branch.customerId !== customer.id) throw invalidState(`${branchData.name} branch is tracked under a different customer. It will not be reassigned automatically.`);
      } else {
        assertUniqueAvailable(await tx.branch.findUnique({ where: { customerId_name: { customerId: customer.id, name: branchData.name } } }), `branch ${branchData.name}`);
        branch = await tx.branch.create({ data: { customerId: customer.id, name: branchData.name, zone: branchData.zone } });
        await register(tx, branchData.key, "BRANCH", branch.id, `${branchData.name} branch`, section, kind);
      }
      branches.set(branchData.key, branch);
    }
  }
  return branches;
}

async function ensureFleet(tx: Tx, section: DemoSection, kind: DemoClaimKind) {
  return Promise.all(FLEET.map((_, index) => ensureVan(tx, section, kind, index)));
}

async function ensureVan(tx: Tx, section: DemoSection, kind: DemoClaimKind, index: number) {
  const fixtureData = FLEET[index];
  const existing = await findFixture(tx, fixtureData.vanKey);
  if (existing) {
    await claim(tx, existing.record.id, section, kind);
    const van = await tx.van.findUniqueOrThrow({ where: { id: existing.record.entityId } });
    const technicianFixture = await findFixture(tx, fixtureData.technicianKey);
    const locationFixture = await findFixture(tx, fixtureData.locationKey);
    if (!technicianFixture || !locationFixture) throw invalidState(`Van ${fixtureData.code} is missing tracked technician or location provenance. It will not be reassigned automatically.`);
    await claim(tx, technicianFixture.record.id, section, kind);
    await claim(tx, locationFixture.record.id, section, kind);
    return van;
  }
  assertUniqueAvailable(await tx.van.findUnique({ where: { code: fixtureData.code } }), `van code ${fixtureData.code}`);
  assertUniqueAvailable(await tx.technician.findUnique({ where: { name: fixtureData.technician } }), `technician name ${fixtureData.technician}`);
  assertUniqueAvailable(await tx.location.findUnique({ where: { name: `Van ${fixtureData.code}` } }), `location name Van ${fixtureData.code}`);
  const technician = await tx.technician.create({ data: { name: fixtureData.technician } });
  const location = await tx.location.create({ data: { kind: "VAN", name: `Van ${fixtureData.code}` } });
  const van = await tx.van.create({ data: { code: fixtureData.code, plate: fixtureData.plate, zone: fixtureData.zone, currentTechnicianId: technician.id, locationId: location.id } });
  await register(tx, fixtureData.technicianKey, "TECHNICIAN", technician.id, `Technician ${fixtureData.technician}`, section, kind);
  await register(tx, fixtureData.locationKey, "LOCATION", location.id, `${fixtureData.code} stock location`, section, kind);
  await register(tx, fixtureData.vanKey, "VAN", van.id, `Van ${fixtureData.code}`, section, kind);
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
  const delegates: Partial<Record<DemoEntityType, { findUnique(args: unknown): Promise<unknown> }>> = { PRODUCT: tx.product as never, CUSTOMER: tx.customer as never, BRANCH: tx.branch as never, TECHNICIAN: tx.technician as never, LOCATION: tx.location as never, VAN: tx.van as never, STOCK_MOVEMENT: tx.stockMovement as never, JOB: tx.job as never, JOB_ITEM: tx.jobItem as never, RESTOCK_JOB: tx.restockJob as never, RESTOCK_ITEM: tx.restockItem as never };
  const delegate = delegates[type];
  if (!delegate) return false;
  return Boolean(await delegate.findUnique({ where: { id }, select: { id: true } }));
}

async function countsForSection(tx: Tx, section: DemoSection) { return countRecords(await tx.demoRecord.findMany({ where: { claims: { some: { section } } } })); }
function countRecords(records: { entityType: DemoEntityType }[]): DemoCategoryCount[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    const label = ENTITY_LABEL[record.entityType];
    if (label) totals.set(label, (totals.get(label) ?? 0) + 1);
  }
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
  }
  return [...new Set(blockers)];
}

async function deleteEntities(tx: Tx, records: { entityType: DemoEntityType; entityId: string }[]) {
  const ids = (type: DemoEntityType) => records.filter((record) => record.entityType === type).map((record) => record.entityId);
  for (const type of ["JOB_ITEM", "RESTOCK_ITEM", "STOCK_MOVEMENT"] as DemoEntityType[]) await deleteSimple(tx, type, ids(type));
  for (const id of ids("STOCK_BALANCE")) { const [locationId, productId, condition] = id.split("|"); await tx.stockBalance.delete({ where: { locationId_productId_condition: { locationId, productId, condition: condition as "WORKING" | "BROKEN" } } }); }
  for (const type of ["JOB", "RESTOCK_JOB", "VAN", "BRANCH", "LOCATION", "TECHNICIAN", "CUSTOMER", "PRODUCT"] as DemoEntityType[]) await deleteSimple(tx, type, ids(type));
}
async function deleteSimple(tx: Tx, type: DemoEntityType, ids: string[]) {
  if (!ids.length) return;
  const delegates: Partial<Record<DemoEntityType, { deleteMany(args: unknown): Promise<unknown> }>> = { PRODUCT: tx.product as never, CUSTOMER: tx.customer as never, BRANCH: tx.branch as never, TECHNICIAN: tx.technician as never, LOCATION: tx.location as never, VAN: tx.van as never, STOCK_MOVEMENT: tx.stockMovement as never, JOB: tx.job as never, JOB_ITEM: tx.jobItem as never, RESTOCK_JOB: tx.restockJob as never, RESTOCK_ITEM: tx.restockItem as never };
  await delegates[type]?.deleteMany({ where: { id: { in: ids } } });
}
function balanceId(locationId: string, productId: string, condition: string) { return `${locationId}|${productId}|${condition}`; }
