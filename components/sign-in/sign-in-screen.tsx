"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Text, makeStyles, tokens } from "@fluentui/react-components";
import { CheckmarkRegular, CopyRegular } from "@fluentui/react-icons";
import type { DemoAccount } from "@/lib/auth/demo";
import { BrandMark } from "@/components/brand/brand-mark";
import { FocusManager } from "@/components/theme/focus-manager";
import { signIn } from "@/lib/auth/sign-in";
import maintenancePhoto from "@/public/replacing-paper-maintenance-guy.png";
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
    width: "min(100%, 960px)",
    minHeight: "min(600px, calc(100dvh - 112px))",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
    "@media (max-width: 959px)": {
      width: "min(100%, 680px)",
      minHeight: 0,
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  photo: {
    position: "relative",
    height: "100%",
    minHeight: "min(600px, calc(100dvh - 112px))",
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    backgroundColor: "#153632",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      backgroundImage: "linear-gradient(180deg, rgba(10, 121, 118, 0.18), rgba(5, 47, 46, 0.46))",
      pointerEvents: "none",
    },
    "@media (max-width: 959px)": { height: "clamp(150px, 22vw, 230px)", minHeight: 0 },
  },
  panel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    padding: "48px clamp(28px, 4vw, 56px)",
    "@media (max-width: 479px)": { padding: "28px 20px" },
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
        <figure className={styles.photo}>
          <Image
            src={maintenancePhoto}
            alt="Field technician replacing a receipt printer paper roll at a restaurant counter."
            fill
            sizes="(max-width: 959px) 100vw, 560px"
            style={{ objectFit: "cover", objectPosition: "center" }}
            placeholder="blur"
            preload
          />
        </figure>
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
