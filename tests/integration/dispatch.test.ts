import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { assignJob, findEligibleVans, getDispatchBoard, reassignJob } from "@/server/modules/dispatch/dispatch.service";
import { getVanStock, transferStock, verifyUnit } from "@/server/modules/inventory/inventory.service";
import { cancelJob, createJob, getJob, scheduleJob, startJob } from "@/server/modules/jobs/jobs.service";
import { activeReservations, balance, createWorld, newJob, serials, stockVan, type World } from "../support/world";

let w: World;
beforeEach(async () => {
  w = await createWorld();
});

const line = async (vanId: string, productId: string) => (await getVanStock(vanId)).lines.find((l) => l.productId === productId)!;

describe("assignment", () => {
  it("reserves stock without reducing physical stock", async () => {
    await stockVan(w.north.locationId, w.cable.id, 12);
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 4 }]);

    const assigned = await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    expect(assigned).toMatchObject({ status: "ASSIGNED", van: { code: "V-N" }, technician: { name: "Nadia" } });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(12);
    expect(await line(w.north.id, w.cable.id)).toMatchObject({ working: 12, reserved: 4, available: 8 });
  });

  it("does not count broken units as available", async () => {
    await stockVan(w.north.locationId, w.printer.id, 2, { condition: "BROKEN", serials: ["DEAD-1", "DEAD-2"] });
    await stockVan(w.north.locationId, w.printer.id, 1, { serials: ["P-1"] });
    const job = await newJob(w, [{ productId: w.printer.id, quantity: 2 }]);

    await expect(assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await activeReservations(job.id)).toHaveLength(0);
  });

  it("excludes serialised units awaiting verification until their serial is recorded", async () => {
    await stockVan(w.north.locationId, w.printer.id, 2); // counted, no serials
    const job = await newJob(w, [{ productId: w.printer.id, quantity: 1 }]);

    await expect(assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" })).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
      message: expect.stringContaining("serial verification"),
    });
    expect(await line(w.north.id, w.printer.id)).toMatchObject({ working: 2, needsVerification: 2, available: 0 });

    await verifyUnit({ locationId: w.north.locationId, productId: w.printer.id, serialNumber: "SN-777", verifiedBy: "Nadia" });
    await expect(assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" })).resolves.toMatchObject({ status: "ASSIGNED" });
  });

  it("refuses vans in the garage or sold, and vans without a driver", async () => {
    await stockVan(w.garage.locationId, w.cable.id, 20);
    await stockVan(w.south.locationId, w.cable.id, 20);
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 1 }]);

    await expect(assignJob(job.id, { vanId: w.garage.id, assignedBy: "Noor" })).rejects.toMatchObject({ code: "VAN_UNAVAILABLE" });
    await prisma.van.update({ where: { id: w.south.id }, data: { currentTechnicianId: null } });
    await expect(assignJob(job.id, { vanId: w.south.id, assignedBy: "Noor" })).rejects.toMatchObject({ code: "NO_TECHNICIAN" });
  });

  it("allows cross-zone vans but ranks the job's own zone first", async () => {
    await stockVan(w.north.locationId, w.cable.id, 5);
    await stockVan(w.south.locationId, w.cable.id, 5);
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 2 }]); // branch is in North

    const ranked = await findEligibleVans(job.id);
    expect(ranked.map((v) => [v.code, v.eligible, v.zoneMatch])).toEqual([
      ["V-N", true, true],
      ["V-S", true, false],
      ["V-G", false, true],
    ]);
    await expect(assignJob(job.id, { vanId: w.south.id, assignedBy: "Noor" })).resolves.toMatchObject({ status: "ASSIGNED" });
  });

  it("keeps an unservable request open with its request date and a blocking reason, and re-checks after a transfer", async () => {
    const job = await createJob({
      type: "DELIVERY",
      branchId: w.branch.id,
      requestedOn: "2026-10-02",
      items: [{ productId: w.cable.id, quantity: 8 }],
    });
    expect(job).toMatchObject({ status: "REQUESTED", requestedOn: "2026-10-02", blockingReason: "NO_ELIGIBLE_VAN" });

    await transferStock({
      fromLocationId: w.hub.id,
      toLocationId: w.north.locationId,
      productId: w.cable.id,
      quantity: 8,
      condition: "WORKING",
      performedBy: "Daniel",
    });
    expect(await getJob(job.id)).toMatchObject({ status: "REQUESTED", requestedOn: "2026-10-02", blockingReason: null });
  });
});

describe("concurrent assignments", () => {
  it("never reserves the last unit for two jobs", async () => {
    await stockVan(w.north.locationId, w.printer.id, 1, { serials: ["LAST-1"] });
    const first = await newJob(w, [{ productId: w.printer.id, quantity: 1 }]);
    const second = await newJob(w, [{ productId: w.printer.id, quantity: 1 }]);

    const results = await Promise.allSettled([
      assignJob(first.id, { vanId: w.north.id, assignedBy: "Noor" }),
      assignJob(second.id, { vanId: w.north.id, assignedBy: "Faris" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "INSUFFICIENT_STOCK" } });
    expect(await prisma.reservation.count({ where: { status: "ACTIVE" } })).toBe(1);
  });

  it("handles many simultaneous assignments against one van", async () => {
    await stockVan(w.north.locationId, w.cable.id, 5);
    const jobs = await Promise.all(Array.from({ length: 8 }, () => newJob(w, [{ productId: w.cable.id, quantity: 1 }])));

    const results = await Promise.allSettled(jobs.map((j) => assignJob(j.id, { vanId: w.north.id, assignedBy: "Noor" })));

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await line(w.north.id, w.cable.id)).toMatchObject({ working: 5, reserved: 5, available: 0 });
  });
});

describe("cancellation", () => {
  it("releases the job's reservations and leaves physical stock alone", async () => {
    await stockVan(w.north.locationId, w.cable.id, 12);
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 4 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    const cancelled = await cancelJob(job.id, { reason: "Customer postponed", cancelledBy: "Noor" });

    expect(cancelled.status).toBe("CANCELLED");
    expect(await activeReservations(job.id)).toHaveLength(0);
    expect(await prisma.reservation.findFirst({ where: { jobId: job.id } })).toMatchObject({ status: "RELEASED" });
    expect(await line(w.north.id, w.cable.id)).toMatchObject({ working: 12, reserved: 0, available: 12 });
  });

  it("cannot cancel a completed job", async () => {
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 1 }]);
    await prisma.job.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
    await expect(cancelJob(job.id, { reason: "Too late", cancelledBy: "Noor" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("reassignment", () => {
  it("moves the reservations to the new van in one step, without moving stock", async () => {
    await stockVan(w.north.locationId, w.cable.id, 10);
    await stockVan(w.south.locationId, w.cable.id, 10);
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 6 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    const moved = await reassignJob(job.id, { vanId: w.south.id, reason: "North van delayed", reassignedBy: "Noor" });

    expect(moved).toMatchObject({ status: "ASSIGNED", van: { code: "V-S" }, technician: { name: "Sam" } });
    const reservations = await activeReservations(job.id);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]).toMatchObject({ locationId: w.south.locationId, quantity: 6 });
    expect(await line(w.north.id, w.cable.id)).toMatchObject({ working: 10, reserved: 0 });
    expect(await line(w.south.id, w.cable.id)).toMatchObject({ working: 10, reserved: 6 });
  });

  it("leaves the original assignment intact when the destination cannot take the job", async () => {
    await stockVan(w.north.locationId, w.cable.id, 10);
    await stockVan(w.south.locationId, w.cable.id, 2);
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 6 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    await expect(
      reassignJob(job.id, { vanId: w.south.id, reason: "Try south", reassignedBy: "Noor" }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const reservations = await activeReservations(job.id);
    expect(reservations).toHaveLength(1);
    expect(reservations[0].locationId).toBe(w.north.locationId);
    expect((await getJob(job.id)).van?.code).toBe("V-N");
  });

  it("only counts the destination's own free stock", async () => {
    await stockVan(w.north.locationId, w.printer.id, 2, { serials: serials("N", 2) });
    await stockVan(w.south.locationId, w.printer.id, 1, { serials: ["S-1"] });
    const other = await newJob(w, [{ productId: w.printer.id, quantity: 1 }]);
    await assignJob(other.id, { vanId: w.south.id, assignedBy: "Noor" });
    const job = await newJob(w, [{ productId: w.printer.id, quantity: 1 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    await expect(reassignJob(job.id, { vanId: w.south.id, reason: "x", reassignedBy: "Noor" })).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
    });
  });
});

describe("dispatch board", () => {
  it("lists waiting requests and assigned work separately, counting waiting from the request date", async () => {
    await stockVan(w.north.locationId, w.cable.id, 10);
    const waiting = await newJob(w, [{ productId: w.cable.id, quantity: 1 }], "J-WAIT");
    const later = await newJob(w, [{ productId: w.cable.id, quantity: 1 }], "J-LATER");
    const first = await newJob(w, [{ productId: w.cable.id, quantity: 1 }], "J-FIRST");
    const unscheduled = await newJob(w, [{ productId: w.cable.id, quantity: 1 }], "J-UNSCHEDULED");
    await assignJob(later.id, { vanId: w.north.id, scheduledFor: "2099-10-20", sequence: 2, assignedBy: "Noor" });
    await assignJob(first.id, { vanId: w.north.id, scheduledFor: "2099-10-18", sequence: 1, assignedBy: "Noor" });
    await assignJob(unscheduled.id, { vanId: w.north.id, assignedBy: "Noor" });
    await scheduleJob(first.id, { scheduledFor: "2099-10-18", sequence: 1 });
    await startJob(first.id);

    const board = await getDispatchBoard("2026-10-16");

    expect(board.openRequests.map((j) => j.reference)).toEqual([waiting.reference]);
    expect(board.assignedWork.map((j) => [j.reference, j.status]).sort()).toEqual([
      ["J-FIRST", "IN_PROGRESS"],
      ["J-LATER", "ASSIGNED"],
      ["J-UNSCHEDULED", "ASSIGNED"],
    ]);
    // Requested 1 October: 15 days by 16 October, whatever the scheduled day.
    expect(board.assignedWork.every((j) => j.requestedOn === "2026-10-01" && j.waitingDays === 15)).toBe(true);

    const north = board.vans.find((v) => v.van.id === w.north.id)!;
    expect(north.assignedJobs.map((j) => j.reference)).toEqual(["J-FIRST", "J-LATER", "J-UNSCHEDULED"]);
    expect(north.stock.lines.find((l) => l.productId === w.cable.id)).toMatchObject({ working: 10, reserved: 3, available: 7 });
    expect(board.vans.find((v) => v.van.id === w.south.id)!.assignedJobs).toEqual([]);
  });
});
