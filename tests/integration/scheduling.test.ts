import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { assignJob, getDispatchBoard } from "@/server/modules/dispatch/dispatch.service";
import { getVanStock } from "@/server/modules/inventory/inventory.service";
import { getJob, scheduleJob, startJob } from "@/server/modules/jobs/jobs.service";
import { scheduleJobRequest } from "@/lib/contracts/jobs";
import { assignJobRequest } from "@/lib/contracts/dispatch";
import { activeReservations, balance, createWorld, newJob, stockVan, type World } from "../support/world";

// Far-future days, so "no scheduling in the past" never depends on when the suite runs.
const DAY = "2099-10-18";
const NEXT_DAY = "2099-10-19";

let w: World;
beforeEach(async () => {
  w = await createWorld();
  await stockVan(w.north.locationId, w.cable.id, 10);
  await stockVan(w.south.locationId, w.cable.id, 10);
});

const cableJob = (reference: string, quantity = 2) => newJob(w, [{ productId: w.cable.id, quantity }], reference);
const cableLine = async (vanId: string) => (await getVanStock(vanId)).lines.find((l) => l.productId === w.cable.id)!;

describe("assigning with a schedule", () => {
  it("reserves stock and saves the day and position in one step, leaving the request date and physical stock alone", async () => {
    const job = await cableJob("J-1", 3);

    const assigned = await assignJob(job.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" });

    expect(assigned).toMatchObject({
      status: "ASSIGNED",
      van: { code: "V-N" },
      technician: { name: "Nadia" },
      scheduledFor: DAY, // the calendar day, exactly as sent
      sequence: 1,
      requestedOn: "2026-10-01",
    });
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await cableLine(w.north.id)).toMatchObject({ working: 10, reserved: 3, available: 7 });
    expect(await activeReservations(job.id)).toHaveLength(1);
  });

  it("rejects a taken position without reserving anything", async () => {
    await assignJob((await cableJob("J-1")).id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" });
    const second = await cableJob("J-2");

    await expect(
      assignJob(second.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("J-1 at #1") });

    expect(await getJob(second.id)).toMatchObject({ status: "REQUESTED", van: null, scheduledFor: null });
    expect(await activeReservations(second.id)).toHaveLength(0);
    expect(await cableLine(w.north.id)).toMatchObject({ reserved: 2 });
  });

  it("allows the same position on another day or another van", async () => {
    await assignJob((await cableJob("J-1")).id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" });

    await expect(
      assignJob((await cableJob("J-2")).id, { vanId: w.north.id, scheduledFor: NEXT_DAY, sequence: 1, assignedBy: "Noor" }),
    ).resolves.toMatchObject({ sequence: 1 });
    await expect(
      assignJob((await cableJob("J-3")).id, { vanId: w.south.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" }),
    ).resolves.toMatchObject({ sequence: 1 });
  });

  it("rejects a day in the past", async () => {
    const job = await cableJob("J-1");
    await expect(
      assignJob(job.id, { vanId: w.north.id, scheduledFor: "2020-01-01", assignedBy: "Noor" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await activeReservations(job.id)).toHaveLength(0);
  });

  it("never assigns or reserves twice when the same assignment is submitted again", async () => {
    const job = await cableJob("J-1");
    const request = { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" };

    await assignJob(job.id, request);
    await expect(assignJob(job.id, request)).rejects.toMatchObject({ code: "INVALID_STATE" });

    expect(await activeReservations(job.id)).toHaveLength(1);
    expect(await cableLine(w.north.id)).toMatchObject({ reserved: 2 });
  });

  it("lets only one of two simultaneous assignments take a position", async () => {
    const [a, b] = [await cableJob("J-A"), await cableJob("J-B")];
    const results = await Promise.allSettled([
      assignJob(a.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" }),
      assignJob(b.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Lena" }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    expect(await cableLine(w.north.id)).toMatchObject({ reserved: 2 }); // only the winner's reservation
  });
});

describe("rescheduling an assigned job", () => {
  it("changes only the day and position: same reservation, same stock, same request date", async () => {
    const job = await cableJob("J-1", 3);
    await assignJob(job.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" });
    const [reservationBefore] = await activeReservations(job.id);

    const moved = await scheduleJob(job.id, { scheduledFor: NEXT_DAY, sequence: 2 });

    expect(moved).toMatchObject({ scheduledFor: NEXT_DAY, sequence: 2, requestedOn: "2026-10-01", status: "ASSIGNED" });
    expect(await activeReservations(job.id)).toEqual([reservationBefore]);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await cableLine(w.north.id)).toMatchObject({ working: 10, reserved: 3, available: 7 });

    await expect(scheduleJob(job.id, { scheduledFor: null, sequence: null })).resolves.toMatchObject({
      scheduledFor: null,
      sequence: null,
      requestedOn: "2026-10-01",
    });
  });

  it("keeps the van's day in position order on the board after changes", async () => {
    const [a, b, c] = [await cableJob("J-A", 1), await cableJob("J-B", 1), await cableJob("J-C", 1)];
    await assignJob(a.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" });
    await assignJob(b.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 2, assignedBy: "Noor" });
    await assignJob(c.id, { vanId: w.north.id, assignedBy: "Noor" });

    await scheduleJob(a.id, { scheduledFor: DAY, sequence: 3 });
    await scheduleJob(c.id, { scheduledFor: DAY, sequence: 1 });

    const board = await getDispatchBoard("2026-10-16");
    const north = board.vans.find((v) => v.van.id === w.north.id)!;
    expect(north.assignedJobs.map((j) => [j.reference, j.sequence])).toEqual([
      ["J-C", 1],
      ["J-B", 2],
      ["J-A", 3],
    ]);
  });

  it("rejects a position another job holds, but lets a job keep its own", async () => {
    const [a, b] = [await cableJob("J-A", 1), await cableJob("J-B", 1)];
    await assignJob(a.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" });
    await assignJob(b.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 2, assignedBy: "Noor" });

    await expect(scheduleJob(b.id, { scheduledFor: DAY, sequence: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(scheduleJob(a.id, { scheduledFor: DAY, sequence: 1 })).resolves.toMatchObject({ sequence: 1 });
  });

  it("lets only one of two simultaneous reschedules take a position", async () => {
    const [a, b] = [await cableJob("J-A", 1), await cableJob("J-B", 1)];
    await assignJob(a.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 1, assignedBy: "Noor" });
    await assignJob(b.id, { vanId: w.north.id, scheduledFor: DAY, sequence: 2, assignedBy: "Noor" });

    const results = await Promise.allSettled([
      scheduleJob(a.id, { scheduledFor: NEXT_DAY, sequence: 1 }),
      scheduleJob(b.id, { scheduledFor: NEXT_DAY, sequence: 1 }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
  });

  it("rejects new past days but allows keeping an existing one", async () => {
    const job = await cableJob("J-1");
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });
    await expect(scheduleJob(job.id, { scheduledFor: "2020-01-01", sequence: null })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });

    // e.g. an imported visit whose day has passed: changing only its position is allowed.
    await prisma.job.update({ where: { id: job.id }, data: { scheduledFor: new Date("2020-01-01T00:00:00Z") } });
    await expect(scheduleJob(job.id, { scheduledFor: "2020-01-01", sequence: 4 })).resolves.toMatchObject({
      scheduledFor: "2020-01-01",
      sequence: 4,
    });
  });

  it("refuses a position for a job without a van, and changes to started jobs", async () => {
    const waiting = await cableJob("J-1");
    await expect(scheduleJob(waiting.id, { scheduledFor: DAY, sequence: 1 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(scheduleJob(waiting.id, { scheduledFor: DAY, sequence: null })).resolves.toMatchObject({
      scheduledFor: DAY,
      status: "REQUESTED",
    });

    const started = await cableJob("J-2");
    await assignJob(started.id, { vanId: w.north.id, assignedBy: "Noor" });
    await startJob(started.id);
    await expect(scheduleJob(started.id, { scheduledFor: DAY, sequence: null })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
  });
});

describe("request validation", () => {
  it("rejects a position without a day, and impossible dates", () => {
    expect(scheduleJobRequest.safeParse({ scheduledFor: null, sequence: 1 }).success).toBe(false);
    expect(scheduleJobRequest.safeParse({ scheduledFor: "2099-02-30", sequence: null }).success).toBe(false);
    expect(scheduleJobRequest.safeParse({ scheduledFor: "2099-10-18", sequence: 0 }).success).toBe(false);
    expect(assignJobRequest.safeParse({ vanId: "v", sequence: 1, assignedBy: "Noor" }).success).toBe(false);
    expect(assignJobRequest.safeParse({ vanId: "v", scheduledFor: "2099-10-18", sequence: 1, assignedBy: "Noor" }).success).toBe(true);
  });
});
