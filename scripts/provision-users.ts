import "dotenv/config";
import { provisionUsers } from "@/server/modules/auth/provision.service";
import { prisma } from "@/server/db/prisma";

async function main() {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--rotate-passwords")) throw new Error("Unknown option");
    await provisionUsers(process.env, process.argv.includes("--rotate-passwords"));
    console.log("Initial Admin and Operations accounts are provisioned. No credentials are printed.");
  } catch {
    // Validation errors can contain input; do not print environment values or exception details.
    console.error("Provisioning failed. Check required credentials, distinct emails/passwords, existing account slots, migrations, and database access. No partial account changes were applied.");
    process.exitCode = 1;
  } finally { await prisma.$disconnect(); }
}

void main();
