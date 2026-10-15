import { z } from "zod";
import { handle, readQuery } from "@/server/http/route";
import { listRestockJobs } from "@/server/modules/restocking/restock.service";
import { RestockStatus } from "@/generated/prisma/enums";

const query = z.object({ status: z.enum(RestockStatus).optional() });

export async function GET(request: Request) {
  return handle(async () => listRestockJobs(readQuery(request, query)));
}
