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

/** A one-time receipt into a tracked van location. The operation key makes retries safe. */
export const receiveStockRequest = z
  .object({
    operationKey: z.uuid(),
    locationId: idSchema,
    productId: idSchema,
    quantity: positiveIntSchema,
    condition: z.enum(StockCondition).default("WORKING"),
    serials: serialsSchema,
    performedBy: actorSchema,
    note: z.string().trim().min(3, "A reason or reference is required").max(500),
  })
  .refine((t) => !t.serials || t.serials.length <= t.quantity, {
    message: "There cannot be more serials than units received",
    path: ["serials"],
  });

export type ReceiveStockRequest = z.infer<typeof receiveStockRequest>;

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
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export interface InventoryLocationDto {
  locationId: string;
  locationName: string;
  kind: "VAN" | "HUB";
  inventoryTracked?: boolean;
  vanId: string | null;
  lines: StockLineDto[];
}

export interface InventoryDetailDto {
  locationId: string;
  productId: string;
  units: EquipmentUnitDto[];
  reservations: {
    id: string;
    jobReference: string;
    customer: string;
    branch: string;
    quantity: number;
    status: "ACTIVE" | "RELEASED" | "CONSUMED";
  }[];
  movements: StockMovementDto[];
}

export const createWarehouseRequest = z.object({
  name: z.string().trim().min(1).max(120),
  performedBy: actorSchema,
  note: z.string().trim().min(3).max(500),
  openingStock: z.array(z.object({
    productId: idSchema,
    quantity: z.number().int().min(0).max(100000),
    condition: z.enum(StockCondition).default("WORKING"),
  })).max(200).default([]),
}).refine((data) => new Set(data.openingStock.map((line) => `${line.productId}:${line.condition}`)).size === data.openingStock.length,
  { message: "List each product and condition only once", path: ["openingStock"] });
export type CreateWarehouseRequest = z.infer<typeof createWarehouseRequest>;
