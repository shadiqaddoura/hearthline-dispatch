import { z } from "zod";
import { actorSchema, idSchema, isoDateSchema } from "./common";
import type { VanDto } from "./fleet";
import type { LocationStockDto } from "./inventory";
import type { JobDto } from "./jobs";

export const assignJobRequest = z
  .object({
    vanId: idSchema,
    /** Optional first schedule, saved in the same transaction as the assignment. */
    scheduledFor: isoDateSchema.optional(),
    sequence: z.number().int().min(1).optional(),
    assignedBy: actorSchema,
  })
  .refine((a) => a.sequence === undefined || a.scheduledFor !== undefined, {
    message: "A position in the van's day needs a scheduled day",
    path: ["sequence"],
  });

export type AssignJobRequest = z.infer<typeof assignJobRequest>;

export const reassignJobRequest = z.object({
  vanId: idSchema,
  reason: z.string().trim().min(3),
  reassignedBy: actorSchema,
});

export type ReassignJobRequest = z.infer<typeof reassignJobRequest>;

export type VanProblemCode = "VAN_NOT_ACTIVE" | "NO_TECHNICIAN" | "INSUFFICIENT_STOCK" | "UNITS_NEED_VERIFICATION";

export interface StockShortageDto {
  productId: string;
  sku: string;
  required: number;
  available: number;
  /** Units physically in the van but not assignable until their serial is recorded. */
  needsVerification: number;
}

export interface VanEligibilityDto {
  vanId: string;
  code: string;
  zone: string | null;
  zoneMatch: boolean;
  technician: { id: string; name: string } | null;
  eligible: boolean;
  problems: { code: VanProblemCode; message: string }[];
  shortages: StockShortageDto[];
}

export interface DispatchBoardDto {
  /** Requests waiting for a van (REQUESTED), oldest request first. */
  openRequests: JobDto[];
  /** Customer work already on a van (ASSIGNED or IN_PROGRESS), oldest request first. */
  assignedWork: JobDto[];
  vans: {
    van: VanDto;
    stock: LocationStockDto;
    /** Every job scheduled on the board's date, including completed ones, in the van's order. */
    jobsToday: JobDto[];
    /** This van's assigned or in-progress jobs on any date: by scheduled day, then the van's order. */
    assignedJobs: JobDto[];
  }[];
  /** The day waiting time is counted to (London calendar day by default). */
  date: string;
}
