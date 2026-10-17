import "server-only";
import { runInTransaction, lockLocations } from "@/server/db/transaction";
import { invalidState, notFound } from "@/server/http/errors";
import { createVanRequest, type CreateVanRequest } from "@/lib/contracts/fleet";
import { toVanDto, vanInclude } from "./fleet.repository";
import { fleetWriteError, hasImportReference } from "./fleet.service";

export async function createVan(input: CreateVanRequest) {
  const data = createVanRequest.parse(input);
  try {
    return await runInTransaction(async (tx) => {
      // Same location workflow as the stock-book import; no stock, devices or restock history.
      const location = await tx.location.create({ data: { kind: "VAN", name: `Van ${data.code}` } });
      return toVanDto(await tx.van.create({ data: { ...data, locationId: location.id }, include: vanInclude }));
    });
  } catch (error) { throw fleetWriteError(error); }
}

export async function deleteVan(vanId: string) {
  try {
    return await runInTransaction(async (tx) => {
      const planned = await tx.van.findUnique({ where: { id: vanId } });
      if (!planned) throw notFound("Van", vanId);
      await lockLocations(tx, [planned.locationId]);
      // Block new FK references, even from writers outside the service workflow.
      await tx.$queryRaw`SELECT id FROM vans WHERE id = ${vanId} FOR UPDATE`;
      const van = await tx.van.findUnique({ where: { id: vanId } });
      if (!van) throw notFound("Van", vanId);
      const locationId = van.locationId;
      const counts = await Promise.all([
        tx.stockBalance.count({ where: { locationId } }),
        tx.equipmentUnit.count({ where: { locationId } }),
        tx.reservation.count({ where: { locationId } }),
        tx.job.count({ where: { vanId } }),
        tx.stockMovement.count({ where: { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } }),
        tx.restockJob.count({ where: { vanId } }),
        tx.stockCorrection.count({ where: { locationId } }),
      ]);
      const labels = ["stock balances", "equipment units", "reservations", "jobs", "stock movements", "restock records", "stock corrections"];
      const dependencies = counts.flatMap((count, i) => count ? [`${count} ${labels[i]}`] : []);
      if (await hasImportReference(tx, van)) dependencies.push("protected import source records");
      if (dependencies.length) throw invalidState(`Cannot permanently delete ${van.code}: ${dependencies.join(", ")}. Retain the record; use Sold when appropriate.`, { dependencies });
      await tx.van.delete({ where: { id: vanId } });
      await tx.location.delete({ where: { id: locationId } });
      return { id: vanId };
    });
  } catch (error) { throw fleetWriteError(error); }
}
