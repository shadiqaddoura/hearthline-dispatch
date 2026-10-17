import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { clearAllApplicationData, dataResetPreview } from "@/server/modules/settings/data-reset.service";
import { seedDemoSection } from "@/server/modules/settings/demo-data.service";
import { createWorld } from "../support/world";

const actor = "Reset Test <reset@example.test> [reset-user]";

beforeEach(createWorld);

describe("Settings clear-all data", () => {
  it("clears every application domain while preserving accounts and authentication state", async () => {
    const user = await prisma.user.create({ data: { email: "keep@example.test", name: "Keep Me", role: "ADMIN", passwordHash: "preserved-hash" } });
    await prisma.session.create({ data: { tokenHash: "preserved-session", userId: user.id, expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.loginThrottle.create({ data: { key: "preserved-throttle", attempts: 2, expiresAt: new Date(Date.now() + 60_000) } });
    for (const section of ["PRODUCTS", "CUSTOMERS", "FLEET", "INVENTORY", "DISPATCH", "RESTOCKING"] as const) await seedDemoSection(section, actor);
    const preview = await dataResetPreview();
    expect(preview.total).toBeGreaterThan(0);

    const result = await clearAllApplicationData(preview.counts);

    expect(result.preview.total).toBe(0);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.location.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await prisma.job.count()).toBe(0);
    expect(await prisma.importBatch.count()).toBe(0);
    expect(await prisma.demoRecord.count()).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toMatchObject({ email: "keep@example.test" });
    expect(await prisma.session.findUnique({ where: { tokenHash: "preserved-session" } })).not.toBeNull();
    expect(await prisma.loginThrottle.findUnique({ where: { key: "preserved-throttle" } })).not.toBeNull();
  });

  it("rejects stale confirmed counts without clearing anything", async () => {
    const preview = await dataResetPreview();
    const added = await prisma.product.create({ data: { sku: "AFTER-PREVIEW", name: "Added later", serialised: false } });

    await expect(clearAllApplicationData(preview.counts)).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: expect.stringContaining("changed after confirmation"),
    });
    expect(await prisma.product.findUnique({ where: { id: added.id } })).not.toBeNull();
    expect(await prisma.customer.count()).toBeGreaterThan(0);
  });
});
