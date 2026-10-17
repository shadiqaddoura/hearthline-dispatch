import { handle, readJson } from "@/server/http/route";
import { cancelJob } from "@/server/modules/jobs/jobs.service";
import { cancelJobRequest } from "@/lib/contracts/jobs";

export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[jobId]/cancel">) {
  return handle(request, async () => cancelJob((await ctx.params).jobId, await readJson(request, cancelJobRequest, "cancelledBy")));
}
