import { handle, readJson } from "@/server/http/route";
import { deleteProduct, getProduct, updateProduct } from "@/server/modules/products/products.service";
import { productInputSchema } from "@/lib/contracts/products";

export async function GET(_request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return handle(async () => getProduct((await ctx.params).productId));
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return handle(async () => updateProduct((await ctx.params).productId, await readJson(request, productInputSchema)));
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return handle(async () => deleteProduct((await ctx.params).productId));
}
