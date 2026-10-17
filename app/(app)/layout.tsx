import { Suspense, type ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { AuthUserProvider } from "@/components/shell/auth-user-provider";
import { requirePageUser } from "@/server/modules/auth/request";

async function AuthenticatedShell({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  return <AuthUserProvider user={user}><AppShell>{children}</AppShell></AuthUserProvider>;
}
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}><AuthenticatedShell>{children}</AuthenticatedShell></Suspense>;
}
