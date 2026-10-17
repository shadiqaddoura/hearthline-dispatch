import { handle, readQuery } from "@/server/http/route";
import { listImportIssues } from "@/server/modules/import/import.service";
import { listIssuesQuery } from "@/lib/contracts/imports";

/** The rows that did not fit, each with its original sheet row. */
export async function GET(request: Request, ctx: RouteContext<"/api/imports/[batchId]/issues">) {
  return handle(request, async () => listImportIssues((await ctx.params).batchId, readQuery(request, listIssuesQuery)));
}
