import { handle, readJson } from "@/server/http/route";
import { transferStock } from "@/server/modules/inventory/inventory.service";
import { transferStockRequest } from "@/lib/contracts/inventory";

export async function POST(request: Request) {
  return handle(request, async () => transferStock(await readJson(request, transferStockRequest, "performedBy")), 201);
}
