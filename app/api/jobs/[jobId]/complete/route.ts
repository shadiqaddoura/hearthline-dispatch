import { handle, readJson } from "@/server/http/route";
import { completeJob } from "@/server/modules/jobs/jobs.service";
import { completeJobRequest } from "@/lib/contracts/jobs";

/** Safe to retry: a second call returns `alreadyCompleted: true` and changes nothing. */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[jobId]/complete">) {
  return handle(async () => completeJob((await ctx.params).jobId, await readJson(request, completeJobRequest)));
}
