import type { DeletedProductDto, ProductDetailDto, ProductDto, ProductInput } from "@/lib/contracts/products";
import { deleteJson, getJson, sendJson } from "./client";

const path = (productId: string) => `/api/products/${encodeURIComponent(productId)}`;

export function fetchProducts(signal?: AbortSignal): Promise<ProductDto[]> {
  return getJson<ProductDto[]>("/api/products", { signal });
}

/** One product with where it is used: what can still be edited, and whether it can be deleted. */
export function fetchProduct(productId: string, signal?: AbortSignal): Promise<ProductDetailDto> {
  return getJson<ProductDetailDto>(path(productId), { signal });
}

export function createProduct(input: ProductInput): Promise<ProductDto> {
  return sendJson<ProductDto>("POST", "/api/products", input);
}

export function updateProduct(productId: string, input: ProductInput): Promise<ProductDto> {
  return sendJson<ProductDto>("PATCH", path(productId), input);
}

export function deleteProduct(productId: string): Promise<DeletedProductDto> {
  return deleteJson<DeletedProductDto>(path(productId));
}

/** The calls the Products page makes. The page takes them as a prop so tests can replace them. */
export interface ProductsApi {
  list: (signal: AbortSignal) => Promise<ProductDto[]>;
  get: (productId: string, signal: AbortSignal) => Promise<ProductDetailDto>;
  create: typeof createProduct;
  update: typeof updateProduct;
  remove: typeof deleteProduct;
}

export const productsApi: ProductsApi = {
  list: fetchProducts,
  get: fetchProduct,
  create: createProduct,
  update: updateProduct,
  remove: deleteProduct,
};
