// Shared by the API and (later) the frontend. No server-only imports here.
import { z } from "zod";

export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "INSUFFICIENT_STOCK"
  | "VAN_UNAVAILABLE"
  | "NO_TECHNICIAN"
  | "NEGATIVE_STOCK"
  | "CONFLICT";

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiFailure {
  error: { code: ApiErrorCode | "INTERNAL"; message: string; details?: unknown };
}

export const idSchema = z.string().trim().min(1);
/** Calendar day, "YYYY-MM-DD". */
export const isoDateSchema = z.iso.date();
/** Who performed an action. There is no authentication yet, so callers name themselves. */
export const actorSchema = z.string().trim().min(1, "Say who is doing this");
export const positiveIntSchema = z.number().int().positive();
export const serialsSchema = z.array(z.string().trim().min(1)).optional();

/** A quantity of one product, optionally with the serial numbers of the units. */
export const productQuantitySchema = z
  .object({ productId: idSchema, quantity: positiveIntSchema, serials: serialsSchema })
  .refine((line) => !line.serials || line.serials.length === line.quantity, {
    message: "When serials are given there must be one per unit",
    path: ["serials"],
  });

export type ProductQuantityInput = z.infer<typeof productQuantitySchema>;

export interface ProductRef {
  id: string;
  sku: string;
  name: string;
}
