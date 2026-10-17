import "server-only";
import { cookies } from "next/headers";
import { errorResponse } from "@/server/http/route";
import { AppError } from "@/server/http/errors";
import { assertSameOrigin, cookieOptions, SESSION_COOKIE } from "./request";
import { demoSignIn, demoSignInEnabled } from "./demo.service";
import { LOGIN_ERROR, logout, signIn } from "./session.service";

export async function loginResponse(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    // Reject oversized credential bodies before allocating expensive password work.
    const text = await readCredentialsBody(request);
    let input: unknown;
    try { input = JSON.parse(text); } catch { throw new AppError("UNAUTHORIZED", LOGIN_ERROR); }
    const jar = await cookies();
    const session = await signIn(input, jar.get(SESSION_COOKIE)?.value);
    jar.set(SESSION_COOKIE, session.token, { ...cookieOptions, expires: session.expiresAt });
    return Response.json({ data: { ok: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function demoLoginResponse(request: Request): Promise<Response> {
  try {
    if (!demoSignInEnabled()) throw new AppError("NOT_FOUND", "Demo sign-in is unavailable.");
    assertSameOrigin(request);
    let input: unknown;
    try { input = JSON.parse(await readCredentialsBody(request)); }
    catch { throw new AppError("UNAUTHORIZED", "Demo sign-in is unavailable."); }
    const jar = await cookies();
    const session = await demoSignIn(input, jar.get(SESSION_COOKIE)?.value);
    jar.set(SESSION_COOKIE, session.token, { ...cookieOptions, expires: session.expiresAt });
    return Response.json({ data: { ok: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function logoutResponse(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const jar = await cookies();
    await logout(jar.get(SESSION_COOKIE)?.value);
    jar.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
    return Response.json({ data: { ok: true } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

async function readCredentialsBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("UNAUTHORIZED", LOGIN_ERROR);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new AppError("UNAUTHORIZED", LOGIN_ERROR);
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
