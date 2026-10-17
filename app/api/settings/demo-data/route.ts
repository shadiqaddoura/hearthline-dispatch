import { handle } from "@/server/http/route";
import { demoDataOverview } from "@/server/modules/settings/demo-data.service";

export async function GET(request: Request) {
  return handle(request, demoDataOverview);
}
