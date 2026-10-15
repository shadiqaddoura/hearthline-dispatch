import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import type { ApiFailure, ApiSuccess } from "@/lib/contracts/common";
import { AppError, HTTP_STATUS } from "./errors";

/**
 * Wraps a route handler body: runs it at request time, returns `{ data }` on
 * success and a consistent `{ error }` shape on failure.
 *
 *   export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[jobId]/assign">) {
 *     return handle(async () => {
 *       const { jobId } = await ctx.params;
 *       return assignJob(jobId, await readJson(req, assignJobRequest));
 *     });
 *   }
 */
export async function handle<T>(work: () => Promise<T>, successStatus = 200): Promise<Response> {
  await connection(); // API responses are never prerendered (Cache Components is on).
  try {
    const data = await work();
    return Response.json({ data } satisfies ApiSuccess<T>, { status: successStatus });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("VALIDATION_FAILED", "Request body must be valid JSON");
  }
  return parseInput(schema, body);
}

export function readQuery<S extends z.ZodType>(request: Request, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return parseInput(schema, params);
}

function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION_FAILED", "Request is invalid", z.flattenError(result.error));
  }
  return result.data;
}

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const body: ApiFailure = { error: { code: error.code, message: error.message, details: error.details } };
    return Response.json(body, { status: HTTP_STATUS[error.code] });
  }
  console.error(error);
  const body: ApiFailure = { error: { code: "INTERNAL", message: "Unexpected server error" } };
  return Response.json(body, { status: 500 });
}
