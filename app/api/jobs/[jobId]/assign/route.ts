import { handle, readJson } from "@/server/http/route";
import { assignJob } from "@/server/modules/dispatch/dispatch.service";
import { assignJobRequest } from "@/lib/contracts/dispatch";

export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[jobId]/assign">) {
  return handle(async () => assignJob((await ctx.params).jobId, await readJson(request, assignJobRequest)));
}
