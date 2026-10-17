"use client";

import { useRouter } from "next/navigation";

import {
  Card,
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

export function SignInScreen() {
  const styles = useStyles();
  const router = useRouter();

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

          <SignInForm onSignIn={signIn} onSignedIn={() => { router.replace("/products"); router.refresh(); }} />
        </Card>
      </main>
    </div>
  );
}
