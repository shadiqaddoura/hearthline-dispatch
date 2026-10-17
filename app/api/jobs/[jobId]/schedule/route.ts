import { handle, readJson } from "@/server/http/route";
import { scheduleJob } from "@/server/modules/jobs/jobs.service";
import { scheduleJobRequest } from "@/lib/contracts/jobs";

export async function PATCH(request: Request, ctx: RouteContext<"/api/jobs/[jobId]/schedule">) {
  return handle(request, async () => scheduleJob((await ctx.params).jobId, await readJson(request, scheduleJobRequest)));
}
