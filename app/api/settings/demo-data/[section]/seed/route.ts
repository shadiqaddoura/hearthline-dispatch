import { demoSectionSchema } from "@/lib/contracts/demo-data";
import { handle } from "@/server/http/route";
import { AppError } from "@/server/http/errors";
import { seedDemoSection } from "@/server/modules/settings/demo-data.service";

export async function POST(request: Request, context: RouteContext<"/api/settings/demo-data/[section]/seed">) {
  return handle(request, async (user) => {
    const { section } = await context.params;
    const parsed = demoSectionSchema.safeParse(section.toUpperCase());
    if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Unsupported demo-data section.");
    return seedDemoSection(parsed.data, `${user.name} <${user.email}> [${user.id}]`);
  });
}
