import { handle } from "@/server/http/route";
import { deleteWarehouse } from "@/server/modules/inventory/warehouse.service";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/inventory/locations/[locationId]">) {
  return handle(async () => deleteWarehouse((await ctx.params).locationId));
}
