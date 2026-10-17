import { clearDemoDataRequest, demoSectionSchema } from "@/lib/contracts/demo-data";
import { handle, readJson } from "@/server/http/route";
import { clearDemoSection } from "@/server/modules/settings/demo-data.service";

export async function POST(request: Request, context: RouteContext<"/api/settings/demo-data/[section]/clear">) {
  return handle(request, async () => {
    const { section } = await context.params;
    const input = await readJson(request, clearDemoDataRequest);
    return clearDemoSection(demoSectionSchema.parse(section.toUpperCase()), input.expected);
  });
}
