// Loads the stock book into an empty database and prints what did not fit.
//   npm run import:book -- docs/04-van-stock-book.xlsx
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { importStockBook, listImportIssues } from "@/server/modules/import/import.service";
import { prisma } from "@/server/db/prisma";

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Usage: npm run import:book -- <path to .xlsx>");

  const file = await readFile(path);
  const batch = await importStockBook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer, basename(path));
  console.log(JSON.stringify(batch.summary, null, 2));

  const issues = await listImportIssues(batch.id, {});
  for (const issue of issues.filter((i) => i.severity !== "INFO")) {
    const where = issue.sheet ? `${issue.sheet} row ${issue.rowNumber}` : "workbook";
    console.log(`${issue.severity.padEnd(7)} ${where.padEnd(16)} ${issue.code}: ${issue.message}`);
  }
  console.log(`\n${issues.length} issues recorded on batch ${batch.id} (GET /api/imports/${batch.id}/issues)`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
