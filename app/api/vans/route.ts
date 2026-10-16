import { handle, readJson } from "@/server/http/route";
import { listVans } from "@/server/modules/fleet/fleet.service";

export async function GET() {
  return handle(listVans);
}

import { createVanRequest } from "@/lib/contracts/fleet";
import { createVan } from "@/server/modules/fleet/fleet-crud.service";
export async function POST(request: Request) {
  return handle(async () => createVan(await readJson(request, createVanRequest)), 201);
}
