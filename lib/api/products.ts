import type { ProductDto } from "@/lib/contracts/products";
import { getJson } from "./client";

export function fetchProducts(signal?: AbortSignal): Promise<ProductDto[]> {
  return getJson<ProductDto[]>("/api/products", { signal });
}
