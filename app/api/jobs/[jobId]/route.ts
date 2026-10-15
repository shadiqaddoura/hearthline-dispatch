import { handle } from "@/server/http/route";
import { getJob } from "@/server/modules/jobs/jobs.service";

export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[jobId]">) {
  return handle(async () => getJob((await ctx.params).jobId));
}
