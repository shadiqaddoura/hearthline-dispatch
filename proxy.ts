import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/session-cookie";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/sign-in" || path === "/api/auth/sign-in" || path === "/api/auth/demo-sign-in" || path === "/api/auth/logout") return NextResponse.next();
  // Only an early redirect: a present cookie still requires DB verification in pages/handlers.
  if (!request.cookies.get(sessionCookieName)?.value) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
