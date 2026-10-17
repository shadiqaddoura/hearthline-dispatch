import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { SignInScreen } from "@/components/sign-in/sign-in-screen";
import { demoSignInEnabled, listDemoAccounts } from "@/server/modules/auth/demo.service";

export const metadata: Metadata = { title: "Sign in" };

async function SignInContent() {
  await connection();
  return <SignInScreen demoEnabled={demoSignInEnabled()} demoAccounts={await listDemoAccounts()} />;
}
export default function SignInPage() {
  return <Suspense fallback={null}><SignInContent /></Suspense>;
}
