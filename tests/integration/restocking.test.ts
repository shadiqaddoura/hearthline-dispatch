import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { transferStock } from "@/server/modules/inventory/inventory.service";
import { createJob, getJob } from "@/server/modules/jobs/jobs.service";
import { confirmRestockCollection, listRestockJobs, recalculateAllRestockJobs } from "@/server/modules/restocking/restock.service";
import { balance, createWorld, stockVan, type World } from "../support/world";

let w: World;
beforeEach(async () => {
  w = await createWorld();
  // North: below minimum on cables (4/10) and paper (35/100 rolls); 3 working printers; 1 dead printer.
  await stockVan(w.north.locationId, w.cable.id, 4);
  await stockVan(w.north.locationId, w.paper.id, 35);
  await stockVan(w.north.locationId, w.printer.id, 3, { serials: ["P-1", "P-2", "P-3"] });
  await stockVan(w.north.locationId, w.printer.id, 1, { condition: "BROKEN", serials: ["DEAD-1"] });
  await recalculateAllRestockJobs();
});

const openListFor = async (vanCode: string) => (await listRestockJobs({ status: "OPEN" })).filter((j) => j.van.code === vanCode);

describe("restock jobs", () => {
  it("lists what to collect, ignoring broken stock and converting paper to boxes", async () => {
    const [list] = await openListFor("V-N");
    const bySku = Object.fromEntries(list.items.map((i) => [i.sku, i]));

    expect(bySku["CBL-ETH"].outstanding).toBe(6);
    expect(bySku["PAP-80"]).toMatchObject({ outstanding: 65, pick: { label: "1 box + 15 rolls", packsRoundedUp: 2 } });
    // 3 working printers meet the minimum of 3; the dead one does not count either way.
    expect(bySku["PRN-80"]).toBeUndefined();
  });

  it("creating the pick list does not change inventory", async () => {
    expect(await balance(w.north.locationId, w.cable.id)).toBe(4);
    expect(await balance(w.north.locationId, w.paper.id)).toBe(35);
  });

  it("keeps one open job per van and updates its pick list after movements", async () => {
    await transferStock({
      fromLocationId: w.north.locationId,
      toLocationId: w.south.locationId,
      productId: w.cable.id,
      quantity: 2,
      condition: "WORKING",
      performedBy: "Nadia",
    });

    const lists = await openListFor("V-N");
    expect(lists).toHaveLength(1);
    expect(lists[0].items.find((i) => i.sku === "CBL-ETH")?.outstanding).toBe(8);
    await expect(prisma.restockJob.create({ data: { vanId: w.north.id } })).rejects.toThrow();
  });

  it("adds stock only when collection is confirmed, and tracks broken returns separately", async () => {
    const [list] = await openListFor("V-N");

    const after = await confirmRestockCollection(list.id, {
      collectedBy: "Nadia",
      collected: [
        { productId: w.cable.id, quantity: 6 },
        { productId: w.paper.id, quantity: 50 },
      ],
      brokenReturned: [{ productId: w.printer.id, quantity: 1, serials: ["DEAD-1"] }],
    });

    expect(await balance(w.north.locationId, w.cable.id)).toBe(10);
    expect(await balance(w.north.locationId, w.paper.id)).toBe(85);
    expect(await balance(w.north.locationId, w.printer.id)).toBe(3);
    expect(await balance(w.north.locationId, w.printer.id, "BROKEN")).toBe(0);
    expect(after.returns).toMatchObject([{ sku: "PRN-80", quantity: 1, serials: ["DEAD-1"] }]);
    expect(after.items.find((i) => i.sku === "CBL-ETH")).toMatchObject({ collected: 6, outstanding: 0 });
    expect(after.items.find((i) => i.sku === "PAP-80")).toMatchObject({ collected: 50, outstanding: 15 });
    expect(after.status).toBe("OPEN");
    expect(await prisma.equipmentUnit.findUnique({ where: { serialNumber: "DEAD-1" } })).toMatchObject({ status: "AT_HUB" });
  });

  it("closes the job when the van is back at its minimums", async () => {
    const [list] = await openListFor("V-N");
    const after = await confirmRestockCollection(list.id, {
      collectedBy: "Nadia",
      collected: [
        { productId: w.cable.id, quantity: 6 },
        { productId: w.paper.id, quantity: 65 },
      ],
      brokenReturned: [],
    });

    expect(after.status).toBe("CLOSED");
    await expect(
      confirmRestockCollection(list.id, { collectedBy: "Nadia", collected: [{ productId: w.cable.id, quantity: 1 }], brokenReturned: [] }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("re-checks blocked requests once the van is restocked", async () => {
    const job = await createJob({
      type: "DELIVERY",
      branchId: w.branch.id,
      requestedOn: "2026-10-05",
      items: [{ productId: w.cable.id, quantity: 8 }],
    });
    expect(job.blockingReason).toBe("NO_ELIGIBLE_VAN");

    const [list] = await openListFor("V-N");
    await confirmRestockCollection(list.id, { collectedBy: "Nadia", collected: [{ productId: w.cable.id, quantity: 6 }], brokenReturned: [] });

    expect(await getJob(job.id)).toMatchObject({ status: "REQUESTED", blockingReason: null, requestedOn: "2026-10-05" });
  });
});

describe("pick-list details", () => {
  it("shows each item's minimum and working stock beside the backend's outstanding quantity", async () => {
    const [list] = await openListFor("V-N");

    expect(list.van).toMatchObject({ code: "V-N", status: "ACTIVE", technician: { name: "Nadia" } });
    expect(list.items.find((i) => i.sku === "CBL-ETH")).toMatchObject({ vanMinimum: 10, working: 4, outstanding: 6, collected: 0 });
    expect(list.items.find((i) => i.sku === "PAP-80")).toMatchObject({
      vanMinimum: 100,
      working: 35,
      outstanding: 65,
      pick: { quantity: 65, baseUnit: "roll", packUnit: "box", packSize: 50, fullPacks: 1, looseUnits: 15 },
    });
  });

  it("lists broken units awaiting return apart from working stock to collect", async () => {
    const [list] = await openListFor("V-N");

    expect(list.brokenAwaitingReturn).toEqual([
      { productId: w.printer.id, sku: "PRN-80", name: "Receipt printer", quantity: 1, baseUnit: "each", serials: ["DEAD-1"] },
    ]);
    expect(list.items.some((i) => i.sku === "PRN-80")).toBe(false); // the dead printer isn't netted into collection
  });

  it("keeps reservations out of the restock quantity", async () => {
    const job = await createJob({ type: "DELIVERY", branchId: w.branch.id, requestedOn: "2026-10-02", items: [{ productId: w.cable.id, quantity: 3 }] });
    await prisma.reservation.create({ data: { jobId: job.id, locationId: w.north.locationId, productId: w.cable.id, quantity: 3 } });
    await recalculateAllRestockJobs();

    const [list] = await openListFor("V-N");
    expect(list.items.find((i) => i.sku === "CBL-ETH")).toMatchObject({ working: 4, outstanding: 6 });
  });

  it("names products the policy keeps off the list, with the review flag, instead of adding them", async () => {
    const [list] = await openListFor("V-N"); // the van carries no kitchen displays (minimum 1, restocking off)

    expect(list.items.some((i) => i.sku === "KDS-15")).toBe(false);
    expect(list.policyExclusions).toEqual([
      expect.objectContaining({ sku: "KDS-15", vanMinimum: 1, working: 0, baseUnit: "each", needsReview: true }),
    ]);
    expect(await prisma.product.findUnique({ where: { id: w.display.id } })).toMatchObject({ autoRestock: false });
  });

  it("never creates jobs or changes stock when the list is read", async () => {
    const before = {
      jobs: await prisma.restockJob.count(),
      movements: await prisma.stockMovement.count(),
      balances: await prisma.stockBalance.findMany({ orderBy: [{ locationId: "asc" }, { productId: "asc" }, { condition: "asc" }] }),
    };

    await listRestockJobs({ status: "OPEN" });
    await listRestockJobs({ status: "OPEN" });

    expect(await prisma.restockJob.count()).toBe(before.jobs);
    expect(await prisma.stockMovement.count()).toBe(before.movements);
    expect(await prisma.stockBalance.findMany({ orderBy: [{ locationId: "asc" }, { productId: "asc" }, { condition: "asc" }] })).toEqual(before.balances);
  });
});
