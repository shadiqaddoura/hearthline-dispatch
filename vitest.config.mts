import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      // The real package throws outside React Server Components; tests call services directly.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    projects: [
      {
        extends: true,
        test: {
          name: "server",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/global-setup.ts"],
          // Integration tests run against TEST_DATABASE_URL, never the development database.
          env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
          // One shared test database: run files one at a time.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          // Components in a simulated browser. No database needed: `npx vitest run --project ui`.
          name: "ui",
          include: ["tests/ui/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["tests/support/ui-setup.ts"],
        },
      },
    ],
  },
});
