import { Suspense } from "react";
import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { ProtectedPage } from "@/server/modules/auth/protected-page";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <Suspense fallback={null}><ProtectedPage><SettingsView /></ProtectedPage></Suspense>;
}
