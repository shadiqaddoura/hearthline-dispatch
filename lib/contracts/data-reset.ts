import { z } from "zod";
import type { DemoCategoryCount } from "./demo-data";

export const CLEAR_ALL_CONFIRMATION = "CLEAR ALL DATA";

export interface DataResetPreview {
  counts: DemoCategoryCount[];
  total: number;
  preserved: string[];
}

export const clearAllDataRequest = z.object({
  confirmation: z.literal(CLEAR_ALL_CONFIRMATION),
  expected: z.array(z.object({ category: z.string().min(1), count: z.number().int().nonnegative() }).strict()),
}).strict();

export interface DataResetResult {
  message: string;
  cleared: DemoCategoryCount[];
  preview: DataResetPreview;
}
