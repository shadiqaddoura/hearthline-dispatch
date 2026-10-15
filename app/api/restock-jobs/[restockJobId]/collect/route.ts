import { handle, readJson } from "@/server/http/route";
import { confirmRestockCollection } from "@/server/modules/restocking/restock.service";
import { collectRestockRequest } from "@/lib/contracts/restocking";

/** Confirms what was collected at the hub (adds stock) and which broken units went back. */
export async function POST(request: Request, ctx: RouteContext<"/api/restock-jobs/[restockJobId]/collect">) {
  return handle(async () =>
    confirmRestockCollection((await ctx.params).restockJobId, await readJson(request, collectRestockRequest)),
  );
}
