import { handle, readJson } from "@/server/http/route";
import { correctStock } from "@/server/modules/inventory/inventory.service";
import { correctStockRequest } from "@/lib/contracts/inventory";

export async function POST(request: Request) {
  return handle(async () => correctStock(await readJson(request, correctStockRequest)), 201);
}
