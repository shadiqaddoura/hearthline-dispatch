"use client";

import { useState } from "react";
import type { DemoAccount, DemoRole } from "@/lib/auth/demo";
import { useRouter } from "next/navigation";

import {
  Button,
  Card,
  Divider,
  MessageBar,
  MessageBarBody,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { BrandMark } from "@/components/brand/brand-mark";
import { FocusManager } from "@/components/theme/focus-manager";
import { signIn } from "@/lib/auth/sign-in";
import { SignInForm } from "./sign-in-form";

const useStyles = makeStyles({
  page: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  main: { width: "100%", maxWidth: "420px", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXL },
  brand: { display: "flex", flexDirection: "column", alignItems: "center", gap: tokens.spacingVerticalS, textAlign: "center" },
  heading: { margin: 0 },
  tagline: { color: tokens.colorNeutralForeground3 },
  card: {
    padding: tokens.spacingHorizontalXXL,
    gap: tokens.spacingVerticalL,
    "@media (max-width: 479px)": { padding: tokens.spacingHorizontalL },
  },
  cardTitle: { margin: 0 },
});

export function SignInScreen({ demoEnabled = false, demoAccounts = [] }: { demoEnabled?: boolean; demoAccounts?: DemoAccount[] }) {
  const styles = useStyles();
  const router = useRouter();
  const [pendingDemo, setPendingDemo] = useState<DemoRole | null>(null);
  const [demoError, setDemoError] = useState("");
  const signedIn = () => { router.replace("/products"); router.refresh(); };
  const signInAs = async (account: DemoAccount) => {
    const { role } = account;
    if (pendingDemo) return;
    setPendingDemo(role);
    setDemoError("");
    try {
      if (account.password) {
        const result = await signIn({ email: account.email, password: account.password });
        if (!result.ok) throw new Error(result.message);
        signedIn();
        return;
      }
      const response = await fetch("/api/auth/demo-sign-in", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error("Demo sign-in is unavailable. Try again or use your account credentials.");
      signedIn();
    } catch (error) {
      setDemoError(error instanceof Error ? error.message : "Demo sign-in failed.");
      setPendingDemo(null);
    }
  };

  return (
    <div className={styles.page}>
      <FocusManager />
      <main className={styles.main}>
        <div className={styles.brand}>
          <BrandMark size="large" />
          <Text as="h1" size={700} weight="semibold" className={styles.heading}>
            Hearthline Dispatch
          </Text>
          <Text className={styles.tagline}>Van stock and dispatch for field technicians</Text>
        </div>

        <Card className={styles.card}>
          <Text as="h2" size={500} weight="semibold" className={styles.cardTitle}>
            Sign in
          </Text>

          <SignInForm onSignIn={signIn} onSignedIn={signedIn} />
          {demoEnabled && <>
            <Divider>Demo accounts</Divider>
            <Text size={200}>Both demo accounts have full access to the shared application data.</Text>
            {demoError && <MessageBar intent="error"><MessageBarBody>{demoError}</MessageBarBody></MessageBar>}
            {demoAccounts.length === 0 && <Text>No demo accounts are available. Complete account setup first.</Text>}
            {demoAccounts.map((account) => {
              const label = account.role === "ADMIN" ? "Admin" : "Operations";
              return <div key={account.role}>
                <Text as="p" weight="semibold">{label} · {account.name}</Text>
                <Text as="p" size={200}>Email: <code>{account.email}</code></Text>
                {account.password && <Text as="p" size={200}>Demo password: <code>{account.password}</code></Text>}
                <Button disabled={pendingDemo !== null} onClick={() => void signInAs(account)}>
                  {pendingDemo === account.role ? "Signing in…" : `Sign in as ${label}`}
                </Button>
              </div>;
            })}
          </>}
        </Card>
      </main>
    </div>
  );
}
