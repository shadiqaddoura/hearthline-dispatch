import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import { updateVan } from "@/server/modules/fleet/fleet.service";
import { activeReservations, balance, createWorld, newJob, stockVan, type World } from "../support/world";

// Nadia drives V-N (north), Sam drives V-S (south), Tariq has no van.

let w: World;
beforeEach(async () => {
  w = await createWorld();
  await stockVan(w.north.locationId, w.cable.id, 10);
  await stockVan(w.south.locationId, w.cable.id, 10);
});

const driverOf = async (vanId: string) => (await prisma.van.findUniqueOrThrow({ where: { id: vanId } })).currentTechnicianId;

/** Every active job has a technician, and every ASSIGNED job's technician drives its van. */
async function expectNoStrandedJobs() {
  const jobs = await prisma.job.findMany({ where: { status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, include: { van: true } });
  for (const job of jobs) {
    expect(job.technicianId, `${job.reference} has no technician`).not.toBeNull();
    if (job.status === "ASSIGNED") expect(job.technicianId, `${job.reference} technician is not driving its van`).toBe(job.van?.currentTechnicianId);
  }
}

describe("moving a driver while a job is assigned to their van", () => {
  it("lets exactly one of them win, and never strands the job", async () => {
    for (let round = 0; round < 15; round++) {
      w = await createWorld();
      await stockVan(w.north.locationId, w.cable.id, 10);
      const job = await newJob(w, [{ productId: w.cable.id, quantity: 2 }]);

      const [assignment, move] = await Promise.allSettled([
        assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" }),
        updateVan(w.south.id, { technicianId: w.nadia.id, updatedBy: "Faris" }), // Nadia: north → south
      ]);

      if (assignment.status === "fulfilled") {
        // The job got Nadia first, so she cannot leave north.
        expect(move).toMatchObject({ status: "rejected", reason: { code: "INVALID_STATE" } });
        expect(await driverOf(w.north.id)).toBe(w.nadia.id);
        expect(await driverOf(w.south.id)).toBe(w.sam.id);
        expect(assignment.value.technician?.id).toBe(w.nadia.id);
      } else {
        // Nadia left first, so north has no driver to take the job.
        expect(assignment).toMatchObject({ reason: { code: "NO_TECHNICIAN" } });
        expect(move.status).toBe("fulfilled");
        expect(await driverOf(w.north.id)).toBeNull();
        expect(await driverOf(w.south.id)).toBe(w.nadia.id);
        expect(await activeReservations(job.id)).toHaveLength(0);
      }
      await expectNoStrandedJobs();
    }
  });

  it("serialises two moves of the same technician instead of failing on the unique driver", async () => {
    const results = await Promise.allSettled([
      updateVan(w.north.id, { technicianId: w.spare.id, updatedBy: "Faris" }),
      updateVan(w.south.id, { technicianId: w.spare.id, updatedBy: "Noor" }),
    ]);

    // Both are valid one after the other; the later one moves Tariq again.
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const drivers = [await driverOf(w.north.id), await driverOf(w.south.id)];
    expect(drivers.filter((d) => d === w.spare.id)).toHaveLength(1);
    expect(drivers).toContain(null);
  });
});

describe("driver moves", () => {
  it("refuses to move a driver off a van with an assigned job, and changes nothing", async () => {
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 2 }]);
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" });

    await expect(updateVan(w.south.id, { technicianId: w.nadia.id, updatedBy: "Faris" })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });

    expect(await driverOf(w.north.id)).toBe(w.nadia.id);
    expect(await driverOf(w.south.id)).toBe(w.sam.id);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId).toBe(w.nadia.id);
    await expectNoStrandedJobs();
  });

  it("moves a driver, hands the destination's assigned jobs over, and moves no stock", async () => {
    const southJob = await newJob(w, [{ productId: w.cable.id, quantity: 3 }]);
    await assignJob(southJob.id, { vanId: w.south.id, assignedBy: "Noor" });

    await updateVan(w.south.id, { technicianId: w.nadia.id, updatedBy: "Faris" });

    expect(await driverOf(w.south.id)).toBe(w.nadia.id);
    expect(await driverOf(w.north.id)).toBeNull();
    expect((await prisma.job.findUniqueOrThrow({ where: { id: southJob.id } })).technicianId).toBe(w.nadia.id);
    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await balance(w.south.locationId, w.cable.id)).toBe(10);
    expect(await prisma.stockMovement.count({ where: { type: { not: "OPENING_BALANCE" } } })).toBe(0);
    await expectNoStrandedJobs();
  });

  it("rejects assignment to the van a driver has just left", async () => {
    await updateVan(w.south.id, { technicianId: w.nadia.id, updatedBy: "Faris" });
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 1 }]);

    await expect(assignJob(job.id, { vanId: w.north.id, assignedBy: "Noor" })).rejects.toMatchObject({ code: "NO_TECHNICIAN" });
    expect(await activeReservations(job.id)).toHaveLength(0);
  });
});
