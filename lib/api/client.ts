// Browser-side access to the app's own API. No server-only imports here.
import type { ApiFailure, ApiSuccess } from "@/lib/contracts/common";

/** A request that reached the API (or failed to) and did not return data. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** GETs an API path and unwraps `{ data }`, turning `{ error }` and network failures into ApiRequestError. */
export async function getJson<T>(path: string, init?: { signal?: AbortSignal }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { headers: { Accept: "application/json" }, signal: init?.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError("Couldn't reach the server. Check your connection and try again.", null);
  }

  const body = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
  if (response.ok && body && "data" in body) return body.data;

  const code = body && "error" in body ? body.error.code : null;
  // 4xx messages describe what was wrong with the request; 5xx ones aren't meant for people.
  const message =
    response.status < 500 && body && "error" in body
      ? body.error.message
      : "The server ran into a problem. Try again in a moment.";
  throw new ApiRequestError(message, response.status, code);
}
