import "server-only";

// Intentionally public demonstration credentials, authorized for the demo instance.
// Never use these accounts/passwords for a private or production deployment.
export const publicDemoAccounts = [
  { role: "ADMIN", email: "admin@demo.hearthline.test", name: "Demo Admin", password: "HearthlineDemoAdmin!2026" },
  { role: "OPERATIONS", email: "operations@demo.hearthline.test", name: "Demo Operations", password: "HearthlineDemoOperations!2026" },
] as const;

export function publicDemoEnvironment(): Record<string, string> {
  const [admin, operations] = publicDemoAccounts;
  return {
    AUTH_ADMIN_EMAIL: admin.email, AUTH_ADMIN_NAME: admin.name, AUTH_ADMIN_PASSWORD: admin.password,
    AUTH_OPERATIONS_EMAIL: operations.email, AUTH_OPERATIONS_NAME: operations.name, AUTH_OPERATIONS_PASSWORD: operations.password,
  };
}
