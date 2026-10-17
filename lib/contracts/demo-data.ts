import { z } from "zod";

export const demoSectionSchema = z.enum([
  "PRODUCTS",
  "CUSTOMERS",
  "FLEET",
  "INVENTORY",
  "DISPATCH",
  "RESTOCKING",
]);
export type DemoSection = z.infer<typeof demoSectionSchema>;

export interface DemoCategoryCount {
  category: string;
  count: number;
}

export interface DemoSeedPlanCount {
  category: string;
  willAdd: number;
  resultingTotal: number;
}

export interface DemoSectionPreview {
  section: DemoSection;
  title: string;
  description: string;
  records: string[];
  dependencies: string[];
  missingDependencies: string[];
  seedPlan: DemoSeedPlanCount[];
  dependencyAdditions: DemoCategoryCount[];
  seedBlockers: string[];
  seeded: DemoCategoryCount[];
  clearable: DemoCategoryCount[];
  preservedShared: DemoCategoryCount[];
  blockers: string[];
}

export interface DemoDataOverview {
  sections: DemoSectionPreview[];
}

export const clearDemoDataRequest = z.object({
  confirm: z.literal(true),
  expected: z.array(z.object({ category: z.string().min(1), count: z.number().int().positive() }).strict()),
}).strict();

export interface DemoMutationResult {
  section: DemoSection;
  message: string;
  affected: DemoCategoryCount[];
  overview: DemoDataOverview;
}
