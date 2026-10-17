import { handle, readJson } from "@/server/http/route";
import { getVan, updateVan } from "@/server/modules/fleet/fleet.service";
import { updateVanRequest } from "@/lib/contracts/fleet";

export async function GET(request: Request, ctx: RouteContext<"/api/vans/[vanId]">) {
  return handle(request, async () => getVan((await ctx.params).vanId));
}

/** Change status and/or driver. Stock never moves with a driver change. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/vans/[vanId]">) {
  return handle(request, async () => updateVan((await ctx.params).vanId, await readJson(request, updateVanRequest, "updatedBy")));
}

import { deleteVan } from "@/server/modules/fleet/fleet-crud.service";
export async function DELETE(request: Request, ctx: RouteContext<"/api/vans/[vanId]">) {
  return handle(request, async () => deleteVan((await ctx.params).vanId));
}
