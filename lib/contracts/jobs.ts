import { z } from "zod";
import {
  BlockingReason,
  JobStatus,
  JobType,
  ReservationStatus,
} from "@/generated/prisma/enums";
import {
  actorSchema,
  idSchema,
  isoDateSchema,
  positiveIntSchema,
  productQuantitySchema,
} from "./common";

export const createJobRequest = z.object({
  reference: z.string().trim().min(1).optional(),
  type: z.enum(JobType),
  branchId: idSchema,
  /** The day the customer asked. Kept as-is for "how long has it waited". */
  requestedOn: isoDateSchema,
  items: z
    .array(z.object({ productId: idSchema, quantity: positiveIntSchema }))
    .min(1, "A job needs at least one required item")
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      {
        message: "List each product once",
      },
    ),
  notes: z.string().trim().max(2000).optional(),
});

// Updates are explicit request edits; scheduling never accepts these fields.
export const updateJobRequest = createJobRequest
  .omit({ reference: true })
  .extend({
    requestedOn: isoDateSchema.nullable(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  });
export type UpdateJobRequest = z.infer<typeof updateJobRequest>;

export type CreateJobRequest = z.infer<typeof createJobRequest>;

export const listJobsQuery = z.object({
  status: z.enum(JobStatus).optional(),
  /** "true" returns REQUESTED, ASSIGNED and IN_PROGRESS jobs. */
  open: z.enum(["true", "false"]).optional(),
});

export const scheduleJobRequest = z
  .object({
    /** Calendar day of the visit. Separate from requestedOn, which never changes. */
    scheduledFor: isoDateSchema.nullable(),
    /** Position in the van's day, set manually by dispatch. */
    sequence: z.number().int().min(1).nullable(),
  })
  .refine((s) => s.sequence === null || s.scheduledFor !== null, {
    message: "A position in the van's day needs a scheduled day",
    path: ["sequence"],
  });

export type ScheduleJobRequest = z.infer<typeof scheduleJobRequest>;

export const cancelJobRequest = z.object({
  reason: z.string().trim().min(3),
  cancelledBy: actorSchema,
});

export type CancelJobRequest = z.infer<typeof cancelJobRequest>;

export const completeJobRequest = z.object({
  completedBy: actorSchema,
  /** What was actually delivered or installed (may differ from what was required). */
  delivered: z.array(productQuantitySchema).default([]),
  /** Dead units pulled out at the branch and brought back in the van. */
  collectedBroken: z.array(productQuantitySchema).default([]),
  note: z.string().trim().max(2000).optional(),
});

export type CompleteJobRequest = z.infer<typeof completeJobRequest>;

export interface JobItemDto {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
}

export interface ReservationDto {
  id: string;
  locationId: string;
  productId: string;
  quantity: number;
  status: ReservationStatus;
}

export interface JobDto {
  /** Server-computed deletion restriction; mutations always recheck under lock. */
  deletionBlockedReason?: string | null;
  updatedAt?: string;
  id: string;
  reference: string;
  type: JobType;
  status: JobStatus;
  blockingReason: BlockingReason | null;
  blockingDetail: string | null;
  /** Status text from the imported sheet, kept when it could not be mapped with confidence. */
  sourceStatus: string | null;
  customer: { id: string; name: string };
  branch: { id: string; name: string; zone: string | null };
  requestedOn: string | null;
  /** Days since requestedOn, for open jobs. */
  waitingDays: number | null;
  scheduledFor: string | null;
  sequence: number | null;
  van: { id: string; code: string } | null;
  technician: { id: string; name: string } | null;
  items: JobItemDto[];
  activeReservations: ReservationDto[];
  completedOn: string | null;
  notes: string | null;
}

export interface CompleteJobResult {
  job: JobDto;
  /** True when the job had already been completed: nothing was changed. */
  alreadyCompleted: boolean;
}
