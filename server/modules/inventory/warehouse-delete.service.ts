import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { lockLocations, runInTransaction } from "@/server/db/transaction";
import { invalidState, notFound } from "@/server/http/errors";

/** Delete only an empty, history-free canonical warehouse location. */
export async function deleteWarehouse(locationId: string) {
  try {
    return await runInTransaction(async (tx) => {
      // Share the setup lock so creation and deletion cannot race on the canonical hub.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(781234901)::text`;
      const planned = await tx.location.findUnique({ where: { id: locationId } });
      if (!planned) throw notFound("Location", locationId);
      if (planned.kind !== "HUB") throw invalidState("Only a warehouse location can be deleted here");
      await lockLocations(tx, [planned.id]);
      const location = await tx.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location", locationId);

      const counts = await Promise.all([
        tx.stockBalance.count({ where: { locationId } }),
        tx.equipmentUnit.count({ where: { locationId } }),
        tx.reservation.count({ where: { locationId } }),
        tx.stockMovement.count({ where: { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } }),
        tx.stockCorrection.count({ where: { locationId } }),
      ]);
      const labels = ["product stock lines", "equipment units", "reservations", "stock movements", "stock corrections"];
      const dependencies = counts.flatMap((count, index) => count ? [`${count} ${labels[index]}`] : []);
      if (dependencies.length) {
        throw invalidState(`Cannot delete warehouse ${location.name}: ${dependencies.join(", ")}. Its stock or dependent history requires the location to remain.`, { dependencies });
      }
      await tx.location.delete({ where: { id: locationId } });
      return { locationId };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw invalidState("This warehouse has dependent records and cannot be deleted. Its stock and history were retained.");
    }
    throw error;
  }
}
