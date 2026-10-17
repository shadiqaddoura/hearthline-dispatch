import type { DemoDataOverview, DemoMutationResult, DemoSection, DemoSectionPreview } from "@/lib/contracts/demo-data";
import { getJson, sendJson } from "./client";

export const demoDataApi = {
  overview: (signal?: AbortSignal) => getJson<DemoDataOverview>("/api/settings/demo-data", { signal }),
  seed: (section: DemoSection) => sendJson<DemoMutationResult>("POST", `/api/settings/demo-data/${section.toLowerCase()}/seed`, {}),
  clear: (section: DemoSection, expected: DemoSectionPreview["clearable"]) => sendJson<DemoMutationResult>("POST", `/api/settings/demo-data/${section.toLowerCase()}/clear`, { confirm: true, expected }),
};
