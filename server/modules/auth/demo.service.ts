import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/http/errors";
import type { DemoAccount } from "@/lib/auth/demo";
import { publicDemoAccounts } from "./demo-credentials";
import { verifyPassword } from "./password";
import { consumeLimit, createSessionForUser } from "./session.service";

export const demoSignInEnabled = () => process.env.AUTH_DEMO_SIGN_IN === "true";
const slots = { ADMIN: "initial-admin", OPERATIONS: "initial-operations" } as const;
const inputSchema = z.object({ role: z.enum(["ADMIN", "OPERATIONS"]) }).strict();

export async function listDemoAccounts(): Promise<DemoAccount[]> {
  if (!demoSignInEnabled()) return [];
  const users = await prisma.user.findMany({
    where: { bootstrapKey: { in: Object.values(slots) }, active: true },
    select: { role: true, name: true, email: true, bootstrapKey: true, passwordHash: true },
    orderBy: { role: "asc" },
  });
  return Promise.all(users.filter((user) => user.bootstrapKey === slots[user.role]).map(async ({ role, name, email, passwordHash }) => {
    const fixture = publicDemoAccounts.find((account) => account.role === role && account.email === email);
    // Display only known public fixture credentials that actually match the stored hash.
    const password = fixture && await verifyPassword(fixture.password, passwordHash) ? fixture.password : undefined;
    return { role, name, email, ...(password ? { password } : {}) };
  }));
}

export async function demoSignIn(input: unknown, previousToken?: string) {
  if (!demoSignInEnabled()) throw new AppError("NOT_FOUND", "Demo sign-in is unavailable.");
  await consumeLimit("demo-global", 60, 60);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new AppError("UNAUTHORIZED", "Demo sign-in is unavailable.");
  const role = parsed.data.role;
  const user = await prisma.user.findUnique({ where: { bootstrapKey: slots[role] } });
  if (!user?.active || user.role !== role) throw new AppError("UNAUTHORIZED", "Demo sign-in is unavailable.");
  return createSessionForUser(user, previousToken);
}
