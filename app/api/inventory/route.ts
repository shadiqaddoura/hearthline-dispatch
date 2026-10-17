import { handle, readJson } from "@/server/http/route";
import { listInventoryLocations, receiveStock } from "@/server/modules/inventory/inventory.service";
import { receiveStockRequest } from "@/lib/contracts/inventory";

export async function GET(request: Request) {
  return handle(request, listInventoryLocations);
}

export async function POST(request: Request) {
  return handle(request, async () => receiveStock(await readJson(request, receiveStockRequest, "performedBy")), 201);
}
