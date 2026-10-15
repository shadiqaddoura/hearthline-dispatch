import { prisma } from "@/server/db/prisma";
import { runInTransaction } from "@/server/db/transaction";
import { moveStock } from "@/server/modules/inventory/stock-ledger";
import { getHubLocation } from "@/server/modules/fleet/fleet.repository";

/** Empties every table. Each integration test starts from a known world. */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

/**
 * A small fleet:
 *   north (V-N, zone North, driven by Nadia) · south (V-S, zone South, driven by Sam)
 *   garage (V-G, in the garage, no driver)
 * and products: a serialised printer, a cable, paper in boxes of 50, a kitchen display.
 */
export async function createWorld() {
  await resetDatabase();
  const hub = await getHubLocation(prisma);

  const printer = await prisma.product.create({
    data: { sku: "PRN-80", name: "Receipt printer", serialised: true, vanMinimum: 3 },
  });
  const cable = await prisma.product.create({
    data: { sku: "CBL-ETH", name: "Ethernet cable", serialised: false, vanMinimum: 10 },
  });
  const paper = await prisma.product.create({
    data: { sku: "PAP-80", name: "Paper", serialised: false, baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 100 },
  });
  const display = await prisma.product.create({
    data: { sku: "KDS-15", name: "Kitchen display", serialised: true, vanMinimum: 1, autoRestock: false, restockPolicyNeedsReview: true },
  });

  const nadia = await prisma.technician.create({ data: { name: "Nadia" } });
  const sam = await prisma.technician.create({ data: { name: "Sam" } });
  const spare = await prisma.technician.create({ data: { name: "Tariq" } });

  const van = async (code: string, zone: string, status: "ACTIVE" | "GARAGE", technicianId: string | null) => {
    const location = await prisma.location.create({ data: { kind: "VAN", name: `Van ${code}` } });
    return prisma.van.create({ data: { code, zone, status, currentTechnicianId: technicianId, locationId: location.id } });
  };
  const north = await van("V-N", "North", "ACTIVE", nadia.id);
  const south = await van("V-S", "South", "ACTIVE", sam.id);
  const garage = await van("V-G", "North", "GARAGE", null);

  const customer = await prisma.customer.create({ data: { name: "Casa Verde" } });
  const branch = await prisma.branch.create({ data: { customerId: customer.id, name: "Riverside", zone: "North" } });

  return { hub, printer, cable, paper, display, nadia, sam, spare, north, south, garage, branch };
}

export type World = Awaited<ReturnType<typeof createWorld>>;

/** Puts stock in a van the way the import does. `serials` become verified units; the rest need verification. */
export async function stockVan(
  locationId: string,
  productId: string,
  quantity: number,
  options: { condition?: "WORKING" | "BROKEN"; serials?: string[] } = {},
) {
  await runInTransaction((tx) =>
    moveStock(tx, {
      type: "OPENING_BALANCE",
      productId,
      condition: options.condition ?? "WORKING",
      quantity,
      to: { locationId },
      serials: options.serials,
      performedBy: "test",
    }),
  );
}

export function serials(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i + 1}`);
}

export async function balance(locationId: string, productId: string, condition: "WORKING" | "BROKEN" = "WORKING") {
  const row = await prisma.stockBalance.findUnique({
    where: { locationId_productId_condition: { locationId, productId, condition } },
  });
  return row?.quantity ?? 0;
}

export async function newJob(world: World, items: { productId: string; quantity: number }[], reference = `J-${Math.random().toString(36).slice(2, 8)}`) {
  return prisma.job.create({
    data: {
      reference,
      type: "INSTALLATION",
      branchId: world.branch.id,
      requestedOn: new Date("2026-10-01T00:00:00Z"),
      items: { create: items },
    },
  });
}

export async function activeReservations(jobId: string) {
  return prisma.reservation.findMany({ where: { jobId, status: "ACTIVE" } });
}
