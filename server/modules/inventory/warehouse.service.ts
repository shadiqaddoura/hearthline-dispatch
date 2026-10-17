import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { createWarehouseRequest, type CreateWarehouseRequest } from "@/lib/contracts/inventory";
import { lockLocations, runInTransaction } from "@/server/db/transaction";
import { AppError, invalidState, notFound } from "@/server/http/errors";
import { moveStock } from "./stock-ledger";

/** Configure the canonical hub once; retain its id and all movement references. */
export async function createWarehouse(input: CreateWarehouseRequest) {
  const data = createWarehouseRequest.parse(input);
  try {
    return await runInTransaction(async (tx) => {
      // Serialises setup requests even when no location exists yet.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(781234901)::text`;
      const hubs = await tx.location.findMany({ where: { kind: "HUB" } });
      if (hubs.length > 1) throw invalidState("Multiple warehouse locations need review before setup");
      const existing = hubs[0];
      if (existing) await lockLocations(tx, [existing.id]);
      const current = existing ? await tx.location.findUniqueOrThrow({ where: { id: existing.id } }) : null;
      if (current?.inventoryTracked) throw new AppError("CONFLICT", "The warehouse is already configured. Use an audited correction to change its count.");
      if (current && await tx.stockBalance.count({ where: { locationId: current.id } })) {
        throw invalidState("This warehouse already has stock balances; review them before setup");
      }
      const location = current
        ? await tx.location.update({ where: { id: current.id }, data: { name: data.name, inventoryTracked: true } })
        : await tx.location.create({ data: { kind: "HUB", name: data.name, inventoryTracked: true } });
      // Returned devices keep their identity. The physical count must include them.
      const units = await tx.equipmentUnit.findMany({ where: { locationId: location.id } });
      for (const unit of units) {
        const line = data.openingStock.find((line) => line.productId === unit.productId && line.condition === unit.condition);
        if (unit.status !== "AT_HUB" || !line) {
          throw invalidState("Existing warehouse equipment needs a matching physical opening count before setup");
        }
      }
      for (const line of data.openingStock) {
        if (!await tx.product.findUnique({ where: { id: line.productId } })) throw notFound("Product", line.productId);
        const recorded = units.filter((unit) => unit.productId === line.productId && unit.condition === line.condition);
        const serials = recorded.flatMap((unit) => unit.serialNumber ? [unit.serialNumber] : []);
        if (recorded.length > line.quantity) throw invalidState("The physical count cannot be below the warehouse's recorded devices");
        if (line.quantity === 0) continue;
        await moveStock(tx, {
          type: "OPENING_BALANCE", productId: line.productId, condition: line.condition,
          quantity: line.quantity, to: { locationId: location.id }, serials,
          performedBy: data.performedBy, note: data.note,
        });
      }
      return { locationId: location.id };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("CONFLICT", "A location with this name or a configured warehouse already exists");
    }
    throw error;
  }
}
