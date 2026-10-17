import { createWarehouseRequest } from "@/lib/contracts/inventory";
import { handle, readJson } from "@/server/http/route";
import { createWarehouse } from "@/server/modules/inventory/warehouse.service";

export async function POST(request: Request) {
  return handle(async () => createWarehouse(await readJson(request, createWarehouseRequest)), 201);
}
