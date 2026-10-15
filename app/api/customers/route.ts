import { handle } from "@/server/http/route";
import { listCustomers } from "@/server/modules/jobs/jobs.service";

/** Customers with their branches (job creation needs a branch id). */
export async function GET() {
  return handle(listCustomers);
}
