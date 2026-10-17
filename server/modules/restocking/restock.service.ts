import "server-only";
import { prisma } from "@/server/db/prisma";
import { lockLocations, lockRestockJob, runInTransaction, type Tx } from "@/server/db/transaction";
import { invalidState, notFound } from "@/server/http/errors";
import { moveStock } from "@/server/modules/inventory/stock-ledger";
import { refreshBlockingReasons } from "@/server/modules/dispatch/dispatch.service";
import { getHubLocation } from "@/server/modules/fleet/fleet.repository";
import type { CollectRestockRequest, RestockJobDto } from "@/lib/contracts/restocking";
import type { RestockStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { calculateRestockNeeds } from "./restock-calculator";
import { toPickQuantity } from "./pick-quantity";

/**
 * Brings each affected van's single OPEN restock job in line with its current stock.
 * Called inside every transaction that changes a van's balances, while the van's
 * location lock is held, so the pick list can never lag behind a movement.
 * Creating or updating the pick list never changes inventory.
 */
export async function recalculateRestockForLocations(tx: Tx, locationIds: string[]) {
  const vans = await tx.van.findMany({ where: { locationId: { in: locationIds } } });
  for (const van of vans) await recalculateRestockForVan(tx, van);
}

async function recalculateRestockForVan(tx: Tx, van: { id: string; locationId: string; status: string }) {
  const open = await tx.restockJob.findFirst({ where: { vanId: van.id, status: "OPEN" }, include: { items: true } });

  if (van.status !== "ACTIVE") {
    if (open) await closeRestockJob(tx, open.id, "Van is not active");
    return;
  }

  const products = await tx.product.findMany({ select: { id: true, vanMinimum: true, autoRestock: true } });
  const balances = await tx.stockBalance.findMany({ where: { locationId: van.locationId, condition: "WORKING" } });
  const needs = calculateRestockNeeds(products, new Map(balances.map((b) => [b.productId, b.quantity])));

  if (needs.length === 0) {
    if (open) await closeRestockJob(tx, open.id, "Van is at or above its minimums");
    return;
  }

  const job = open ?? (await tx.restockJob.create({ data: { vanId: van.id }, include: { items: true } }));
  const needByProduct = new Map(needs.map((n) => [n.productId, n.quantity]));

  for (const need of needs) {
    await tx.restockItem.upsert({
      where: { restockJobId_productId: { restockJobId: job.id, productId: need.productId } },
      create: { restockJobId: job.id, productId: need.productId, outstandingQuantity: need.quantity },
      update: { outstandingQuantity: need.quantity },
    });
  }
  for (const item of job.items) {
    if (needByProduct.has(item.productId)) continue;
    if (item.collectedQuantity > 0) {
      await tx.restockItem.update({ where: { id: item.id }, data: { outstandingQuantity: 0 } });
    } else {
      await tx.restockItem.delete({ where: { id: item.id } });
    }
  }
}

async function closeRestockJob(tx: Tx, id: string, reason: string) {
  await tx.restockJob.update({ where: { id }, data: { status: "CLOSED", closeReason: reason, closedAt: new Date() } });
}

/** Recalculates every van. Used after an import and by the manual endpoint. */
export async function recalculateAllRestockJobs() {
  const vans = await prisma.van.findMany({ select: { locationId: true } });
  for (const van of vans) {
    await runInTransaction(async (tx) => {
      await lockLocations(tx, [van.locationId]);
      await recalculateRestockForLocations(tx, [van.locationId]);
    });
  }
  return listRestockJobs({ status: "OPEN" });
}

/**
 * Confirms what was actually collected at the hub (increases van stock) and which
 * broken units were handed back (decreases the van's broken stock), then recalculates.
 */
export async function confirmRestockCollection(restockJobId: string, input: CollectRestockRequest) {
  await runInTransaction(async (tx) => {
    const job = await tx.restockJob.findUnique({ where: { id: restockJobId }, include: { van: true } });
    if (!job) throw notFound("Restock job", restockJobId);

    const hub = await getHubLocation(tx);
    await lockLocations(tx, [job.van.locationId, hub.id]);
    await lockRestockJob(tx, restockJobId);
    const current = await tx.restockJob.findUniqueOrThrow({ where: { id: restockJobId } });
    if (current.status !== "OPEN") throw invalidState("This restock job is closed");

    const van = { locationId: job.van.locationId };

    for (const line of input.collected) {
      await moveStock(tx, {
        type: "RESTOCK_COLLECTION",
        productId: line.productId,
        condition: "WORKING",
        quantity: line.quantity,
        from: { locationId: hub.id },
        to: van,
        serials: line.serials,
        performedBy: input.collectedBy,
        restockJobId,
      });
      await tx.restockItem.upsert({
        where: { restockJobId_productId: { restockJobId, productId: line.productId } },
        create: { restockJobId, productId: line.productId, outstandingQuantity: 0, collectedQuantity: line.quantity },
        update: { collectedQuantity: { increment: line.quantity } },
      });
    }

    for (const line of input.brokenReturned) {
      const movement = await moveStock(tx, {
        type: "BROKEN_RETURN",
        productId: line.productId,
        condition: "BROKEN",
        quantity: line.quantity,
        from: van,
        to: { locationId: hub.id },
        serials: line.serials,
        performedBy: input.collectedBy,
        restockJobId,
      });
      await tx.restockReturn.create({
        data: {
          restockJobId,
          productId: line.productId,
          quantity: line.quantity,
          serials: movement.serials,
          returnedBy: input.collectedBy,
        },
      });
    }

    await recalculateRestockForLocations(tx, [job.van.locationId]);
  });

  await refreshBlockingReasons();
  return getRestockJob(restockJobId);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

const restockInclude = {
  van: { include: { currentTechnician: true } },
  items: { include: { product: true }, orderBy: { product: { sku: "asc" } } },
  returns: { include: { product: true } },
} as const;

export async function listRestockJobs(filter: { status?: RestockStatus } = {}): Promise<RestockJobDto[]> {
  const jobs = await prisma.restockJob.findMany({
    where: { status: filter.status },
    include: restockInclude,
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
  });
  return Promise.all(jobs.map(toRestockJobDto));
}

export async function getRestockJob(id: string): Promise<RestockJobDto> {
  const job = await prisma.restockJob.findUnique({ where: { id }, include: restockInclude });
  if (!job) throw notFound("Restock job", id);
  return toRestockJobDto(job);
}

type RestockJobRow = Prisma.RestockJobGetPayload<{ include: typeof restockInclude }>;

/**
 * The pick list as stored (outstanding quantities come from the recalculation above),
 * with the van's current figures beside it. Read-only: nothing here changes stock.
 */
async function toRestockJobDto(job: RestockJobRow): Promise<RestockJobDto> {
  const locationId = job.van.locationId;
  const [balances, brokenUnits, products] = await Promise.all([
    prisma.stockBalance.findMany({ where: { locationId } }),
    prisma.equipmentUnit.findMany({
      where: { locationId, condition: "BROKEN", status: "IN_STOCK", serialNumber: { not: null } },
      select: { productId: true, serialNumber: true },
      orderBy: { serialNumber: "asc" },
    }),
    prisma.product.findMany({ orderBy: { sku: "asc" } }),
  ]);
  const balance = (productId: string, condition: "WORKING" | "BROKEN") =>
    balances.find((b) => b.productId === productId && b.condition === condition)?.quantity ?? 0;
  const productById = new Map(products.map((p) => [p.id, p]));

  return {
    id: job.id,
    van: {
      id: job.van.id,
      code: job.van.code,
      status: job.van.status,
      technician: job.van.currentTechnician
        ? { id: job.van.currentTechnician.id, name: job.van.currentTechnician.name }
        : null,
    },
    status: job.status,
    closeReason: job.closeReason,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    items: job.items.map((item) => {
      const working = balance(item.productId, "WORKING");
      return {
        productId: item.productId,
        sku: item.product.sku,
        name: item.product.name,
        outstanding: item.outstandingQuantity,
        collected: item.collectedQuantity,
        pick: toPickQuantity(item.outstandingQuantity, item.product),
        vanMinimum: item.product.vanMinimum,
        working,
        balanceNeedsReview: working < 0,
      };
    }),
    brokenAwaitingReturn: balances
      .filter((b) => b.condition === "BROKEN" && b.quantity > 0)
      .map((b) => {
        const product = productById.get(b.productId)!;
        return {
          productId: b.productId,
          sku: product.sku,
          name: product.name,
          quantity: b.quantity,
          baseUnit: product.baseUnit,
          serials: brokenUnits.filter((u) => u.productId === b.productId).map((u) => u.serialNumber!),
        };
      })
      .sort((a, b) => a.sku.localeCompare(b.sku)),
    policyExclusions: products
      .filter((p) => !p.autoRestock && p.vanMinimum > 0 && balance(p.id, "WORKING") < p.vanMinimum)
      .map((p) => ({
        productId: p.id,
        sku: p.sku,
        name: p.name,
        vanMinimum: p.vanMinimum,
        working: balance(p.id, "WORKING"),
        baseUnit: p.baseUnit,
        needsReview: p.restockPolicyNeedsReview,
        note: p.restockPolicyNote,
      })),
    returns: job.returns.map((r) => ({
      productId: r.productId,
      sku: r.product.sku,
      quantity: r.quantity,
      serials: r.serials,
      returnedBy: r.returnedBy,
      returnedAt: r.returnedAt.toISOString(),
    })),
  };
}
