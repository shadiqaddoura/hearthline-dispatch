import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import type { ApiFailure, ApiSuccess } from "@/lib/contracts/common";
import { AppError, HTTP_STATUS } from "./errors";
import { assertSameOrigin, requireUser } from "@/server/modules/auth/request";
import type { AuthUser } from "@/lib/auth/user";

/**
 * Wraps a route handler body: runs it at request time, returns `{ data }` on
 * success and a consistent `{ error }` shape on failure.
 *
 *   export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[jobId]/assign">) {
 *     return handle(req, async () => {
 *       const { jobId } = await ctx.params;
 *       return assignJob(jobId, await readJson(req, assignJobRequest, "assignedBy"));
 *     });
 *   }
 */
export async function handle<T>(request: Request, work: (user: AuthUser) => Promise<T>, successStatus = 200): Promise<Response> {
  await connection(); // API responses are never prerendered (Cache Components is on).
  try {
    const user = await requireUser();
    assertSameOrigin(request);
    const data = await work(user);
    return Response.json({ data } satisfies ApiSuccess<T>, { status: successStatus, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function readJson<S extends z.ZodType>(request: Request, schema: S, auditField?: string): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AppError("VALIDATION_FAILED", "Request body must be valid JSON");
  }
  if (auditField) {
    const user = await requireUser();
    // Preserve legacy audit text while recording a stable user ID and readable identity.
    body = { ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}), [auditField]: `${user.name} <${user.email}> [${user.id}]` };
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

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const body: ApiFailure = { error: { code: error.code, message: error.message, details: error.details } };
    return Response.json(body, { status: HTTP_STATUS[error.code], headers: { "Cache-Control": "no-store" } });
  }
  console.error(error);
  const body: ApiFailure = { error: { code: "INTERNAL", message: "Unexpected server error" } };
  return Response.json(body, { status: 500, headers: { "Cache-Control": "no-store" } });
}
