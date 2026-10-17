import { clearAllDataRequest } from "@/lib/contracts/data-reset";
import { handle, readJson } from "@/server/http/route";
import { clearAllApplicationData, dataResetPreview } from "@/server/modules/settings/data-reset.service";

export async function GET(request: Request) {
  return handle(request, dataResetPreview);
}

export async function POST(request: Request) {
  return handle(request, async () => {
    const input = await readJson(request, clearAllDataRequest);
    return clearAllApplicationData(input.expected);
  });
}
