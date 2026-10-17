import { handle } from "@/server/http/route";
import { deleteWarehouse } from "@/server/modules/inventory/warehouse-delete.service";

export async function DELETE(request: Request, ctx: RouteContext<"/api/inventory/locations/[locationId]">) {
  return handle(request, async () => deleteWarehouse((await ctx.params).locationId));
}
