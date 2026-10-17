import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ values: new Map<string, string>(), settings: new Map<string, Record<string, unknown>>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => state.values.has(name) ? { value: state.values.get(name) } : undefined,
  set: (name: string, value: string, settings: Record<string, unknown>) => { state.values.set(name, value); state.settings.set(name, settings); },
}) }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), connection: async () => {} }));

import { prisma } from "@/server/db/prisma";
import { hashPassword, verifyPassword } from "@/server/modules/auth/password";
import { signIn, sessionUser, tokenHash, logout, LOGIN_ERROR } from "@/server/modules/auth/session.service";
import { provisionUsers } from "@/server/modules/auth/provision.service";
import { requirePageUser, SESSION_COOKIE, cookieOptions } from "@/server/modules/auth/request";
import { POST as loginRoute } from "@/app/api/auth/sign-in/route";
import { POST as demoRoute } from "@/app/api/auth/demo-sign-in/route";
import { publicDemoAccounts } from "@/server/modules/auth/demo-credentials";
import { listDemoAccounts } from "@/server/modules/auth/demo.service";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as productsRoute, POST as createProductRoute } from "@/app/api/products/route";
import { POST as receiveRoute } from "@/app/api/inventory/route";
import { readJson } from "@/server/http/route";
import { z } from "zod";
import { createWorld, type World } from "../support/world";

const password = randomBytes(24).toString("base64url");
let passwordHash: string;
let world: World;
let admin: { id: string; email: string };
let operations: { id: string; email: string };
const request = (url: string, body?: unknown, method = body ? "POST" : "GET", origin = "http://localhost:3000") => new Request(`http://localhost:3000${url}`, {
  method, headers: { origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
});
async function authenticate(email = admin.email) {
  const session = await signIn({ email, password });
  state.values.set(SESSION_COOKIE, session.token);
  return session;
}
beforeAll(async () => { passwordHash = await hashPassword(password); });
beforeEach(async () => {
  state.values.clear(); state.settings.clear();
  vi.unstubAllEnvs();
  world = await createWorld();
  admin = await prisma.user.create({ data: { email: "admin@example.test", name: "Admin", role: "ADMIN", passwordHash } });
  operations = await prisma.user.create({ data: { email: "operations@example.test", name: "Operations", role: "OPERATIONS", passwordHash } });
});

describe("database authentication", () => {
  it("disables demo login and account exposure by default, even for direct requests", async () => {
    vi.stubEnv("AUTH_DEMO_SIGN_IN", "");
    expect(await listDemoAccounts()).toEqual([]);
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }))).status).toBe(404);
    expect(await prisma.session.count()).toBe(0);
    vi.stubEnv("AUTH_DEMO_SIGN_IN", "false");
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }))).status).toBe(404);
  });
  it("creates ordinary sessions for only the two active provisioned demo users and preserves full access", async () => {
    vi.stubEnv("AUTH_DEMO_SIGN_IN", "true");
    await prisma.user.update({ where: { id: admin.id }, data: { bootstrapKey: "initial-admin" } });
    await prisma.user.update({ where: { id: operations.id }, data: { bootstrapKey: "initial-operations" } });
    const accounts = await listDemoAccounts();
    expect(accounts).toEqual([
      { role: "ADMIN", name: "Admin", email: admin.email },
      { role: "OPERATIONS", name: "Operations", email: operations.email },
    ]);
    let previous: string | undefined;
    for (const user of [{ ...admin, role: "ADMIN" }, { ...operations, role: "OPERATIONS" }]) {
      const response = await demoRoute(request("/api/auth/demo-sign-in", { role: user.role }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { ok: true } });
      const token = state.values.get(SESSION_COOKIE)!;
      expect(await sessionUser(token)).toMatchObject({ id: user.id, role: user.role });
      if (previous) expect(await sessionUser(previous)).toBeNull();
      expect(state.settings.get(SESSION_COOKIE)).toMatchObject({ ...cookieOptions, expires: expect.any(Date) });
      expect((await productsRoute(request("/api/products"))).status).toBe(200);
      expect((await createProductRoute(request("/api/products", { sku: `DEMO-${user.id}`, name: "Demo product", serialised: false, baseUnit: "each", packUnit: null, packSize: null, vanMinimum: 0, autoRestock: false }))).status).toBe(201);
      expect(await requirePageUser()).toMatchObject({ id: user.id });
      previous = token;
    }
    // Turning off the entry point does not turn existing normal sessions into a bypass.
    vi.stubEnv("AUTH_DEMO_SIGN_IN", "false");
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }))).status).toBe(404);
    expect((await logoutRoute(request("/api/auth/logout", undefined, "POST"))).status).toBe(200);
    expect(await sessionUser(previous)).toBeNull();
  });
  it("fails closed for missing, disabled, mismatched and client-selected demo accounts", async () => {
    vi.stubEnv("AUTH_DEMO_SIGN_IN", "true");
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }))).status).toBe(401);
    await prisma.user.update({ where: { id: admin.id }, data: { bootstrapKey: "initial-admin", active: false } });
    expect(await listDemoAccounts()).toEqual([]);
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }))).status).toBe(401);
    await prisma.user.update({ where: { id: admin.id }, data: { active: true, role: "OPERATIONS" } });
    expect(await listDemoAccounts()).toEqual([]);
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }))).status).toBe(401);
    for (const body of [{ role: "OTHER" }, { role: "OPERATIONS", userId: admin.id }, { email: admin.email }]) {
      expect((await demoRoute(request("/api/auth/demo-sign-in", body))).status).toBe(401);
    }
    expect(await prisma.session.count()).toBe(0);
  });
  it("enforces same-origin and rate limits on demo sign-in", async () => {
    vi.stubEnv("AUTH_DEMO_SIGN_IN", "true");
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }, "POST", "https://other.example"))).status).toBe(403);
    await prisma.loginThrottle.create({ data: { key: "demo-global", attempts: 60, expiresAt: new Date(Date.now() + 60_000) } });
    expect((await demoRoute(request("/api/auth/demo-sign-in", { role: "ADMIN" }))).status).toBe(429);
    expect(await prisma.session.count()).toBe(0);
  });
  it("seeds public demo credentials idempotently, displays only matching passwords, and supports normal password login", async () => {
    await prisma.user.deleteMany();
    const before = await prisma.product.findMany();
    const run = () => execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/provision-users.ts", "--demo"], { env: process.env, encoding: "utf8" });
    expect(run()).toContain("accounts are provisioned");
    const original = await prisma.user.findMany({ orderBy: { email: "asc" } });
    expect(original).toHaveLength(2);
    run();
    expect(await prisma.user.findMany({ orderBy: { email: "asc" } })).toEqual(original);
    vi.stubEnv("AUTH_DEMO_SIGN_IN", "true");
    expect(await listDemoAccounts()).toEqual(publicDemoAccounts.map(({ role, name, email, password }) => ({ role, name, email, password })));
    for (const account of publicDemoAccounts) {
      const stored = original.find((user) => user.role === account.role)!;
      expect(stored.passwordHash).not.toBe(account.password);
      expect(stored.passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/);
      expect((await loginRoute(request("/api/auth/sign-in", { email: account.email, password: account.password }))).status).toBe(200);
      expect(await requirePageUser()).toMatchObject({ id: stored.id, role: account.role });
      expect((await productsRoute(request("/api/products"))).status).toBe(200);
    }
    await prisma.user.update({ where: { id: original[0].id }, data: { passwordHash: await hashPassword(randomBytes(24).toString("base64url")) } });
    expect((await listDemoAccounts()).find((account) => account.email === original[0].email)).not.toHaveProperty("password");
    expect(await prisma.product.findMany()).toEqual(before);
  });
  it("uses salted strong hashes and verifies passwords", async () => {
    expect(passwordHash).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(passwordHash).not.toContain(password);
    expect(await verifyPassword(password, passwordHash)).toBe(true);
    expect(await verifyPassword("wrong", passwordHash)).toBe(false);
    expect(await hashPassword(password)).not.toBe(passwordHash);
    await expect(hashPassword("too short")).rejects.toThrow();
  });
  it("signs in with normalized email, rotates previous sessions, and stores only token hashes", async () => {
    const old = await authenticate();
    const response = await loginRoute(request("/api/auth/sign-in", { email: " ADMIN@example.test ", password }));
    expect(response.status).toBe(200);
    const token = state.values.get(SESSION_COOKIE)!;
    expect(token).not.toBe(old.token);
    expect(await sessionUser(old.token)).toBeNull();
    const stored = await prisma.session.findUniqueOrThrow({ where: { tokenHash: tokenHash(token) } });
    expect(stored.tokenHash).not.toBe(token);
    expect(await sessionUser(token)).toEqual({ id: admin.id, email: admin.email, name: "Admin", role: "ADMIN" });
    expect(state.settings.get(SESSION_COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false });
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(8 * 3600 * 1000);
  });
  it("returns identical generic errors for unknown users, wrong passwords, disabled users and invalid input", async () => {
    for (const input of [{ email: admin.email, password: "wrong" }, { email: "missing@example.test", password }, { email: "bad", password }, {}]) {
      const response = await loginRoute(request("/api/auth/sign-in", input));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "UNAUTHORIZED", message: LOGIN_ERROR } });
    }
    await prisma.user.update({ where: { id: admin.id }, data: { active: false } });
    await expect(signIn({ email: admin.email, password })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: LOGIN_ERROR });
    expect(await prisma.session.count()).toBe(0);
  });
  it("throttles repeated login attempts persistently", async () => {
    await prisma.loginThrottle.create({ data: { key: tokenHash(admin.email), attempts: 10, expiresAt: new Date(Date.now() + 60_000) } });
    const response = await loginRoute(request("/api/auth/sign-in", { email: admin.email, password }));
    expect(response.status).toBe(429);
    expect(await prisma.session.count()).toBe(0);
  });
  it("rejects missing, forged, expired, disabled and deleted sessions", async () => {
    expect(await sessionUser()).toBeNull();
    expect(await sessionUser("x".repeat(64))).toBeNull();
    expect(await sessionUser("a".repeat(64))).toBeNull();
    const session = await authenticate();
    await prisma.session.update({ where: { tokenHash: tokenHash(session.token) }, data: { expiresAt: new Date(0) } });
    expect((await productsRoute(request("/api/products"))).status).toBe(401);
    await prisma.session.update({ where: { tokenHash: tokenHash(session.token) }, data: { expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.user.update({ where: { id: admin.id }, data: { active: false } });
    expect(await sessionUser(session.token)).toBeNull();
    await prisma.user.delete({ where: { id: admin.id } });
    expect(await sessionUser(session.token)).toBeNull();
  });
  it("redirects unauthenticated page reads and allows either role", async () => {
    await expect(requirePageUser()).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT;replace;/sign-in") });
    for (const user of [admin, operations]) {
      await authenticate(user.email);
      expect(await requirePageUser()).toMatchObject({ id: user.id });
      expect((await productsRoute(request("/api/products"))).status).toBe(200);
      expect((await createProductRoute(request("/api/products", { sku: `AUTH-${user.id}`, name: "Auth product", serialised: false, baseUnit: "each", packUnit: null, packSize: null, vanMinimum: 0, autoRestock: false }))).status).toBe(201);
    }
  });
  it("logs out idempotently and revokes copied tokens on the server", async () => {
    const session = await authenticate();
    expect((await logoutRoute(request("/api/auth/logout", undefined, "POST"))).status).toBe(200);
    expect(state.settings.get(SESSION_COOKIE)).toMatchObject({ maxAge: 0, httpOnly: true });
    state.values.set(SESSION_COOKIE, session.token);
    expect((await productsRoute(request("/api/products"))).status).toBe(401);
    await logout(session.token);
    expect(await prisma.session.count()).toBe(0);
  });
  it("rejects cross-origin or missing-origin writes, including login and logout", async () => {
    await authenticate();
    for (const handler of [loginRoute, logoutRoute, createProductRoute]) {
      expect((await handler(request("/api/test", {}, "POST", "https://other.example"))).status).toBe(403);
      expect((await handler(new Request("http://localhost:3000/api/test", { method: "POST", body: "{}" }))).status).toBe(403);
    }
    expect(await prisma.session.count()).toBe(1);
  });
  it("rejects malformed and oversized credential bodies without creating a session", async () => {
    for (const body of ["{", JSON.stringify({ email: admin.email, password: "x".repeat(9000) })]) {
      const response = await loginRoute(new Request("http://localhost:3000/api/auth/sign-in", { method: "POST", headers: { origin: "http://localhost:3000" }, body }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "UNAUTHORIZED", message: LOGIN_ERROR } });
    }
    expect(await prisma.session.count()).toBe(0);
  });
  it("requires configured production origin and secure cookie settings", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_ORIGIN", "https://dispatch.example");
    expect((await logoutRoute(request("/api/auth/logout", {}, "POST"))).status).toBe(403);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("AUTH_ORIGIN", "");
    expect((await logoutRoute(request("/api/auth/logout", {}, "POST"))).status).toBe(500);
    vi.stubEnv("AUTH_ORIGIN", "http://dispatch.example");
    expect((await logoutRoute(request("/api/auth/logout", {}, "POST", "http://dispatch.example"))).status).toBe(500);
    vi.stubEnv("AUTH_ORIGIN", "https://dispatch.example");
    log.mockRestore();
    // Cookie settings are fixed at module load, tested in a separate module import below.
    vi.resetModules();
    const production = await import("@/server/modules/auth/request");
    expect(production.SESSION_COOKIE).toBe("__Host-hearthline_session");
    expect(production.cookieOptions).toEqual({ ...cookieOptions, secure: true });
  });
  it("overwrites spoofed and missing audit identities before validation and persistence", async () => {
    await authenticate(operations.email);
    const operationKey = randomUUID();
    const response = await receiveRoute(request("/api/inventory", { operationKey, locationId: world.north.locationId, productId: world.cable.id, quantity: 2, condition: "WORKING", performedBy: "Forged Admin", note: "Authenticated stock receipt" }));
    expect(response.status).toBe(201);
    const movement = await prisma.stockMovement.findUniqueOrThrow({ where: { operationKey } });
    expect(movement.performedBy).toBe(`Operations <${operations.email}> [${operations.id}]`);
    for (const field of ["performedBy", "correctedBy", "verifiedBy", "collectedBy", "completedBy", "cancelledBy", "assignedBy", "reassignedBy", "updatedBy"]) {
      const parsed = await readJson(request("/api/test", { [field]: "Forged" }), z.object({ [field]: z.string() }), field);
      expect(parsed[field]).toBe(movement.performedBy);
    }
  });
  it("protects every exported business API handler before any business work", async () => {
    async function walk(directory: string): Promise<string[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : entry.name === "route.ts" ? [path.join(directory, entry.name)] : []))).flat();
    }
    const files = (await walk(path.resolve("app/api"))).filter((file) => !file.includes("/auth/"));
    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).toContain("handle(request,");
      const route = await import(file);
      for (const [method, handler] of Object.entries(route)) {
        if (!/^(GET|POST|PATCH|PUT|DELETE)$/.test(method)) continue;
        const response = await (handler as (req: Request, ctx: unknown) => Promise<Response>)(request("/api/test", undefined, method), { params: Promise.resolve({}) });
        expect(response.status, `${file}: ${method}`).toBe(401);
      }
    }
  });
  it("rolls back provisioning on an existing email collision and preserves existing users", async () => {
    const existing = await prisma.user.findMany({ orderBy: { id: "asc" } });
    await expect(provisionUsers({ AUTH_ADMIN_EMAIL: "new-admin@example.test", AUTH_ADMIN_PASSWORD: password, AUTH_OPERATIONS_EMAIL: operations.email, AUTH_OPERATIONS_PASSWORD: randomBytes(24).toString("base64url") })).rejects.toThrow("already belongs");
    expect(await prisma.user.findMany({ orderBy: { id: "asc" } })).toEqual(existing);
  });
  it("provisions exactly two initial slots, repeats safely, preserves operational data and rotates explicitly", async () => {
    await prisma.user.deleteMany();
    const env = { AUTH_ADMIN_EMAIL: "initial-admin@example.test", AUTH_ADMIN_PASSWORD: password, AUTH_OPERATIONS_EMAIL: "initial-ops@example.test", AUTH_OPERATIONS_PASSWORD: randomBytes(24).toString("base64url") };
    const before = await prisma.product.findMany();
    const output = execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/provision-users.ts"], { env: { ...process.env, ...env }, encoding: "utf8" });
    expect(output).toContain("accounts are provisioned");
    expect(output).not.toContain(password);
    const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
    expect(users).toHaveLength(2);
    expect(users.map((user) => user.role).sort()).toEqual(["ADMIN", "OPERATIONS"]);
    await provisionUsers(env);
    expect(await prisma.user.findMany({ orderBy: { email: "asc" } })).toEqual(users);
    const session = await signIn({ email: env.AUTH_ADMIN_EMAIL, password });
    await provisionUsers({ ...env, AUTH_ADMIN_PASSWORD: randomBytes(24).toString("base64url") }, true);
    expect(await sessionUser(session.token)).toBeNull();
    expect(await prisma.product.findMany()).toEqual(before);
    await expect(provisionUsers({ ...env, AUTH_OPERATIONS_EMAIL: env.AUTH_ADMIN_EMAIL })).rejects.toThrow();
    expect(await prisma.user.count()).toBe(2);
  });
});
