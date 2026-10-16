import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import { transferStock } from "@/server/modules/inventory/inventory.service";
import { completeJob } from "@/server/modules/jobs/jobs.service";
import { balance, createWorld, newJob, stockVan, type World } from "../support/world";

// A dead unit comes back into a van from a customer branch (job completion) or from
// the hub (restock collection, hub transfer). Its product and serial are its identity.

let w: World;
let terminal: { id: string };
let jobId: string;

beforeEach(async () => {
  w = await createWorld();
  terminal = await prisma.product.create({ data: { sku: "POS-T2", name: "POS terminal", serialised: true } });
  await stockVan(w.north.locationId, w.cable.id, 5);
  const job = await newJob(w, [{ productId: w.cable.id, quantity: 1 }]);
  jobId = job.id;
  await assignJob(jobId, { vanId: w.north.id, assignedBy: "Noor" });
});

const installedAt = (branchId: string, productId: string, serialNumber: string) =>
  prisma.equipmentUnit.create({
    data: { productId, serialNumber, verification: "VERIFIED", condition: "WORKING", status: "INSTALLED", branchId },
  });

const atHub = (productId: string, serialNumber: string, status: "AT_HUB" | "WRITTEN_OFF" = "AT_HUB") =>
  prisma.equipmentUnit.create({
    data: { productId, serialNumber, verification: "VERIFIED", condition: "BROKEN", status, locationId: status === "AT_HUB" ? w.hub.id : null },
  });

/** Completes the job: one cable installed, and a dead printer with this serial pulled out. */
const completeCollecting = (serial: string) =>
  completeJob(jobId, {
    completedBy: "Nadia",
    delivered: [{ productId: w.cable.id, quantity: 1 }],
    collectedBroken: [{ productId: w.printer.id, quantity: 1, serials: [serial] }],
  });

const fromHub = (vanLocationId: string, serial: string, productId = w.printer.id) =>
  transferStock({
    fromLocationId: w.hub.id,
    toLocationId: vanLocationId,
    productId,
    quantity: 1,
    condition: "WORKING",
    serials: [serial],
    performedBy: "Daniel",
  });

/** Nothing the completion could have written exists. */
async function expectJobUntouched() {
  expect((await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("ASSIGNED");
  expect(await prisma.stockMovement.count({ where: { jobId } })).toBe(0);
  expect(await balance(w.north.locationId, w.cable.id)).toBe(5);
  expect(await balance(w.north.locationId, w.printer.id, "BROKEN")).toBe(0);
}

describe("receiving a known serial", () => {
  it("rejects a terminal's serial submitted as a printer, and changes nothing", async () => {
    const before = await installedAt(w.branch.id, terminal.id, "T-1");

    await expect(completeCollecting("T-1")).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      details: { serialNumber: "T-1", recordedProduct: "POS-T2", submittedProduct: "PRN-80" },
    });

    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "T-1" } })).toEqual(before);
    await expectJobUntouched();
  });

  it("brings back a dead unit of the same product, keeping its identity", async () => {
    const before = await installedAt(w.branch.id, w.printer.id, "P-9");

    await completeCollecting("P-9");

    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "P-9" } })).toMatchObject({
      id: before.id,
      productId: w.printer.id,
      condition: "BROKEN",
      status: "IN_STOCK",
      locationId: w.north.locationId,
      branchId: null,
    });
    expect(await prisma.equipmentUnit.count({ where: { serialNumber: "P-9" } })).toBe(1);
    expect(await balance(w.north.locationId, w.printer.id, "BROKEN")).toBe(1);
  });

  it("receives a device back from the hub, keeping its identity", async () => {
    const before = await atHub(w.printer.id, "H-1");

    await fromHub(w.north.locationId, "H-1");

    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "H-1" } })).toMatchObject({
      id: before.id,
      productId: w.printer.id,
      status: "IN_STOCK",
      locationId: w.north.locationId,
    });
    expect(await balance(w.north.locationId, w.printer.id)).toBe(1);
  });

  it("rejects a device that is not where the movement says it comes from, and changes nothing", async () => {
    const otherBranch = await prisma.branch.create({ data: { customerId: (await prisma.customer.findFirstOrThrow()).id, name: "Mall" } });
    await installedAt(otherBranch.id, w.printer.id, "ELSEWHERE-1");
    await atHub(w.printer.id, "HUB-1");
    await atHub(w.printer.id, "GONE-1", "WRITTEN_OFF");
    await stockVan(w.south.locationId, w.printer.id, 1, { serials: ["VAN-1"] });
    const units = await prisma.equipmentUnit.findMany({ orderBy: { id: "asc" } });

    // Pulled out at this branch, but installed at another one / sitting at the hub.
    await expect(completeCollecting("ELSEWHERE-1")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(completeCollecting("HUB-1")).rejects.toMatchObject({ code: "CONFLICT" });
    await expectJobUntouched();
    // From the hub, but installed at a customer / written off / already in a van.
    await expect(fromHub(w.north.locationId, "ELSEWHERE-1")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fromHub(w.north.locationId, "GONE-1")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(fromHub(w.north.locationId, "VAN-1")).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await prisma.equipmentUnit.findMany({ orderBy: { id: "asc" } })).toEqual(units);
    expect(await balance(w.north.locationId, w.printer.id)).toBe(0);
    expect(await prisma.stockMovement.count({ where: { type: "TRANSFER" } })).toBe(0);
  });
});

describe("receiving a new serial", () => {
  it("creates exactly one device record", async () => {
    await fromHub(w.north.locationId, "NEW-1");

    expect(await prisma.equipmentUnit.findMany({ where: { serialNumber: "NEW-1" } })).toMatchObject([
      { productId: w.printer.id, verification: "VERIFIED", status: "IN_STOCK", locationId: w.north.locationId },
    ]);
    expect(await balance(w.north.locationId, w.printer.id)).toBe(1);
  });
});

describe("receiving the same serial twice at once", () => {
  // Jobs on two different vans: each completion locks only its own van, so the device
  // row lock and the unique serial constraint are all that stand between them.
  // (Two transfers from the hub would not race: both lock the hub location.)
  async function raceCompletions(serial: string) {
    await stockVan(w.north.locationId, w.cable.id, 1);
    await stockVan(w.south.locationId, w.cable.id, 1);
    const [northJob, southJob] = [await newJob(w, [{ productId: w.cable.id, quantity: 1 }]), await newJob(w, [{ productId: w.cable.id, quantity: 1 }])];
    await assignJob(northJob.id, { vanId: w.north.id, assignedBy: "Noor" });
    await assignJob(southJob.id, { vanId: w.south.id, assignedBy: "Noor" });
    const collect = (id: string) =>
      completeJob(id, {
        completedBy: "Nadia",
        delivered: [{ productId: w.cable.id, quantity: 1 }],
        collectedBroken: [{ productId: w.printer.id, quantity: 1, serials: [serial] }],
      });
    return Promise.allSettled([collect(northJob.id), collect(southJob.id)]);
  }
  const brokenInVans = async () =>
    (await balance(w.north.locationId, w.printer.id, "BROKEN")) + (await balance(w.south.locationId, w.printer.id, "BROKEN"));

  it("creates one device and counts it once when it is new", async () => {
    for (let round = 0; round < 10; round++) {
      const serial = `RACE-NEW-${round}`;
      const results = await raceCompletions(serial);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
      expect(await prisma.equipmentUnit.count({ where: { serialNumber: serial } })).toBe(1);
      expect(await brokenInVans()).toBe(round + 1);
    }
  });

  it("moves an existing device into only one van", async () => {
    for (let round = 0; round < 10; round++) {
      const serial = `RACE-OLD-${round}`;
      await installedAt(w.branch.id, w.printer.id, serial);
      const results = await raceCompletions(serial);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
      expect(await brokenInVans()).toBe(round + 1);
    }
  });
});
