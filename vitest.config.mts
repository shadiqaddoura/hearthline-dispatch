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
    environment: "node",
    globalSetup: ["tests/support/global-setup.ts"],
    // Integration tests run against TEST_DATABASE_URL, never the development database.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? "" },
    // One shared test database: run files one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
