import { clearDemoDataRequest, demoSectionSchema } from "@/lib/contracts/demo-data";
import { handle, readJson } from "@/server/http/route";
import { AppError } from "@/server/http/errors";
import { clearDemoSection } from "@/server/modules/settings/demo-data.service";

export async function POST(request: Request, context: RouteContext<"/api/settings/demo-data/[section]/clear">) {
  return handle(request, async () => {
    const { section } = await context.params;
    const input = await readJson(request, clearDemoDataRequest);
    const parsed = demoSectionSchema.safeParse(section.toUpperCase());
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Unsupported demo-data section.");
    return clearDemoSection(parsed.data, input.expected);
  });
}
