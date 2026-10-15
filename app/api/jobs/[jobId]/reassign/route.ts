import { handle, readJson } from "@/server/http/route";
import { reassignJob } from "@/server/modules/dispatch/dispatch.service";
import { reassignJobRequest } from "@/lib/contracts/dispatch";

export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[jobId]/reassign">) {
  return handle(async () => reassignJob((await ctx.params).jobId, await readJson(request, reassignJobRequest)));
}
