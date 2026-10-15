import { handle } from "@/server/http/route";
import { findEligibleVans } from "@/server/modules/dispatch/dispatch.service";

/** Every van ranked for this job (eligible, then same zone), with reasons for the rest. */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[jobId]/eligible-vans">) {
  return handle(async () => findEligibleVans((await ctx.params).jobId));
}
