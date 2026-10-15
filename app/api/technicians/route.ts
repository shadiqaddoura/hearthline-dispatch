import { handle } from "@/server/http/route";
import { listTechnicians } from "@/server/modules/fleet/fleet.service";

export async function GET() {
  return handle(listTechnicians);
}
