import "server-only";
import { prisma } from "@/server/db/prisma";
import { lockLocations, runInTransaction } from "@/server/db/transaction";
import { invalidState, notFound } from "@/server/http/errors";
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
 *   those jobs must be reassigned first.
 * - A new driver takes over the van's assigned jobs (the reserved stock is on this van).
 */
export async function updateVan(vanId: string, input: UpdateVanRequest): Promise<VanDto> {
  await runInTransaction(async (tx) => {
    const van = await findVan(tx, vanId);
    if (!van) throw notFound("Van", vanId);
    // Same lock as assignment, so a job cannot be assigned while the van is leaving service.
    await lockLocations(tx, [van.locationId]);
    const activeJobs = await countActiveJobsOnVan(tx, vanId);

    const leavingService = input.status !== undefined && input.status !== "ACTIVE" && van.status === "ACTIVE";
    if (leavingService && activeJobs > 0) {
      throw invalidState(`${van.code} has ${activeJobs} assigned job(s); reassign them before it leaves service`);
    }

    if (input.technicianId !== undefined && input.technicianId !== van.currentTechnicianId) {
      if (input.technicianId === null) {
        if (activeJobs > 0) throw invalidState(`${van.code} has ${activeJobs} assigned job(s) that need a technician`);
      } else {
        const technician = await tx.technician.findUnique({ where: { id: input.technicianId }, include: { van: true } });
        if (!technician) throw notFound("Technician", input.technicianId);
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
      await tx.van.update({ where: { id: vanId }, data: { currentTechnicianId: input.technicianId } });
      if (input.technicianId) {
        await tx.job.updateMany({
          where: { vanId, status: "ASSIGNED" },
          data: { technicianId: input.technicianId },
        });
      }
    }

    if (input.status !== undefined || input.statusNote !== undefined) {
      const statusChanged = input.status !== undefined && input.status !== van.status;
      await tx.van.update({
        where: { id: vanId },
        data: {
          status: input.status,
          statusNote: input.statusNote,
          statusSince: statusChanged ? fromIsoDate(todayIsoDate()) : undefined,
        },
      });
    }

    // A van that leaves service drops its open restock job; one returning gets a fresh one.
    await recalculateRestockForLocations(tx, [van.locationId]);
  });

  await refreshBlockingReasons();
  return getVan(vanId);
}
