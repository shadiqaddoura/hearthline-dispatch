import { z } from "zod";
import { IssueSeverity } from "@/generated/prisma/enums";

export const listIssuesQuery = z.object({
  severity: z.enum(IssueSeverity).optional(),
  sheet: z.string().optional(),
});

export interface ImportSummary {
  sourceRows: number;
  issues: Record<IssueSeverity, number>;
  products: number;
  vans: number;
  technicians: number;
  customers: number;
  branches: number;
  jobs: Record<string, number>;
  stockSnapshotsUsed: number;
  stockRowsSuperseded: number;
  movementsApplied: number;
  bookingsAssigned: number;
  bookingsBlocked: number;
}

export interface ImportBatchDto {
  id: string;
  fileName: string;
  importedAt: string;
  summary: ImportSummary;
}

export interface ImportIssueDto {
  id: string;
  severity: IssueSeverity;
  code: string;
  message: string;
  resolved: boolean;
  sheet: string | null;
  rowNumber: number | null;
  /** The original row, exactly as read from the sheet. */
  raw: unknown;
}
