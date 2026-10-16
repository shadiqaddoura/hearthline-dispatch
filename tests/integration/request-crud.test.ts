import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  completeJob,
  createJob,
  getJob,
  scheduleJob,
  startJob,
  cancelJob,
} from "@/server/modules/jobs/jobs.service";
import { updateJob, deleteJob } from "@/server/modules/jobs/request.service";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import {
  activeReservations,
  balance,
  createWorld,
  newJob,
  stockVan,
  type World,
} from "../support/world";
let w: World;
beforeEach(async () => {
  w = await createWorld();
});
const input = (quantity = 2) => ({
  type: "DELIVERY" as const,
  branchId: w.branch.id,
  requestedOn: "2026-10-02",
  items: [{ productId: w.cable.id, quantity }],
  notes: "Customer note",
});
describe("request CRUD safeguards", () => {
  it("creates and edits unassigned requirements without reserving or moving stock, then deletes unused work", async () => {
    await stockVan(w.north.locationId, w.cable.id, 10);
    const job = await createJob(input());
    const movements = await prisma.stockMovement.count();
    expect(job.status).toBe("REQUESTED");
    expect(await activeReservations(job.id)).toEqual([]);
    expect((await updateJob(job.id, input(4))).items[0].quantity).toBe(4);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await prisma.stockMovement.count()).toBe(movements);
    await deleteJob(job.id);
    expect(await prisma.job.findUnique({ where: { id: job.id } })).toBeNull();
    expect(await prisma.jobItem.count({ where: { jobId: job.id } })).toBe(0);
  });
  it("replaces reservations atomically using only free verified stock and keeps the request date through scheduling", async () => {
    await stockVan(w.north.locationId, w.printer.id, 3, {
      serials: ["ONE", "TWO"],
    });
    const job = await newJob(w, [{ productId: w.printer.id, quantity: 1 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Test" });
    const edit = {
      ...input(),
      items: [{ productId: w.printer.id, quantity: 2 }],
    };
    await updateJob(job.id, edit);
    expect(await activeReservations(job.id)).toMatchObject([{ quantity: 2 }]);
    const before = await prisma.reservation.findMany({
      where: { jobId: job.id },
      orderBy: { id: "asc" },
    });
    await expect(
      updateJob(job.id, {
        ...edit,
        notes: "Must roll back",
        items: [{ productId: w.printer.id, quantity: 3 }],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(
      await prisma.reservation.findMany({
        where: { jobId: job.id },
        orderBy: { id: "asc" },
      }),
    ).toEqual(before);
    expect((await getJob(job.id)).notes).toBe("Customer note");
    await scheduleJob(job.id, { scheduledFor: "2099-10-18", sequence: 1 });
    expect((await getJob(job.id)).requestedOn).toBe("2026-10-02");
    expect(await balance(w.north.locationId, w.printer.id)).toBe(3);
  });
  it("rejects a concurrent edit or assignment that would overpromise stock", async () => {
    await stockVan(w.north.locationId, w.cable.id, 5);
    const job = await createJob(input(1));
    const other = await createJob(input(1));
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Test" });
    const results = await Promise.allSettled([
      updateJob(job.id, input(5)),
      assignJob(other.id, { vanId: w.north.id, assignedBy: "Test" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const reservations = await prisma.reservation.aggregate({
      where: { status: "ACTIVE" },
      _sum: { quantity: true },
    });
    expect(reservations._sum.quantity).toBeLessThanOrEqual(5);
  });
  it("rejects invalid quantities, repeated products and unknown branches without changing work", async () => {
    const job = await createJob(input());
    for (const change of [
      input(0),
      input(1.5),
      { ...input(), items: [...input().items, ...input().items] },
      { ...input(), branchId: "missing" },
    ]) {
      await expect(updateJob(job.id, change)).rejects.toBeDefined();
    }
    expect((await getJob(job.id)).items[0].quantity).toBe(2);
  });
  it("refuses edits after execution starts and keeps assigned/cancelled history undeletable", async () => {
    await stockVan(w.north.locationId, w.cable.id, 10);
    const job = await createJob(input());
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Test" });
    await expect(deleteJob(job.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await startJob(job.id);
    await expect(updateJob(job.id, input(3))).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await cancelJob(job.id, {
      reason: "Customer cancelled",
      cancelledBy: "Test",
    });
    await expect(deleteJob(job.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    expect(await activeReservations(job.id)).toEqual([]);
    await expect(
      prisma.job.delete({ where: { id: job.id } }),
    ).rejects.toBeDefined();
  });
  it("rejects stale edits and leaves reservations untouched for metadata-only corrections", async () => {
    await stockVan(w.north.locationId, w.cable.id, 10);
    const job = await createJob(input());
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Test" });
    const before = await activeReservations(job.id);
    await expect(
      updateJob(job.id, { ...input(), expectedUpdatedAt: job.updatedAt }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const fresh = await getJob(job.id);
    await updateJob(job.id, {
      ...input(),
      notes: "Corrected notes",
      expectedUpdatedAt: fresh.updatedAt,
    });
    expect(await activeReservations(job.id)).toEqual(before);
  });
  it("preserves completed-job and stock history when edit and deletion are attempted", async () => {
    await stockVan(w.north.locationId, w.cable.id, 10);
    const job = await createJob(input());
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Test" });
    await completeJob(job.id, {
      completedBy: "Test",
      delivered: input().items,
      collectedBroken: [],
    });
    const completion = await prisma.jobCompletion.findUniqueOrThrow({
      where: { jobId: job.id },
      include: { lines: true },
    });
    await expect(updateJob(job.id, input(5))).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(deleteJob(job.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    expect(
      await prisma.jobCompletion.findUniqueOrThrow({
        where: { jobId: job.id },
        include: { lines: true },
      }),
    ).toEqual(completion);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(8);
  });
  it("protects imported requests and movement relationships even against direct database deletion", async () => {
    const job = await createJob(input());
    const batch = await prisma.importBatch.create({
      data: { fileName: "test.xlsx", summary: {} },
    });
    const row = await prisma.importSourceRow.create({
      data: { batchId: batch.id, sheet: "Requests", rowNumber: 1, raw: {} },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { importRowId: row.id },
    });
    await expect(deleteJob(job.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(
      prisma.job.delete({ where: { id: job.id } }),
    ).rejects.toBeDefined();
    const another = await createJob(input());
    const movement = await prisma.stockMovement.create({
      data: {
        type: "JOB_DELIVERY",
        productId: w.cable.id,
        condition: "WORKING",
        quantity: 1,
        performedBy: "Test",
        serials: [],
        jobId: another.id,
      },
    });
    await expect(deleteJob(another.id)).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(
      prisma.job.delete({ where: { id: another.id } }),
    ).rejects.toBeDefined();
    expect(
      (
        await prisma.stockMovement.findUniqueOrThrow({
          where: { id: movement.id },
        })
      ).jobId,
    ).toBe(another.id);
  });
});
