import "server-only";
import type { Tx } from "@/server/db/transaction";
import type { StockCondition } from "@/generated/prisma/enums";
import type { StockLineDto } from "@/lib/contracts/inventory";
import { availableQuantity, needsVerificationQuantity, type StockFigures } from "./availability";

// Read-side queries for stock, plus reservation writes. Stock balance and unit
// writes live in stock-ledger.ts so there is exactly one place that changes them.

export async function getBalance(tx: Tx, locationId: string, productId: string, condition: StockCondition) {
  const row = await tx.stockBalance.findUnique({
    where: { locationId_productId_condition: { locationId, productId, condition } },
  });
  return row?.quantity ?? 0;
}

/**
 * Stock figures for each (location, product), combining balances, active
 * reservations and verified unit counts in three grouped queries.
 */
export async function loadStockFigures(tx: Tx, locationIds: string[]) {
  const [balances, reservations, verified] = await Promise.all([
    tx.stockBalance.findMany({ where: { locationId: { in: locationIds } } }),
    tx.reservation.groupBy({
      by: ["locationId", "productId"],
      where: { locationId: { in: locationIds }, status: "ACTIVE" },
      _sum: { quantity: true },
    }),
    tx.equipmentUnit.groupBy({
      by: ["locationId", "productId"],
      where: { locationId: { in: locationIds }, status: "IN_STOCK", condition: "WORKING", verification: "VERIFIED" },
      _count: { _all: true },
    }),
  ]);

  const figures = new Map<string, StockFigures>();
  const entry = (locationId: string, productId: string) => {
    const key = stockKey(locationId, productId);
    let value = figures.get(key);
    if (!value) {
      value = { working: 0, broken: 0, reserved: 0, verifiedWorking: 0 };
      figures.set(key, value);
    }
    return value;
  };

  for (const b of balances) {
    const e = entry(b.locationId, b.productId);
    if (b.condition === "WORKING") e.working = b.quantity;
    else e.broken = b.quantity;
  }
  for (const r of reservations) entry(r.locationId, r.productId).reserved = r._sum.quantity ?? 0;
  for (const u of verified) if (u.locationId) entry(u.locationId, u.productId).verifiedWorking = u._count._all;

  return {
    get(locationId: string, productId: string): StockFigures {
      return figures.get(stockKey(locationId, productId)) ?? { working: 0, broken: 0, reserved: 0, verifiedWorking: 0 };
    },
  };
}

export type StockFiguresLookup = Awaited<ReturnType<typeof loadStockFigures>>;

function stockKey(locationId: string, productId: string) {
  return `${locationId}:${productId}`;
}

export async function buildStockLines(tx: Tx, locationId: string): Promise<StockLineDto[]> {
  const [products, figures] = await Promise.all([
    tx.product.findMany({ orderBy: { sku: "asc" } }),
    loadStockFigures(tx, [locationId]),
  ]);
  return products
    .map((product) => {
      const f = figures.get(locationId, product.id);
      return {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        baseUnit: product.baseUnit,
        serialised: product.serialised,
        working: f.working,
        broken: f.broken,
        reserved: f.reserved,
        verifiedWorking: product.serialised ? f.verifiedWorking : null,
        needsVerification: needsVerificationQuantity(product.serialised, f),
        available: availableQuantity(product.serialised, f),
        vanMinimum: product.vanMinimum,
      };
    })
    .filter((line) => line.working !== 0 || line.broken !== 0 || line.reserved !== 0 || line.vanMinimum > 0);
}

// ─── Reservations ───────────────────────────────────────────────────────────

export async function createReservations(
  tx: Tx,
  jobId: string,
  locationId: string,
  items: { productId: string; quantity: number }[],
) {
  await tx.reservation.createMany({
    data: items.map((item) => ({ jobId, locationId, productId: item.productId, quantity: item.quantity })),
  });
}

/** Closes a job's active reservations. Returns the locations they were held at. */
export async function closeActiveReservations(
  tx: Tx,
  jobId: string,
  outcome: "RELEASED" | "CONSUMED",
  reason: string,
): Promise<string[]> {
  const active = await tx.reservation.findMany({ where: { jobId, status: "ACTIVE" }, select: { locationId: true } });
  await tx.reservation.updateMany({
    where: { jobId, status: "ACTIVE" },
    data: { status: outcome, releaseReason: reason, closedAt: new Date() },
  });
  return [...new Set(active.map((r) => r.locationId))];
}
