import { z } from "zod";
import { actorSchema, idSchema, isoDateSchema } from "./common";
import type { VanDto } from "./fleet";
import type { LocationStockDto } from "./inventory";
import type { JobDto } from "./jobs";

export const assignJobRequest = z.object({
  vanId: idSchema,
  scheduledFor: isoDateSchema.optional(),
  sequence: z.number().int().min(1).optional(),
  assignedBy: actorSchema,
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
  /** Open requests, oldest request first. */
  openRequests: JobDto[];
  vans: {
    van: VanDto;
    stock: LocationStockDto;
    jobsToday: JobDto[];
  }[];
  date: string;
}
