import { Suspense } from "react";
import { ProtectedPage } from "@/server/modules/auth/protected-page";
import type { Metadata } from "next";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";

export const metadata: Metadata = { title: "Dispatch" };

export default function DispatchPage() {
  return <Suspense fallback={null}><ProtectedPage><DispatchBoard /></ProtectedPage></Suspense>;
}
