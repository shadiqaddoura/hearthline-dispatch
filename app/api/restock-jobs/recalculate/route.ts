import { handle } from "@/server/http/route";
import { recalculateAllRestockJobs } from "@/server/modules/restocking/restock.service";

/** Normally unnecessary (every stock change recalculates); useful after a policy change. */
export async function POST(request: Request) {
  return handle(request, recalculateAllRestockJobs);
}
