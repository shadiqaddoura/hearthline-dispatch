import { handle } from "@/server/http/route";
import { AppError } from "@/server/http/errors";
import { importStockBook, listImportBatches } from "@/server/modules/import/import.service";

export async function GET() {
  return handle(listImportBatches);
}

/** multipart/form-data with a `file` field holding the stock book (.xlsx). */
export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION_FAILED", "Send the workbook as a multipart `file` field");
    return importStockBook(await file.arrayBuffer(), file.name);
  }, 201);
}
