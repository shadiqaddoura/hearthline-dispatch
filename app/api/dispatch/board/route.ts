import { z } from "zod";
import { handle, readQuery } from "@/server/http/route";
import { getDispatchBoard } from "@/server/modules/dispatch/dispatch.service";
import { isoDateSchema } from "@/lib/contracts/common";

const query = z.object({ date: isoDateSchema.optional() });

/** Open requests with waiting time, and every van with stock, driver and the day's jobs. */
export async function GET(request: Request) {
  return handle(async () => getDispatchBoard(readQuery(request, query).date));
}
