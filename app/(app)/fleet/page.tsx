import { Suspense } from "react";
import { ProtectedPage } from "@/server/modules/auth/protected-page";
import type { Metadata } from "next";
import { FleetView } from "@/components/fleet/fleet-view";
export const metadata: Metadata = { title: "Fleet" };
export default function FleetPage() { return <Suspense fallback={null}><ProtectedPage><FleetView /></ProtectedPage></Suspense>; }
