import { handle } from "@/server/http/route";
import { getVanStock } from "@/server/modules/inventory/inventory.service";

/** Working, broken, reserved, verified and available quantities per product. */
export async function GET(request: Request, ctx: RouteContext<"/api/vans/[vanId]/stock">) {
  return handle(request, async () => getVanStock((await ctx.params).vanId));
}
