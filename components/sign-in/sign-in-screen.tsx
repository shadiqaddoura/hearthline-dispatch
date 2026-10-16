"use client";

import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Divider,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { ArrowRightRegular } from "@fluentui/react-icons";
import { BrandMark } from "@/components/brand/brand-mark";
import { FocusManager } from "@/components/theme/focus-manager";
import { previewSignIn } from "@/lib/auth/sign-in";
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
  demo: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalS },
  demoNote: { color: tokens.colorNeutralForeground3 },
});

/**
 * Authentication UI preview. Hearthline has no authentication yet: the form
 * validates input but never checks credentials, and the demo entry is a plain
 * link into the app, not a sign-in.
 */
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

          <MessageBar intent="info" layout="multiline">
            <MessageBarBody>
              <MessageBarTitle>Preview</MessageBarTitle>
              Authentication isn&apos;t built yet. Nothing you enter is checked or sent anywhere.
            </MessageBarBody>
          </MessageBar>

          <SignInForm onSignIn={previewSignIn} onSignedIn={() => router.push("/products")} />

          <Divider>or</Divider>

          <div className={styles.demo}>
            <Button
              as="a"
              href="/products"
              appearance="secondary"
              size="large"
              icon={<ArrowRightRegular />}
              iconPosition="after"
            >
              Continue to demo
            </Button>
            <Text size={200} className={styles.demoNote}>
              Opens the app without an account. Anyone with the link can do this until authentication is added.
            </Text>
          </div>
        </Card>
      </main>
    </div>
  );
}
