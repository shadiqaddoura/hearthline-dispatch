import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import { correctStock } from "@/server/modules/inventory/inventory.service";
import { assignableQuantity } from "@/server/modules/inventory/availability";
import { loadStockFigures } from "@/server/modules/inventory/inventory.repository";
import { completeJob, getJob } from "@/server/modules/jobs/jobs.service";
import { activeReservations, balance, createWorld, newJob, stockVan, type World } from "../support/world";

// Two jobs on the north van, each with one unit reserved.

let w: World;
let jobA: { id: string; reference: string };
let jobB: { id: string; reference: string };

async function twoJobsOnNorth(productId: string) {
  jobA = await newJob(w, [{ productId, quantity: 1 }], "JOB-A");
  jobB = await newJob(w, [{ productId, quantity: 1 }], "JOB-B");
  await assignJob(jobA.id, { vanId: w.north.id, assignedBy: "Noor" });
  await assignJob(jobB.id, { vanId: w.north.id, assignedBy: "Noor" });
}

const complete = (jobId: string, productId: string, quantity: number, serials?: string[]) =>
  completeJob(jobId, { completedBy: "Nadia", delivered: [{ productId, quantity, serials }], collectedBroken: [] });

/** Nothing the completion could have written exists. */
async function expectUntouched(jobId: string) {
  expect((await getJob(jobId)).status).toBe("ASSIGNED");
  expect(await activeReservations(jobId)).toHaveLength(1);
  expect(await prisma.jobCompletion.count({ where: { jobId } })).toBe(0);
  expect(await prisma.stockMovement.count({ where: { jobId } })).toBe(0);
}

/** Every product on every van: active reservations are backed by assignable stock. */
async function expectAllReservationsCovered() {
  const vans = await prisma.van.findMany();
  const products = await prisma.product.findMany();
  const figures = await loadStockFigures(prisma, vans.map((v) => v.locationId));
  for (const van of vans) {
    for (const product of products) {
      const f = figures.get(van.locationId, product.id);
      expect(f.reserved, `${van.code} ${product.sku}`).toBeLessThanOrEqual(assignableQuantity(product.serialised, f));
    }
  }
}

beforeEach(async () => {
  w = await createWorld();
});

describe("completion respects other jobs' reservations", () => {
  it("rejects using a unit reserved for another job, and changes nothing", async () => {
    await stockVan(w.north.locationId, w.cable.id, 2);
    await twoJobsOnNorth(w.cable.id);

    await expect(complete(jobA.id, w.cable.id, 2)).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
      details: { shortBy: 1, reservedFor: ["JOB-B"] },
    });

    expect(await balance(w.north.locationId, w.cable.id)).toBe(2);
    await expectUntouched(jobA.id);
    expect(await activeReservations(jobB.id)).toHaveLength(1);
  });

  it("completes with the job's own reserved unit and keeps the other job covered", async () => {
    await stockVan(w.north.locationId, w.cable.id, 2);
    await twoJobsOnNorth(w.cable.id);

    await expect(complete(jobA.id, w.cable.id, 1)).resolves.toMatchObject({ alreadyCompleted: false });

    expect(await balance(w.north.locationId, w.cable.id)).toBe(1);
    expect(await activeReservations(jobB.id)).toHaveLength(1);
    expect((await getJob(jobB.id)).blockingReason).toBeNull();
    await expectAllReservationsCovered();
  });

  it("allows usage beyond the reservation from free stock", async () => {
    await stockVan(w.north.locationId, w.cable.id, 3);
    await twoJobsOnNorth(w.cable.id);

    await expect(complete(jobA.id, w.cable.id, 2)).resolves.toMatchObject({ alreadyCompleted: false });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(1);
    expect(await activeReservations(jobB.id)).toHaveLength(1);
    await expectAllReservationsCovered();
  });

  it("checks the serialised units actually taken, not only the count", async () => {
    // Two verified printers and one counted without a serial; one reserved for each job.
    await stockVan(w.north.locationId, w.printer.id, 2, { serials: ["P-1", "P-2"] });
    await stockVan(w.north.locationId, w.printer.id, 1);
    await twoJobsOnNorth(w.printer.id);

    // Without serials both verified units would go, leaving JOB-B nothing assignable.
    await expect(complete(jobA.id, w.printer.id, 2)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    // Naming both verified units is the same thing.
    await expect(complete(jobA.id, w.printer.id, 2, ["P-1", "P-2"])).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expectUntouched(jobA.id);
    expect(
      await prisma.equipmentUnit.count({ where: { serialNumber: { in: ["P-1", "P-2"] }, locationId: w.north.locationId, status: "IN_STOCK" } }),
    ).toBe(2);

    // P-1 plus the unit that had no serial: JOB-B keeps P-2.
    await expect(complete(jobA.id, w.printer.id, 2, ["P-1", "SN-NEW"])).resolves.toMatchObject({ alreadyCompleted: false });
    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "P-2" } })).toMatchObject({
      status: "IN_STOCK",
      locationId: w.north.locationId,
    });
    await expectAllReservationsCovered();
  });

  it("is still safe to retry", async () => {
    await stockVan(w.north.locationId, w.cable.id, 2);
    await twoJobsOnNorth(w.cable.id);
    await complete(jobA.id, w.cable.id, 1);
    const movements = await prisma.stockMovement.count({ where: { jobId: jobA.id } });

    await expect(complete(jobA.id, w.cable.id, 1)).resolves.toMatchObject({ alreadyCompleted: true });
    await expect(complete(jobA.id, w.cable.id, 2)).resolves.toMatchObject({ alreadyCompleted: true });

    expect(await balance(w.north.locationId, w.cable.id)).toBe(1);
    expect(await prisma.stockMovement.count({ where: { jobId: jobA.id } })).toBe(movements);
  });
});

describe("completion racing an assignment", () => {
  it("never lets both take the same unit", async () => {
    for (let round = 0; round < 15; round++) {
      w = await createWorld();
      await stockVan(w.north.locationId, w.cable.id, 2);
      const a = await newJob(w, [{ productId: w.cable.id, quantity: 1 }], "RACE-A");
      const b = await newJob(w, [{ productId: w.cable.id, quantity: 1 }], "RACE-B");
      await assignJob(a.id, { vanId: w.north.id, assignedBy: "Noor" });

      // A actually used both units; B wants one of them.
      const [completion, assignment] = await Promise.allSettled([
        complete(a.id, w.cable.id, 2),
        assignJob(b.id, { vanId: w.north.id, assignedBy: "Faris" }),
      ]);

      if (completion.status === "fulfilled") {
        expect(assignment).toMatchObject({ status: "rejected", reason: { code: "INSUFFICIENT_STOCK" } });
        expect(await balance(w.north.locationId, w.cable.id)).toBe(0);
      } else {
        expect(completion.reason).toMatchObject({ code: "INSUFFICIENT_STOCK" });
        expect(assignment.status).toBe("fulfilled");
        expect(await balance(w.north.locationId, w.cable.id)).toBe(2);
        await expectUntouched(a.id);
      }
      await expectAllReservationsCovered();
    }
  });
});

describe("shortfalls from other permitted operations", () => {
  it("flags assigned jobs when a lower count leaves them short, and clears the flag when covered", async () => {
    await stockVan(w.north.locationId, w.cable.id, 2);
    await twoJobsOnNorth(w.cable.id);
    const recount = (countedQuantity: number) =>
      correctStock({ locationId: w.north.locationId, productId: w.cable.id, condition: "WORKING", countedQuantity, reason: "Monday count", correctedBy: "Daniel" });

    await recount(1);
    for (const job of [jobA, jobB]) {
      expect(await getJob(job.id)).toMatchObject({
        status: "ASSIGNED",
        blockingReason: "RESERVATION_SHORTFALL",
        blockingDetail: expect.stringContaining("CBL-ETH: 2 reserved, 1 on hand"),
      });
    }

    await recount(2);
    for (const job of [jobA, jobB]) expect((await getJob(job.id)).blockingReason).toBeNull();
  });

  it("lets a job use its own share of an existing shortfall, and keeps the other flagged", async () => {
    await stockVan(w.north.locationId, w.cable.id, 2);
    await twoJobsOnNorth(w.cable.id);
    await correctStock({ locationId: w.north.locationId, productId: w.cable.id, condition: "WORKING", countedQuantity: 1, reason: "One missing", correctedBy: "Daniel" });

    await expect(complete(jobA.id, w.cable.id, 1)).resolves.toMatchObject({ alreadyCompleted: false });

    expect(await getJob(jobB.id)).toMatchObject({ status: "ASSIGNED", blockingReason: "RESERVATION_SHORTFALL" });
  });
});
