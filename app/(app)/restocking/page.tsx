import { Suspense } from "react";
import { ProtectedPage } from "@/server/modules/auth/protected-page";
import type { Metadata } from "next";
import { RestockingView } from "@/components/restocking/restocking-view";

export const metadata: Metadata = { title: "Restocking" };

export default function RestockingPage() {
  return <Suspense fallback={null}><ProtectedPage><RestockingView /></ProtectedPage></Suspense>;
}
