import { handle, readJson } from "@/server/http/route";
import { deleteProduct, getProduct, updateProduct } from "@/server/modules/products/products.service";
import { productInputSchema } from "@/lib/contracts/products";

export async function GET(request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return handle(request, async () => getProduct((await ctx.params).productId));
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return handle(request, async () => updateProduct((await ctx.params).productId, await readJson(request, productInputSchema)));
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return handle(request, async () => deleteProduct((await ctx.params).productId));
}
