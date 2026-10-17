import { handle } from "@/server/http/route";
import { startJob } from "@/server/modules/jobs/jobs.service";

/** ASSIGNED → IN_PROGRESS (the technician is on site). */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[jobId]/start">) {
  return handle(request, async () => startJob((await ctx.params).jobId));
}
