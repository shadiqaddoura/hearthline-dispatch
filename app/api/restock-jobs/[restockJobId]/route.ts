import { handle } from "@/server/http/route";
import { getRestockJob } from "@/server/modules/restocking/restock.service";

export async function GET(request: Request, ctx: RouteContext<"/api/restock-jobs/[restockJobId]">) {
  return handle(request, async () => getRestockJob((await ctx.params).restockJobId));
}
