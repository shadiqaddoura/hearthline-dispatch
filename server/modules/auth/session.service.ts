import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type { AuthUser } from "@/lib/auth/user";
import { AppError } from "@/server/http/errors";
import { signInSchema } from "@/lib/auth/sign-in";
import { verifyPassword } from "./password";

export const SESSION_SECONDS = 8 * 60 * 60;
export const LOGIN_ERROR = "Email or password is incorrect.";
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const userSelect = { id: true, email: true, name: true, role: true } as const;

export async function sessionUser(token?: string): Promise<AuthUser | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.session.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: { select: { ...userSelect, active: true } } } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role };
}

export async function consumeLimit(key: string, limit: number, seconds: number) {
  // Atomic across app instances, including the first concurrent attempt.
  const rows = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO login_throttles (key, attempts, "expiresAt")
    VALUES (${key}, 1, now() + ${seconds} * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN login_throttles."expiresAt" <= now() THEN 1 ELSE login_throttles.attempts + 1 END,
      "expiresAt" = CASE WHEN login_throttles."expiresAt" <= now() THEN EXCLUDED."expiresAt" ELSE login_throttles."expiresAt" END
    RETURNING attempts`;
  if (rows[0].attempts > limit) throw new AppError("RATE_LIMITED", "Unable to sign in. Please try again later.");
}

export async function signIn(input: unknown, previousToken?: string) {
  await consumeLimit("global", 60, 60);
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) throw new AppError("UNAUTHORIZED", LOGIN_ERROR);
  const { password } = parsed.data;
  if (Buffer.byteLength(password) > 1024) throw new AppError("UNAUTHORIZED", LOGIN_ERROR);
  const email = parsed.data.email.toLowerCase();
  await consumeLimit(tokenHash(email), 10, 15 * 60);
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid || !user.active) throw new AppError("UNAUTHORIZED", LOGIN_ERROR);
  return createSessionForUser(user, previousToken);
}

/** Shared by password and explicitly enabled demo login. Rechecks the account under lock. */
export async function createSessionForUser(user: { id: string; passwordHash: string; role: AuthUser["role"]; bootstrapKey: string | null }, previousToken?: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await prisma.$transaction(async (tx) => {
    // Serialize password rotation with login; no session may outlive a concurrent reset.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current?.active || current.passwordHash !== user.passwordHash || current.role !== user.role || current.bootstrapKey !== user.bootstrapKey) throw new AppError("UNAUTHORIZED", LOGIN_ERROR);
    if (previousToken) await tx.session.deleteMany({ where: { tokenHash: tokenHash(previousToken) } });
    await tx.session.create({ data: { tokenHash: tokenHash(token), userId: user.id, expiresAt } });
  });
  return { token, expiresAt };
}

export async function logout(token?: string) {
  if (token) await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
}
