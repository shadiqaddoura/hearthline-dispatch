import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { hashPassword } from "./password";

const account = z.object({
  email: z.email().transform((email) => email.trim().toLowerCase()),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(15).refine((value) => Buffer.byteLength(value) <= 1024),
});

/** Adds exactly two initial accounts, never deletes or replaces existing users. */
export async function provisionUsers(env: Record<string, string | undefined>, rotatePasswords = false) {
  const accounts = [
    { ...account.parse({ email: env.AUTH_ADMIN_EMAIL, name: env.AUTH_ADMIN_NAME ?? "Admin", password: env.AUTH_ADMIN_PASSWORD }), role: "ADMIN" as const, bootstrapKey: "initial-admin" },
    { ...account.parse({ email: env.AUTH_OPERATIONS_EMAIL, name: env.AUTH_OPERATIONS_NAME ?? "Operations", password: env.AUTH_OPERATIONS_PASSWORD }), role: "OPERATIONS" as const, bootstrapKey: "initial-operations" },
  ];
  if (accounts[0].email === accounts[1].email) throw new Error("Initial accounts must have different emails");
  if (accounts[0].password === accounts[1].password) throw new Error("Initial accounts must have different passwords");
  const hashes = await Promise.all(accounts.map((input) => hashPassword(input.password)));
  await prisma.$transaction(async (tx) => {
    // Serialize repeat/concurrent provisioning commands without touching operational tables.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(72481932)::text`;
    for (const [index, input] of accounts.entries()) {
      const existing = await tx.user.findUnique({ where: { bootstrapKey: input.bootstrapKey } });
      if (existing) {
        if (existing.email !== input.email || existing.role !== input.role) throw new Error("Provisioning account differs from existing slot; update users through a separate managed process");
        if (rotatePasswords) {
          await tx.$queryRaw`SELECT id FROM users WHERE id = ${existing.id} FOR UPDATE`;
          await tx.user.update({ where: { id: existing.id }, data: { passwordHash: hashes[index] } });
          await tx.session.deleteMany({ where: { userId: existing.id } });
        }
        continue;
      }
      const collision = await tx.user.findUnique({ where: { email: input.email } });
      if (collision) throw new Error("Provisioning email already belongs to an existing user; no changes applied");
      await tx.user.create({ data: { email: input.email, name: input.name, role: input.role, bootstrapKey: input.bootstrapKey, passwordHash: hashes[index] } });
    }
  }, { timeout: 15_000 });
}
