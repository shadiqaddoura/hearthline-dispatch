import { Suspense } from "react";
import { ProtectedPage } from "@/server/modules/auth/protected-page";
import type { Metadata } from "next";
import { ProductsView } from "@/components/products/products-view";

export const metadata: Metadata = { title: "Products Catalog" };

export default function ProductsPage() {
  return <Suspense fallback={null}><ProtectedPage><ProductsView /></ProtectedPage></Suspense>;
}
