import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createVan, deleteVan } from "@/server/modules/fleet/fleet-crud.service";
import { updateVan } from "@/server/modules/fleet/fleet.service";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import { createWorld, newJob, stockVan, type World } from "../support/world";
let w: World;
beforeEach(async () => { w = await createWorld(); });
const input = { code: "CRUD-1", plate: "TEST-123", zone: "West", status: "ACTIVE" as const, statusNote: null };
describe("Fleet CRUD safety", () => {
  it("creates an empty location, updates metadata, and deletes only an unused van", async () => {
    const van = await createVan(input);
    expect(await prisma.stockBalance.count({ where: { locationId: van.locationId } })).toBe(0);
    expect(await prisma.equipmentUnit.count({ where: { locationId: van.locationId } })).toBe(0);
    await expect(createVan(input)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createVan({ ...input, code: "OTHER" })).rejects.toMatchObject({ code: "CONFLICT" });
    const edited = await updateVan(van.id, { code: "CRUD-2", plate: "TEST-456", zone: "East", updatedBy: "test" });
    expect(edited).toMatchObject({ code: "CRUD-2", plate: "TEST-456", zone: "East", locationId: van.locationId });
    expect(await prisma.location.findUnique({ where: { id: van.locationId } })).toMatchObject({ name: "Van CRUD-2" });
    await deleteVan(van.id);
    expect(await prisma.location.findUnique({ where: { id: van.locationId } })).toBeNull();
  });
  it("blocks leaving service with job references in the explanation", async () => {
    await stockVan(w.north.locationId, w.cable.id, 5);
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 1 }], "FLEET-ACTIVE");
    await assignJob(job.id, { vanId: w.north.id, assignedBy: "test" });
    await expect(updateVan(w.north.id, { status: "GARAGE", updatedBy: "test" })).rejects.toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("FLEET-ACTIVE") });
    await expect(deleteVan(w.north.id)).rejects.toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("jobs") });
  });
  it("blocks zero balance rows and imported records without deleting history", async () => {
    await prisma.stockBalance.create({ data: { locationId: w.garage.locationId, productId: w.cable.id, condition: "WORKING", quantity: 0 } });
    await expect(deleteVan(w.garage.id)).rejects.toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("stock balances") });
    const v = await createVan(input);
    await prisma.importBatch.create({ data: { fileName: "fleet-test", summary: {}, rows: { create: { sheet: "Vans", rowNumber: 1, raw: { van: `  ${v.code.toLowerCase()}  ` } } } } });
    await expect(deleteVan(v.id)).rejects.toMatchObject({ code: "INVALID_STATE", message: expect.stringContaining("import") });
    await expect(updateVan(v.id, { code: "RENAMED", updatedBy: "test" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it.each(["GARAGE", "SOLD"] as const)("refuses new customer work on a %s van", async (status) => {
    await stockVan(w.north.locationId, w.cable.id, 5);
    await updateVan(w.north.id, { status, updatedBy: "test" });
    const job = await newJob(w, [{ productId: w.cable.id, quantity: 1 }]);
    await expect(assignJob(job.id, { vanId: w.north.id, assignedBy: "test" })).rejects.toMatchObject({ code: "VAN_UNAVAILABLE" });
  });
  it.each(["equipment", "reservations", "movements", "restocking", "corrections"])("retains a van with %s, even without current stock", async (dependency) => {
    const v = w.garage;
    if (dependency === "equipment") await prisma.equipmentUnit.create({ data: { locationId: v.locationId, productId: w.printer.id, verification: "NEEDS_VERIFICATION", condition: "BROKEN", status: "AT_HUB" } });
    if (dependency === "reservations") {
      const job = await newJob(w, []);
      await prisma.reservation.create({ data: { locationId: v.locationId, productId: w.cable.id, jobId: job.id, quantity: 1, status: "RELEASED" } });
    }
    if (dependency === "movements") await prisma.stockMovement.create({ data: { fromLocationId: v.locationId, productId: w.cable.id, condition: "WORKING", type: "TRANSFER", quantity: 1, performedBy: "test" } });
    if (dependency === "restocking") await prisma.restockJob.create({ data: { vanId: v.id, status: "CLOSED" } });
    if (dependency === "corrections") await prisma.stockCorrection.create({ data: { locationId: v.locationId, productId: w.cable.id, condition: "WORKING", previousQuantity: 1, correctedQuantity: 0, reason: "test", correctedBy: "test" } });
    await expect(deleteVan(v.id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(await prisma.van.findUnique({ where: { id: v.id } })).not.toBeNull();
    expect(await prisma.location.findUnique({ where: { id: v.locationId } })).not.toBeNull();
  });
  it("serializes deletion against new assignments without orphaning jobs", async () => {
    const v = await createVan(input);
    await updateVan(v.id, { technicianId: w.spare.id, updatedBy: "test" });
    const job = await newJob(w, []);
    const [deleted, assigned] = await Promise.allSettled([deleteVan(v.id), assignJob(job.id, { vanId: v.id, assignedBy: "test" })]);
    expect(deleted.status === "fulfilled" && assigned.status === "fulfilled").toBe(false);
    const saved = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    if (assigned.status === "fulfilled") { expect(saved.vanId).toBe(v.id); expect(deleted.status).toBe("rejected"); }
    else expect(saved.status).toBe("REQUESTED");
  });
});
