import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import { completeJob, getJob } from "@/server/modules/jobs/jobs.service";
import { activeReservations, balance, createWorld, newJob, stockVan, type World } from "../support/world";

let w: World;
let jobId: string;

beforeEach(async () => {
  w = await createWorld();
  await stockVan(w.north.locationId, w.cable.id, 12);
  await stockVan(w.north.locationId, w.printer.id, 2, { serials: ["P-1", "P-2"] });
  const job = await newJob(w, [
    { productId: w.cable.id, quantity: 2 },
    { productId: w.printer.id, quantity: 1 },
  ]);
  jobId = job.id;
  await assignJob(jobId, { vanId: w.north.id, assignedBy: "Noor" });
});

/** Two cables and printer P-1 installed; dead printer DEAD-9 brought back. */
const input = () => ({
  completedBy: "Nadia",
  delivered: [
    { productId: w.cable.id, quantity: 2 },
    { productId: w.printer.id, quantity: 1, serials: ["P-1"] },
  ],
  collectedBroken: [{ productId: w.printer.id, quantity: 1, serials: ["DEAD-9"] }],
});

describe("job completion", () => {
  it("records what was delivered and collected, updates stock and consumes reservations", async () => {
    const result = await completeJob(jobId, input());

    expect(result).toMatchObject({ alreadyCompleted: false, job: { status: "COMPLETED" } });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await balance(w.north.locationId, w.printer.id)).toBe(1);
    expect(await balance(w.north.locationId, w.printer.id, "BROKEN")).toBe(1);
    expect(await activeReservations(jobId)).toHaveLength(0);
    expect(await prisma.reservation.count({ where: { jobId, status: "CONSUMED" } })).toBe(2);

    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "P-1" } })).toMatchObject({
      status: "INSTALLED",
      branchId: w.branch.id,
    });
    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "DEAD-9" } })).toMatchObject({
      status: "IN_STOCK",
      condition: "BROKEN",
      locationId: w.north.locationId,
    });
  });

  it("is safe to retry: a second completion changes nothing", async () => {
    await completeJob(jobId, input());
    const movementsAfterFirst = await prisma.stockMovement.count({ where: { jobId } });

    const retry = await completeJob(jobId, input());

    expect(retry.alreadyCompleted).toBe(true);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await balance(w.north.locationId, w.printer.id, "BROKEN")).toBe(1);
    expect(await prisma.stockMovement.count({ where: { jobId } })).toBe(movementsAfterFirst);
    expect(await prisma.jobCompletion.count({ where: { jobId } })).toBe(1);
  });

  it("deducts once when two completions arrive at the same time", async () => {
    const results = await Promise.all([completeJob(jobId, input()), completeJob(jobId, input())]);

    expect(results.map((r) => r.alreadyCompleted).sort()).toEqual([false, true]);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await prisma.jobCompletion.count({ where: { jobId } })).toBe(1);
  });

  it("refuses to deliver more than the van holds, and leaves everything as it was", async () => {
    const tooMuch = { ...input(), delivered: [{ productId: w.cable.id, quantity: 20 }] };

    await expect(completeJob(jobId, tooMuch)).rejects.toMatchObject({ code: "NEGATIVE_STOCK" });

    expect((await getJob(jobId)).status).toBe("ASSIGNED");
    expect(await activeReservations(jobId)).toHaveLength(2);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(12);
    expect(await balance(w.north.locationId, w.printer.id, "BROKEN")).toBe(0);
  });

  it("recalculates the van's restock list", async () => {
    await completeJob(jobId, input());
    const restock = await prisma.restockJob.findFirst({ where: { vanId: w.north.id, status: "OPEN" }, include: { items: true } });
    // Minimums: 10 cables (now 10) and 3 printers (now 1 working).
    expect(restock?.items.map((i) => [i.productId, i.outstandingQuantity])).toEqual(
      expect.arrayContaining([[w.printer.id, 2]]),
    );
    expect(restock?.items.some((i) => i.productId === w.cable.id)).toBe(false);
  });
});
