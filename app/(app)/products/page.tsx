import type { Metadata } from "next";
import { ProductsView } from "@/components/products/products-view";

export const metadata: Metadata = { title: "Products Catalog" };

export default function ProductsPage() {
  return <ProductsView />;
}
