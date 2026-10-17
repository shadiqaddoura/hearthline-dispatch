import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError } from "@/server/http/errors";
import { sessionUser } from "./session.service";

import { sessionCookieName } from "@/lib/auth/session-cookie";
export const SESSION_COOKIE = sessionCookieName;
export const cookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/",
};
export async function currentUser() {
  return sessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "Sign in to continue.");
  return user;
}
export async function requirePageUser() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}
export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const configured = process.env.AUTH_ORIGIN;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("AUTH_ORIGIN is required in production");
  const expectedUrl = new URL(configured ?? request.url);
  if (process.env.NODE_ENV === "production" && expectedUrl.protocol !== "https:") throw new Error("AUTH_ORIGIN must use HTTPS in production");
  const expected = expectedUrl.origin;
  const origin = request.headers.get("origin");
  if (origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("FORBIDDEN", "Request origin is not allowed.");
  }
}
