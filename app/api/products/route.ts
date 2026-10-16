import { handle, readJson } from "@/server/http/route";
import { createProduct, listProducts } from "@/server/modules/products/products.service";
import { productInputSchema } from "@/lib/contracts/products";

export async function GET() {
  return handle(listProducts);
}

export async function POST(request: Request) {
  return handle(async () => createProduct(await readJson(request, productInputSchema)), 201);
}
