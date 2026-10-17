import "server-only";
import type { Tx } from "@/server/db/transaction";
import type { VanDto } from "@/lib/contracts/fleet";
import type { Prisma } from "@/generated/prisma/client";

export const HUB_LOCATION_NAME = "Hub";

export const vanInclude = { currentTechnician: true } as const;
export type VanRow = Prisma.VanGetPayload<{ include: typeof vanInclude }>;

/** Preserve the canonical hub identity, including after warehouse setup renames it. */
export async function getHubLocation(tx: Tx) {
  const existing = await tx.location.findFirst({ where: { kind: "HUB" } });
  if (existing) return existing;
  return tx.location.upsert({
    where: { name: HUB_LOCATION_NAME },
    create: { name: HUB_LOCATION_NAME, kind: "HUB" },
    update: {},
  });
}

export function findVan(tx: Tx, vanId: string) {
  return tx.van.findUnique({ where: { id: vanId }, include: vanInclude });
}

/** Jobs that are on the van right now and depend on it and its driver. */
export function countActiveJobsOnVan(tx: Tx, vanId: string) {
  return tx.job.count({ where: { vanId, status: { in: ["ASSIGNED", "IN_PROGRESS"] } } });
}

export function toVanDto(van: VanRow): VanDto {
  return {
    id: van.id,
    code: van.code,
    plate: van.plate,
    zone: van.zone,
    status: van.status,
    statusNote: van.statusNote,
    isPool: van.isPool,
    locationId: van.locationId,
    technician: van.currentTechnician ? { id: van.currentTechnician.id, name: van.currentTechnician.name } : null,
  };
}
