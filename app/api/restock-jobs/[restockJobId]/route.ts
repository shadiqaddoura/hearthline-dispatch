import { handle } from "@/server/http/route";
import { getRestockJob } from "@/server/modules/restocking/restock.service";

export async function GET(_request: Request, ctx: RouteContext<"/api/restock-jobs/[restockJobId]">) {
  return handle(async () => getRestockJob((await ctx.params).restockJobId));
}
