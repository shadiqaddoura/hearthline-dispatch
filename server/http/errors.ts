import type { ApiErrorCode } from "@/lib/contracts/common";

/**
 * The one error type services throw for expected failures. Route handlers turn
 * it into `{ error: { code, message, details } }` with the matching HTTP status.
 * Anything else is treated as an unexpected 500.
 */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const HTTP_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  VALIDATION_FAILED: 400,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  INSUFFICIENT_STOCK: 409,
  VAN_UNAVAILABLE: 409,
  NO_TECHNICIAN: 409,
  NEGATIVE_STOCK: 409,
  CONFLICT: 409,
};

export function notFound(entity: string, id: string): AppError {
  return new AppError("NOT_FOUND", `${entity} ${id} was not found`);
}

export function invalidState(message: string, details?: unknown): AppError {
  return new AppError("INVALID_STATE", message, details);
}
