import { handle, readJson } from "@/server/http/route";
import { getJob } from "@/server/modules/jobs/jobs.service";
import { updateJob, deleteJob } from "@/server/modules/jobs/request.service";
import { updateJobRequest } from "@/lib/contracts/jobs";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/jobs/[jobId]">,
) {
  return handle(async () => getJob((await ctx.params).jobId));
}
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/jobs/[jobId]">,
) {
  return handle(async () =>
    updateJob(
      (await ctx.params).jobId,
      await readJson(request, updateJobRequest),
    ),
  );
}
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/jobs/[jobId]">,
) {
  return handle(async () => deleteJob((await ctx.params).jobId));
}
