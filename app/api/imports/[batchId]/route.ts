import { handle } from "@/server/http/route";
import { getImportBatch } from "@/server/modules/import/import.service";

export async function GET(_request: Request, ctx: RouteContext<"/api/imports/[batchId]">) {
  return handle(async () => getImportBatch((await ctx.params).batchId));
}
