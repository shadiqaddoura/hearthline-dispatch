import { demoSectionSchema } from "@/lib/contracts/demo-data";
import { handle } from "@/server/http/route";
import { seedDemoSection } from "@/server/modules/settings/demo-data.service";

export async function POST(request: Request, context: RouteContext<"/api/settings/demo-data/[section]/seed">) {
  return handle(request, async (user) => {
    const { section } = await context.params;
    const parsed = demoSectionSchema.parse(section.toUpperCase());
    return seedDemoSection(parsed, `${user.name} <${user.email}> [${user.id}]`);
  });
}
