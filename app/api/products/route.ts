import { handle } from "@/server/http/route";
import { listProducts } from "@/server/modules/inventory/inventory.service";

export async function GET() {
  return handle(listProducts);
}
