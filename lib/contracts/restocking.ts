import { z } from "zod";
import { RestockStatus } from "@/generated/prisma/enums";
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
  outstanding: number;
  collected: number;
  pick: PickQuantityDto;
  /** The van balance is negative (imported); the pick list treats it as zero until reviewed. */
  balanceNeedsReview: boolean;
}

export interface RestockJobDto {
  id: string;
  van: { id: string; code: string };
  status: RestockStatus;
  closeReason: string | null;
  createdAt: string;
  items: RestockItemDto[];
  returns: { productId: string; sku: string; quantity: number; serials: string[]; returnedBy: string; returnedAt: string }[];
}
