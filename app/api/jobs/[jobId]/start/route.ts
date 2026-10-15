import { handle } from "@/server/http/route";
import { startJob } from "@/server/modules/jobs/jobs.service";

/** ASSIGNED → IN_PROGRESS (the technician is on site). */
export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[jobId]/start">) {
  return handle(async () => startJob((await ctx.params).jobId));
}
