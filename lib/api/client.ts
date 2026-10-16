// Browser-side access to the app's own API. No server-only imports here.
import type { ApiFailure, ApiSuccess } from "@/lib/contracts/common";

/** A request that reached the API (or failed to) and did not return data. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    /** null when the server couldn't be reached, so the outcome is unknown. */
    readonly status: number | null,
    readonly code: string | null = null,
    readonly details: unknown = undefined,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }

  /** The server answered with a decision (4xx): nothing about the outcome is in doubt. */
  get isRejection(): boolean {
    return this.status !== null && this.status >= 400 && this.status < 500;
  }

  /** Per-field messages from a validation or conflict response, e.g. `{ sequence: ["…"] }`. */
  get fieldErrors(): Record<string, string[]> {
    const fields = (this.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
    return fields ?? {};
  }
}

/** GETs an API path and unwraps `{ data }`, turning `{ error }` and network failures into ApiRequestError. */
export function getJson<T>(path: string, init?: { signal?: AbortSignal }): Promise<T> {
  return request<T>(path, { method: "GET", signal: init?.signal });
}

/** Sends a JSON body (POST, PATCH) and unwraps the response like getJson. */
export function sendJson<T>(method: "POST" | "PATCH", path: string, body: unknown): Promise<T> {
  return request<T>(path, { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { Accept: "application/json", ...init.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError("Couldn't reach the server. Check your connection and try again.", null);
  }

  const body = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (response.ok && body && "data" in body) return body.data;

  const failure = body && "error" in body ? body.error : null;
  // 4xx messages describe what was wrong with the request; 5xx ones aren't meant for people.
  const message =
    response.status < 500 && failure ? failure.message : "The server ran into a problem. Try again in a moment.";
  throw new ApiRequestError(message, response.status, failure?.code ?? null, failure?.details);
}
