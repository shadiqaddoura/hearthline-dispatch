import { handle, readJson } from "@/server/http/route";
import { getVan, updateVan } from "@/server/modules/fleet/fleet.service";
import { updateVanRequest } from "@/lib/contracts/fleet";

export async function GET(_request: Request, ctx: RouteContext<"/api/vans/[vanId]">) {
  return handle(async () => getVan((await ctx.params).vanId));
}

/** Change status and/or driver. Stock never moves with a driver change. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/vans/[vanId]">) {
  return handle(async () => updateVan((await ctx.params).vanId, await readJson(request, updateVanRequest)));
}

import { deleteVan } from "@/server/modules/fleet/fleet-crud.service";
export async function DELETE(_request: Request, ctx: RouteContext<"/api/vans/[vanId]">) {
  return handle(async () => deleteVan((await ctx.params).vanId));
}
