import { handle } from "@/server/http/route";
import { listVans } from "@/server/modules/fleet/fleet.service";

export async function GET() {
  return handle(listVans);
}
