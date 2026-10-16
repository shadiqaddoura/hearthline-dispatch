import { z } from "zod";
import { RestockStatus, type VanStatus } from "@/generated/prisma/enums";
import { actorSchema, productQuantitySchema } from "./common";

export const collectRestockRequest = z
  .object({
    collectedBy: actorSchema,
    /** Working stock picked at the hub and loaded on the van (base units, e.g. rolls). */
    collected: z.array(productQuantitySchema).default([]),
    /** Broken units handed back to the hub. Tracked separately from collected stock. */
    brokenReturned: z.array(productQuantitySchema).default([]),
  })
  .refine((body) => body.collected.length + body.brokenReturned.length > 0, {
    message: "Record at least one collected or returned line",
  });

export type CollectRestockRequest = z.infer<typeof collectRestockRequest>;

/** A base-unit quantity expressed the way the hub picks it. */
export interface PickQuantityDto {
  quantity: number;
  baseUnit: string;
  packUnit: string | null;
  packSize: number | null;
  fullPacks: number | null;
  looseUnits: number | null;
  /** Packs to pick if the hub only issues whole packs. */
  packsRoundedUp: number | null;
  label: string;
}

export interface RestockItemDto {
  productId: string;
  sku: string;
  name: string;
  /** Still to collect, in base units: max(0, van minimum − working stock), worked out by the backend. */
  outstanding: number;
  /** Already collected at the hub and added to the van under this job, in base units. */
  collected: number;
  pick: PickQuantityDto;
  /** The van's minimum for this product, in base units. */
  vanMinimum: number;
  /** Working units physically in the van now (broken excluded; reservations not subtracted). */
  working: number;
  /** The van balance is negative (imported); the pick list treats it as zero until reviewed. */
  balanceNeedsReview: boolean;
}

/** Broken units still in the van, waiting to go back to the hub. Never netted against collection. */
export interface BrokenAwaitingReturnDto {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  baseUnit: string;
  /** Serials of the broken units, where they were recorded. May be fewer than the quantity. */
  serials: string[];
}

/** A product below this van's minimum that the restocking policy keeps off the pick list. */
export interface PolicyExclusionDto {
  productId: string;
  sku: string;
  name: string;
  vanMinimum: number;
  working: number;
  baseUnit: string;
  /** Someone has flagged the policy as unsettled. */
  needsReview: boolean;
  note: string | null;
}

export interface RestockJobDto {
  id: string;
  van: {
    id: string;
    code: string;
    status: VanStatus;
    technician: { id: string; name: string } | null;
  };
  status: RestockStatus;
  closeReason: string | null;
  createdAt: string;
  /** When the pick list was last recalculated (it is, inside every stock change on the van). */
  updatedAt: string;
  items: RestockItemDto[];
  brokenAwaitingReturn: BrokenAwaitingReturnDto[];
  policyExclusions: PolicyExclusionDto[];
  /** Broken units already handed back under this job. */
  returns: { productId: string; sku: string; quantity: number; serials: string[]; returnedBy: string; returnedAt: string }[];
}
