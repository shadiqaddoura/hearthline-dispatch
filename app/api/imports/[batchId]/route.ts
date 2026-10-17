import { handle } from "@/server/http/route";
import { getImportBatch } from "@/server/modules/import/import.service";

export async function GET(request: Request, ctx: RouteContext<"/api/imports/[batchId]">) {
  return handle(request, async () => getImportBatch((await ctx.params).batchId));
}
