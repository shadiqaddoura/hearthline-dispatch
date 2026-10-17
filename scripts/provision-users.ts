import "dotenv/config";
import { provisionUsers } from "@/server/modules/auth/provision.service";
import { publicDemoEnvironment } from "@/server/modules/auth/demo-credentials";
import { promptProvisioning } from "./provision-input";
import { prisma } from "@/server/db/prisma";

async function main() {
  try {
    if (process.argv.slice(2).some((arg) => !["--rotate-passwords", "--interactive", "--demo"].includes(arg))) throw new Error("Unknown option");
    const demo = process.argv.includes("--demo");
    if (demo && (process.argv.includes("--interactive") || process.argv.includes("--rotate-passwords"))) throw new Error("Demo provisioning cannot replace existing credentials");
    const input = demo ? publicDemoEnvironment() : process.argv.includes("--interactive") ? await promptProvisioning(process.env) : process.env;
    await provisionUsers(input, process.argv.includes("--rotate-passwords"));
    console.log("Initial Admin and Operations accounts are provisioned. No credentials are printed.");
  } catch {
    // Validation errors can contain input; do not print environment values or exception details.
    console.error("Provisioning failed. Check required credentials, distinct emails/passwords, existing account slots, migrations, and database access. No partial account changes were applied.");
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

void main();
