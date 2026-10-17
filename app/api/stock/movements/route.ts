import { z } from "zod";
import { handle, readQuery } from "@/server/http/route";
import { listMovements } from "@/server/modules/inventory/inventory.service";

const query = z.object({
  locationId: z.string().optional(),
  productId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export async function GET(request: Request) {
  return handle(request, async () => listMovements(readQuery(request, query)));
}
