import { z } from "zod";
import { StockCondition, StockMovementType } from "@/generated/prisma/enums";
import { actorSchema, idSchema, positiveIntSchema, serialsSchema } from "./common";

export const transferStockRequest = z
  .object({
    fromLocationId: idSchema,
    toLocationId: idSchema,
    productId: idSchema,
    quantity: positiveIntSchema,
    condition: z.enum(StockCondition).default("WORKING"),
    serials: serialsSchema,
    performedBy: actorSchema,
    note: z.string().trim().max(500).optional(),
  })
  .refine((t) => t.fromLocationId !== t.toLocationId, { message: "Source and destination must differ" })
  .refine((t) => !t.serials || t.serials.length === t.quantity, {
    message: "When serials are given there must be one per unit",
    path: ["serials"],
  });

export type TransferStockRequest = z.infer<typeof transferStockRequest>;

export const correctStockRequest = z.object({
  locationId: idSchema,
  productId: idSchema,
  condition: z.enum(StockCondition),
  countedQuantity: z.number().int().min(0),
  reason: z.string().trim().min(3, "A correction needs a reason"),
  correctedBy: actorSchema,
});

export type CorrectStockRequest = z.infer<typeof correctStockRequest>;

export const verifyUnitRequest = z.object({
  locationId: idSchema,
  productId: idSchema,
  serialNumber: z.string().trim().min(1),
  verifiedBy: actorSchema,
});

export type VerifyUnitRequest = z.infer<typeof verifyUnitRequest>;

/** One product at one location. All quantities in the product's base unit. */
export interface StockLineDto {
  productId: string;
  sku: string;
  name: string;
  baseUnit: string;
  serialised: boolean;
  /** Physical working count (may be negative only if imported that way). */
  working: number;
  /** Physical broken count: in the van, never available. */
  broken: number;
  /** Quantity promised to assigned jobs. */
  reserved: number;
  /** Serialised only: working units with a recorded serial. */
  verifiedWorking: number | null;
  /** Serialised only: working units counted but without a serial. */
  needsVerification: number | null;
  /** What a new job could still use here. */
  available: number;
  vanMinimum: number;
}

export interface LocationStockDto {
  locationId: string;
  locationName: string;
  vanId: string | null;
  lines: StockLineDto[];
}

export interface StockMovementDto {
  id: string;
  type: StockMovementType;
  productId: string;
  condition: StockCondition;
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  branchId: string | null;
  jobId: string | null;
  restockJobId: string | null;
  serials: string[];
  performedBy: string;
  note: string | null;
  createdAt: string;
}

export interface StockCorrectionDto {
  id: string;
  locationId: string;
  productId: string;
  condition: StockCondition;
  previousQuantity: number;
  correctedQuantity: number;
  reason: string;
  correctedBy: string;
  correctedAt: string;
}

export interface EquipmentUnitDto {
  id: string;
  productId: string;
  serialNumber: string | null;
  verification: "VERIFIED" | "NEEDS_VERIFICATION";
  condition: StockCondition;
  locationId: string | null;
}
