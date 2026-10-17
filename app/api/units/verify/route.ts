import { handle, readJson } from "@/server/http/route";
import { verifyUnit } from "@/server/modules/inventory/inventory.service";
import { verifyUnitRequest } from "@/lib/contracts/inventory";

/** Records the serial of a counted unit, making it assignable. */
export async function POST(request: Request) {
  return handle(request, async () => verifyUnit(await readJson(request, verifyUnitRequest, "verifiedBy")));
}
