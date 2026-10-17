import { Suspense } from "react";
import { ProtectedPage } from "@/server/modules/auth/protected-page";
import type { Metadata } from "next";
import { InventoryView } from "@/components/inventory/inventory-view";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return <Suspense fallback={null}><ProtectedPage><InventoryView /></ProtectedPage></Suspense>;
}
