"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import { CheckmarkRegular, CopyRegular } from "@fluentui/react-icons";
import type { DemoAccount } from "@/lib/auth/demo";
import { BrandMark } from "@/components/brand/brand-mark";
import { FocusManager } from "@/components/theme/focus-manager";
import { signIn } from "@/lib/auth/sign-in";
import { SignInForm } from "./sign-in-form";

const useStyles = makeStyles({
  page: {
    minHeight: "100dvh",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "clamp(20px, 4vw, 56px)",
    backgroundColor: tokens.colorNeutralBackground1,
    "@media (max-width: 959px)": { padding: "clamp(16px, 3vw, 28px)" },
  },
  card: {
    width: "min(100%, 520px)",
    display: "flex",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
  },
  panel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    width: "100%",
    boxSizing: "border-box",
    padding: "40px clamp(20px, 6vw, 40px)",
  },
  content: { width: "100%", maxWidth: "440px", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXL },
  brand: { display: "flex", flexDirection: "row", alignItems: "center", gap: tokens.spacingHorizontalL, minWidth: 0 },
  brandCopy: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: tokens.spacingVerticalXS, minWidth: 0 },
  heading: { margin: 0, fontSize: "clamp(22px, 2.5vw, 28px)", lineHeight: "1.2" },
  tagline: { color: tokens.colorNeutralForeground2 },
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  sectionTitle: { margin: 0 },
  demo: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  account: {
    minWidth: 0,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  credentials: { display: "grid", gap: tokens.spacingVerticalS, margin: "8px 0 0", minWidth: 0 },
  credential: { display: "grid", gridTemplateColumns: "68px minmax(0, 1fr) auto", alignItems: "center", columnGap: tokens.spacingHorizontalS, minWidth: 0 },
  label: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  value: { margin: 0, minWidth: 0, gridColumn: "2" },
  credentialInput: {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    padding: "5px 0",
    border: 0,
    backgroundColor: "transparent",
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    cursor: "text",
    ":focus-visible": { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: "2px" },
  },
  copyButton: { gridColumn: "3", gridRow: "1", minWidth: "32px", width: "32px", height: "32px", padding: 0 },
});

export function SignInScreen({ demoEnabled = false, demoAccounts = [] }: { demoEnabled?: boolean; demoAccounts?: DemoAccount[] }) {
  const styles = useStyles();
  const router = useRouter();
  const [copiedCredential, setCopiedCredential] = useState<string | null>(null);
  const signedIn = () => { router.replace("/products"); router.refresh(); };
  const copyCredential = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCredential(key);
      window.setTimeout(() => setCopiedCredential((current) => current === key ? null : current), 1800);
    } catch {
      setCopiedCredential(null);
    }
  };

  return (
    <div className={styles.page}>
      <FocusManager />
      <div className={styles.card}>
        <main className={styles.panel}>
          <div className={styles.content}>
          <header className={styles.brand}>
            <BrandMark size="large" />
            <div className={styles.brandCopy}>
              <Text as="h1" weight="semibold" className={styles.heading}>Hearthline Dispatch</Text>
              <Text className={styles.tagline}>Van stock and dispatch for field technicians</Text>
            </div>
          </header>

          <section className={styles.form} aria-labelledby="sign-in-heading">
            <Text as="h2" id="sign-in-heading" size={500} weight="semibold" className={styles.sectionTitle}>Sign in</Text>
            <SignInForm onSignIn={signIn} onSignedIn={signedIn} />
          </section>

          {demoEnabled && <section className={styles.demo} aria-labelledby="demo-accounts-heading">
            <Text as="h2" id="demo-accounts-heading" size={400} weight="semibold" className={styles.sectionTitle}>Demo accounts</Text>
            {demoAccounts.length === 0 && <Text>No demo accounts are available. Complete account setup first.</Text>}
            {demoAccounts.map((account) => {
              const label = account.role === "ADMIN" ? "Admin" : "Operations";
              const headingId = `demo-${account.role}-heading`;
              return <section key={account.role} className={styles.account} aria-labelledby={headingId}>
                <Text as="h3" id={headingId} weight="semibold" className={styles.sectionTitle}>{label}</Text>
                <dl className={styles.credentials}>
                  {[{ label: "Email", value: account.email }, ...(account.password ? [{ label: "Password", value: account.password }] : [])].map((credential) => {
                    const labelId = `demo-${account.role}-${credential.label}`;
                    const copyKey = `${account.role}-${credential.label}`;
                    const copied = copiedCredential === copyKey;
                    return <div className={styles.credential} key={credential.label}>
                      <dt id={labelId} className={styles.label}>{credential.label}</dt>
                      <dd className={styles.value}>
                        <input
                          className={styles.credentialInput}
                          aria-labelledby={labelId}
                          value={credential.value}
                          readOnly
                          spellCheck={false}
                          autoComplete="off"
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </dd>
                      <Button
                        className={styles.copyButton}
                        appearance="subtle"
                        size="small"
                        aria-label={`${copied ? "Copied" : "Copy"} ${label.toLowerCase()} ${credential.label.toLowerCase()}`}
                        title={copied ? "Copied" : `Copy ${credential.label.toLowerCase()}`}
                        onClick={() => void copyCredential(copyKey, credential.value)}
                        icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
                      />
                    </div>;
                  })}
                </dl>
              </section>;
            })}
          </section>}
          </div>
        </main>
      </div>
    </div>
  );
}
