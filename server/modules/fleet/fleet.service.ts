import "server-only";
import { prisma } from "@/server/db/prisma";
import { lockJob, lockLocations, lockTechnician, runInTransaction, type Tx } from "@/server/db/transaction";
import { AppError, invalidState, notFound } from "@/server/http/errors";
import { recalculateRestockForLocations } from "@/server/modules/restocking/restock.service";
import { refreshBlockingReasons } from "@/server/modules/dispatch/dispatch.service";
import { fromIsoDate, todayIsoDate } from "@/lib/dates";
import type { TechnicianDto, UpdateVanRequest, VanDto } from "@/lib/contracts/fleet";
import { countActiveJobsOnVan, findVan, toVanDto, vanInclude } from "./fleet.repository";

export async function listVans(): Promise<VanDto[]> {
  const vans = await prisma.van.findMany({ include: vanInclude, orderBy: { code: "asc" } });
  return vans.map(toVanDto);
}

export async function getVan(vanId: string): Promise<VanDto> {
  const van = await findVan(prisma, vanId);
  if (!van) throw notFound("Van", vanId);
  return toVanDto(van);
}

export async function listTechnicians(): Promise<TechnicianDto[]> {
  const technicians = await prisma.technician.findMany({ include: { van: true }, orderBy: { name: "asc" } });
  return technicians.map((t) => ({ id: t.id, name: t.name, active: t.active, vanId: t.van?.id ?? null }));
}

/**
 * Changes a van's status and/or driver.
 *
 * - Stock stays with the van whatever happens here: it belongs to the vehicle's location.
 *   Moving it to another van is an explicit stock transfer.
 * - A van with assigned or in-progress jobs cannot leave service or lose its driver;
 *   those jobs must be reassigned first. This includes the van a technician is moved off.
 * - A new driver takes over the van's ASSIGNED jobs (the reserved stock is on this van).
 *   IN_PROGRESS jobs keep the technician who started them: that person is on site.
 *
 * Concurrency: the van and the technician's current van are both locked, so an
 * assignment to either van (which reads the driver under the same location lock)
 * runs entirely before or after this change. Locks follow the shared order: the
 * jobs handed over, then both locations, then the technician. Everything is re-read
 * under the locks; if the locked set no longer covers what must change (a job was
 * assigned or the technician moved in between), the transaction rolls back and is
 * retried, and after a few attempts a CONFLICT error is returned.
 */
export async function updateVan(vanId: string, input: UpdateVanRequest): Promise<VanDto> {
  for (let attempt = 1; ; attempt++) {
    try {
      await runInTransaction((tx) => applyVanUpdate(tx, vanId, input));
      break;
    } catch (error) {
      if (!(error instanceof LockSetChanged)) throw fleetWriteError(error);
      if (attempt === MAX_ATTEMPTS) {
        throw new AppError("CONFLICT", "The van or technician changed while this update was being saved; try again");
      }
    }
  }

  await refreshBlockingReasons();
  return getVan(vanId);
}

const MAX_ATTEMPTS = 3;

/** Thrown inside the transaction when the rows it locked no longer cover the change. */
class LockSetChanged extends Error {}

async function applyVanUpdate(tx: Tx, vanId: string, input: UpdateVanRequest) {
  // 1. Plan the locks from an unlocked read.
  const planned = await findVan(tx, vanId);
  if (!planned) throw notFound("Van", vanId);
  const newDriverId = input.technicianId ?? null;
  const changingDriver = input.technicianId !== undefined && input.technicianId !== planned.currentTechnicianId;
  const plannedTechnician = changingDriver && newDriverId ? await findTechnician(tx, newDriverId) : null;
  const plannedHandover = changingDriver && newDriverId ? await assignedJobIds(tx, vanId) : [];

  // 2. Lock in the shared order: jobs, then locations, then the technician.
  for (const jobId of plannedHandover) await lockJob(tx, jobId);
  await lockLocations(tx, [planned.locationId, ...(plannedTechnician?.van ? [plannedTechnician.van.locationId] : [])]);
  if (plannedTechnician) await lockTechnician(tx, plannedTechnician.id);

  // 3. Re-read under the locks. Anything that changed since step 1 means the locks are wrong.
  const van = await findVan(tx, vanId);
  if (!van) throw notFound("Van", vanId);
  const technician = changingDriver && newDriverId ? await findTechnician(tx, newDriverId) : null;
  const driverStillChanging = input.technicianId !== undefined && input.technicianId !== van.currentTechnicianId;
  if (driverStillChanging !== changingDriver || technician?.van?.id !== plannedTechnician?.van?.id) throw new LockSetChanged();
  const handover = driverStillChanging && newDriverId ? await assignedJobIds(tx, vanId) : [];
  if (handover.join() !== plannedHandover.join()) throw new LockSetChanged();

  // 4. Checks and writes, all against the locked state.
  const activeJobs = await countActiveJobsOnVan(tx, vanId);
  const leavingService = input.status !== undefined && input.status !== "ACTIVE" && van.status === "ACTIVE";
  if (leavingService && activeJobs > 0) {
    throw invalidState(`${van.code} cannot leave service; reassign these jobs first: ${(await tx.job.findMany({ where: { vanId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } }, select: { reference: true } })).map(j => j.reference).join(", ")}`);
  }

  if (driverStillChanging) {
    if (newDriverId === null) {
      if (activeJobs > 0) throw invalidState(`${van.code} has ${activeJobs} assigned job(s) that need a technician`);
    } else {
      if (!technician) throw notFound("Technician", newDriverId);
      if (!technician.active) throw invalidState(`${technician.name} is not an active technician`);
      if (technician.van) {
        // A technician drives one van at a time; leaving the other van must not strand its jobs.
        const otherJobs = await countActiveJobsOnVan(tx, technician.van.id);
        if (otherJobs > 0) {
          throw invalidState(`${technician.name} is driving ${technician.van.code}, which has ${otherJobs} assigned job(s)`);
        }
        await tx.van.update({ where: { id: technician.van.id }, data: { currentTechnicianId: null } });
      }
    }
    await tx.van.update({ where: { id: vanId }, data: { currentTechnicianId: newDriverId } });
    if (newDriverId && handover.length > 0) {
      await tx.job.updateMany({ where: { id: { in: handover } }, data: { technicianId: newDriverId } });
    }
  }

  if (input.code !== undefined && input.code !== van.code && await hasImportReference(tx, van)) {
    throw invalidState("This identifier is protected by imported source records; retain it for traceability.");
  }
  if (input.code !== undefined && input.code !== van.code) {
    // Rename the label, retaining the same location ID and every physical stock row.
    await tx.location.update({ where: { id: van.locationId }, data: { name: `Van ${input.code}` } });
  }
  if (input.code !== undefined || input.plate !== undefined || input.zone !== undefined || input.status !== undefined || input.statusNote !== undefined) {
    const statusChanged = input.status !== undefined && input.status !== van.status;
    await tx.van.update({
      where: { id: vanId },
      data: {
        code: input.code,
        plate: input.plate,
        zone: input.zone,
        status: input.status,
        statusNote: input.statusNote,
        statusSince: statusChanged ? fromIsoDate(todayIsoDate()) : undefined,
      },
    });
  }

  // A van that leaves service drops its open restock job; one returning gets a fresh one.
  if (driverStillChanging || (input.status !== undefined && input.status !== van.status)) {
    await recalculateRestockForLocations(tx, [van.locationId]);
  }
}

function findTechnician(tx: Tx, technicianId: string) {
  return tx.technician.findUnique({ where: { id: technicianId }, include: { van: true } });
}

/** The van's ASSIGNED jobs, sorted by id (the order their rows are locked in). */
async function assignedJobIds(tx: Tx, vanId: string) {
  const jobs = await tx.job.findMany({ where: { vanId, status: "ASSIGNED" }, select: { id: true }, orderBy: { id: "asc" } });
  return jobs.map((job) => job.id);
}

/** Database constraints remain the final arbiter for concurrent identifier/plate writes. */
export function fleetWriteError(error: unknown): unknown {
  const code = (error as { code?: string })?.code;
  if (code === "P2002") return new AppError("CONFLICT", "The vehicle identifier or registration plate is already in use.");
  if (code === "P2003") return invalidState("This van has dependent records and cannot be deleted. Retain its history and use Sold when appropriate.");
  return error;
}

// Imports preserve raw values rather than a direct van FK. Match trimmed leaf values
// without case sensitivity, just as planVans normalises imported identifiers.
export async function hasImportReference(tx: Tx, van: { code: string; plate: string | null }) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM import_source_rows
    WHERE EXISTS (
      SELECT 1 FROM jsonb_path_query(raw, '$.**') AS leaf(value)
      WHERE upper(btrim(leaf.value #>> '{}')) IN (upper(${van.code}), upper(${van.plate ?? van.code}))
    ) LIMIT 1`;
  return rows.length > 0;
}
