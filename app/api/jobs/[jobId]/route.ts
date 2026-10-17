import { handle, readJson } from "@/server/http/route";
import { getJob } from "@/server/modules/jobs/jobs.service";
import { updateJob, deleteJob } from "@/server/modules/jobs/request.service";
import { updateJobRequest } from "@/lib/contracts/jobs";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/jobs/[jobId]">,
) {
  return handle(request, async () => getJob((await ctx.params).jobId));
}
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/jobs/[jobId]">,
) {
  return handle(request, async () =>
    updateJob(
      (await ctx.params).jobId,
      await readJson(request, updateJobRequest),
    ),
  );
}
export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/jobs/[jobId]">,
) {
  return handle(request, async () => deleteJob((await ctx.params).jobId));
}
