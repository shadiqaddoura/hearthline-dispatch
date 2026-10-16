import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { prisma } from "@/server/db/prisma";
import { runInTransaction } from "@/server/db/transaction";
import { AppError } from "@/server/http/errors";
import { assignJob, reassignJob } from "@/server/modules/dispatch/dispatch.service";
import { updateVan } from "@/server/modules/fleet/fleet.service";
import { assignableQuantity } from "@/server/modules/inventory/availability";
import { loadStockFigures } from "@/server/modules/inventory/inventory.repository";
import { transferStock } from "@/server/modules/inventory/inventory.service";
import { cancelJob, completeJob } from "@/server/modules/jobs/jobs.service";
import { createWorld, newJob, stockVan, type World } from "../support/world";

// Overlapping driver changes, job operations and stock movements, run concurrently
// against PostgreSQL. Each round starts from a fresh world:
//   V-N (north) driven by Nadia · V-S (south) driven by Sam · Tariq has no van
//   each van: 10 cables and two verified printers.

const ROUNDS = 8;
const RACE_TIMEOUT_MS = 20_000;
const TEST_TIMEOUT_MS = 90_000;

let w: World;
let warn: MockInstance;
let retriesAllowed = false;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  retriesAllowed = false;
});

afterEach(() => {
  // A retry means PostgreSQL aborted a transaction: the lock order should make that unnecessary.
  if (!retriesAllowed) {
    const retries = warn.mock.calls.filter((call) => String(call[0]).includes("Transaction aborted by the database"));
    expect(retries, "transactions were aborted by the database and retried").toHaveLength(0);
  }
  warn.mockRestore();
});

async function freshWorld() {
  w = await createWorld();
  for (const [van, prefix] of [[w.north, "N"], [w.south, "S"]] as const) {
    await stockVan(van.locationId, w.cable.id, 10);
    await stockVan(van.locationId, w.printer.id, 2, { serials: [`${prefix}-1`, `${prefix}-2`] });
  }
}

const assigned = async (vanId: string, reference: string) => {
  const job = await newJob(w, [{ productId: w.cable.id, quantity: 2 }, { productId: w.printer.id, quantity: 1 }], reference);
  await assignJob(job.id, { vanId, assignedBy: "Noor" });
  return job;
};

const complete = (jobId: string, serial: string, deadSerial: string) =>
  completeJob(jobId, {
    completedBy: "Nadia",
    delivered: [
      { productId: w.cable.id, quantity: 2 },
      { productId: w.printer.id, quantity: 1, serials: [serial] },
    ],
    collectedBroken: [{ productId: w.printer.id, quantity: 1, serials: [deadSerial] }],
  });

const cancel = (jobId: string) => cancelJob(jobId, { reason: "Customer postponed", cancelledBy: "Noor" });
const drive = (vanId: string, technicianId: string) => updateVan(vanId, { technicianId, updatedBy: "Faris" });

/** Starts every operation at once; fails instead of hanging if they do not all finish. */
async function race(...operations: (() => Promise<unknown>)[]) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`operations still waiting after ${RACE_TIMEOUT_MS} ms`)), RACE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.allSettled(operations.map((operation) => operation())), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Expected rejections are business rules (AppError with an allowed code). Anything else, e.g. a deadlock, fails. */
function expectOnlyBusinessRejections(results: PromiseSettledResult<unknown>[], allowed: string[]) {
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    if (!(result.reason instanceof AppError)) {
      throw new Error(`Unexpected database error, not a business rule: ${String(result.reason?.message ?? result.reason).slice(0, 300)}`);
    }
    expect(allowed, `unexpected rejection: ${result.reason.code} ${result.reason.message}`).toContain(result.reason.code);
  }
}

/** Drivers, jobs, reservations, devices, balances and movement history all agree. */
async function expectConsistent() {
  const jobs = await prisma.job.findMany({ include: { van: true, reservations: true, completion: true } });
  for (const job of jobs) {
    const active = job.reservations.filter((r) => r.status === "ACTIVE");
    if (job.status === "ASSIGNED") {
      expect(job.technicianId, `${job.reference} technician drives its van`).toBe(job.van?.currentTechnicianId);
      expect(job.technicianId).not.toBeNull();
      expect(active.length).toBeGreaterThan(0);
      expect(active.every((r) => r.locationId === job.van?.locationId), `${job.reference} reserved on its own van`).toBe(true);
    } else {
      expect(active, `${job.reference} (${job.status}) holds no reservations`).toHaveLength(0);
      expect(Boolean(job.completion), `${job.reference} completion record`).toBe(job.status === "COMPLETED");
    }
  }

  const movements = await prisma.stockMovement.findMany();
  for (const delivery of movements.filter((m) => m.type === "JOB_DELIVERY")) {
    expect(jobs.find((j) => j.id === delivery.jobId)?.status).toBe("COMPLETED");
  }
  for (const b of await prisma.stockBalance.findMany()) {
    const net = movements
      .filter((m) => m.productId === b.productId && m.condition === b.condition)
      .reduce((sum, m) => sum + (m.toLocationId === b.locationId ? m.quantity : 0) - (m.fromLocationId === b.locationId ? m.quantity : 0), 0);
    expect(net, "movement history explains the balance").toBe(b.quantity);
    const isPrinter = b.productId === w.printer.id; // the serialised product here
    if (isPrinter) {
      const units = await prisma.equipmentUnit.count({
        where: { locationId: b.locationId, productId: b.productId, condition: b.condition, status: "IN_STOCK" },
      });
      expect(units, "device records match the balance").toBe(Math.max(0, b.quantity));
    }
  }

  const vans = await prisma.van.findMany();
  const figures = await loadStockFigures(prisma, vans.map((v) => v.locationId));
  for (const van of vans) {
    for (const product of [w.cable, w.printer]) {
      const f = figures.get(van.locationId, product.id);
      expect(f.reserved, `${van.code} ${product.sku} reservations covered`).toBeLessThanOrEqual(assignableQuantity(product.serialised, f));
    }
  }
}

describe("driver changes overlapping job completion", () => {
  it("replacing the driver while the van's job completes: both succeed", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const job = await assigned(w.north.id, `C-${round}`);

      const results = await race(() => complete(job.id, "N-1", `DEAD-${round}`), () => drive(w.north.id, w.spare.id));

      expectOnlyBusinessRejections(results, []);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("COMPLETED");
      expect((await prisma.van.findUniqueOrThrow({ where: { id: w.north.id } })).currentTechnicianId).toBe(w.spare.id);
      await expectConsistent();
    }
  });

  it("moving the driver off the van while its job completes: the move waits for the job", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const job = await assigned(w.north.id, `C-${round}`);

      const [completion, move] = await race(() => complete(job.id, "N-1", `DEAD-${round}`), () => drive(w.south.id, w.nadia.id));

      expectOnlyBusinessRejections([completion, move], ["INVALID_STATE"]);
      expect(completion.status).toBe("fulfilled");
      await expectConsistent();
    }
  });
});

describe("driver changes overlapping cancellation", () => {
  it("replacing the driver while the van's job is cancelled", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const job = await assigned(w.north.id, `X-${round}`);

      const results = await race(() => cancel(job.id), () => drive(w.north.id, w.spare.id));

      expectOnlyBusinessRejections(results, []);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("CANCELLED");
      await expectConsistent();
    }
  });

  it("moving the driver off the van while its job is cancelled", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const job = await assigned(w.north.id, `X-${round}`);

      const [cancellation, move] = await race(() => cancel(job.id), () => drive(w.south.id, w.nadia.id));

      expectOnlyBusinessRejections([cancellation, move], ["INVALID_STATE"]);
      expect(cancellation.status).toBe("fulfilled");
      await expectConsistent();
    }
  });
});

describe("driver changes overlapping assignment and reassignment", () => {
  it("replacing the destination's driver while a job is assigned to it", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const job = await newJob(w, [{ productId: w.cable.id, quantity: 2 }], `A-${round}`);

      const results = await race(() => assignJob(job.id, { vanId: w.south.id, assignedBy: "Noor" }), () => drive(w.south.id, w.spare.id));

      expectOnlyBusinessRejections(results, []);
      expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId).toBe(w.spare.id);
      await expectConsistent();
    }
  });

  it("replacing the destination's driver while a job is reassigned to it", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const job = await assigned(w.north.id, `R-${round}`);

      const results = await race(
        () => reassignJob(job.id, { vanId: w.south.id, reason: "Closer", reassignedBy: "Noor" }),
        () => drive(w.south.id, w.spare.id),
      );

      expectOnlyBusinessRejections(results, []);
      expect(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ vanId: w.south.id, technicianId: w.spare.id });
      await expectConsistent();
    }
  });

  it("moving the driver off the source van while its job is reassigned away", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const job = await assigned(w.north.id, `R-${round}`);

      const results = await race(
        () => reassignJob(job.id, { vanId: w.south.id, reason: "Closer", reassignedBy: "Noor" }),
        () => drive(w.south.id, w.nadia.id),
      );

      expectOnlyBusinessRejections(results, ["INVALID_STATE", "NO_TECHNICIAN"]);
      await expectConsistent();
    }
  });
});

describe("the same two vans in opposite directions", () => {
  it("reassigns, transfers and swaps drivers both ways at once", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const northJob = await assigned(w.north.id, `N-${round}`);
      const southJob = await assigned(w.south.id, `S-${round}`);
      const transfer = (from: string, to: string) =>
        transferStock({ fromLocationId: from, toLocationId: to, productId: w.cable.id, quantity: 3, condition: "WORKING", performedBy: "Faris" });

      const results = await race(
        () => reassignJob(northJob.id, { vanId: w.south.id, reason: "Swap", reassignedBy: "Noor" }),
        () => reassignJob(southJob.id, { vanId: w.north.id, reason: "Swap", reassignedBy: "Noor" }),
        () => transfer(w.north.locationId, w.south.locationId),
        () => transfer(w.south.locationId, w.north.locationId),
      );

      expectOnlyBusinessRejections(results, []);
      await expectConsistent();
    }
  });

  it("moves drivers both ways while both vans' jobs complete or cancel", { timeout: TEST_TIMEOUT_MS }, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      await freshWorld();
      const northJob = await assigned(w.north.id, `N-${round}`);
      const southJob = await assigned(w.south.id, `S-${round}`);

      const results = await race(
        () => drive(w.south.id, w.nadia.id), // Nadia north → south
        () => drive(w.north.id, w.sam.id), // Sam south → north
        () => complete(northJob.id, "N-1", `DEAD-N-${round}`),
        () => cancel(southJob.id),
      );

      // A driver may not leave a van whose job is still assigned; that is a rule, not a failure.
      expectOnlyBusinessRejections(results, ["INVALID_STATE", "CONFLICT"]);
      expect(results[2].status).toBe("fulfilled");
      expect(results[3].status).toBe("fulfilled");
      await expectConsistent();
    }
  });
});

describe("retrying a transaction PostgreSQL aborted", () => {
  it("re-runs the whole transaction once, without duplicating its writes", { timeout: TEST_TIMEOUT_MS }, async () => {
    retriesAllowed = true;
    await freshWorld();
    const [a, b] = [w.north.locationId, w.south.locationId];
    let attempts = 0;

    // Deliberately take two locks in opposite orders (no real operation does this).
    const crossLock = (first: string, second: string, note: string) =>
      runInTransaction(async (tx) => {
        attempts++;
        await tx.stockCorrection.create({
          data: { locationId: first, productId: w.cable.id, condition: "WORKING", previousQuantity: 0, correctedQuantity: 0, reason: note, correctedBy: "test" },
        });
        await tx.$queryRaw`SELECT id FROM locations WHERE id = ${first} FOR UPDATE`;
        await new Promise((resolve) => setTimeout(resolve, 150));
        await tx.$queryRaw`SELECT id FROM locations WHERE id = ${second} FOR UPDATE`;
      });

    const results = await race(() => crossLock(a, b, "a-then-b"), () => crossLock(b, a, "b-then-a"));

    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(attempts).toBe(3); // one victim ran twice
    expect(warn.mock.calls.some((call) => String(call[0]).includes("40P01"))).toBe(true);
    expect(await prisma.stockCorrection.count()).toBe(2); // the aborted attempt left nothing behind
  });
});
