import { handle } from "@/server/http/route";
import { getInventoryDetail } from "@/server/modules/inventory/inventory.service";

export async function GET(_request: Request, ctx: RouteContext<"/api/inventory/[locationId]/[productId]">) {
  return handle(async () => {
    const { locationId, productId } = await ctx.params;
    return getInventoryDetail(locationId, productId);
  });
}
