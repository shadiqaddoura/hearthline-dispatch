"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Text, makeStyles, tokens } from "@fluentui/react-components";
import type { DemoAccount } from "@/lib/auth/demo";
import { BrandMark } from "@/components/brand/brand-mark";
import { FocusManager } from "@/components/theme/focus-manager";
import { signIn } from "@/lib/auth/sign-in";
import maintenancePhoto from "@/public/replacing-paper-maintenance-guy.png";
import { SignInForm } from "./sign-in-form";

const useStyles = makeStyles({
  page: {
    minHeight: "100dvh",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(440px, 1fr)",
    backgroundColor: tokens.colorNeutralBackground1,
    "@media (max-width: 959px)": { gridTemplateColumns: "minmax(0, 1fr)" },
  },
  photo: {
    position: "sticky",
    top: 0,
    height: "100dvh",
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
    "@media (max-width: 959px)": { position: "relative", height: "clamp(160px, 26vw, 260px)" },
  },
  panel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    padding: "48px clamp(24px, 4vw, 64px)",
    "@media (max-width: 479px)": { padding: "28px 20px" },
  },
  content: { width: "100%", maxWidth: "440px", display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXXL },
  brand: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: tokens.spacingVerticalS },
  heading: { margin: 0, fontSize: "clamp(26px, 3vw, 32px)", lineHeight: "1.2" },
  tagline: { color: tokens.colorNeutralForeground2 },
  form: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalL },
  sectionTitle: { margin: 0 },
  demo: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    paddingTop: tokens.spacingVerticalXL,
  },
  account: {
    minWidth: 0,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground2,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  credentials: { display: "grid", gap: tokens.spacingVerticalM, margin: "12px 0 0", minWidth: 0 },
  credential: { display: "grid", gap: tokens.spacingVerticalXS, minWidth: 0 },
  label: { color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  value: { margin: 0, minWidth: 0 },
  credentialInput: {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
    padding: "10px 12px",
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase300,
    cursor: "text",
    ":focus-visible": { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: "2px" },
  },
});

export function SignInScreen({ demoEnabled = false, demoAccounts = [] }: { demoEnabled?: boolean; demoAccounts?: DemoAccount[] }) {
  const styles = useStyles();
  const router = useRouter();
  const signedIn = () => { router.replace("/products"); router.refresh(); };

  return (
    <div className={styles.page}>
      <FocusManager />
      <figure className={styles.photo}>
        <Image
          src={maintenancePhoto}
          alt="Field technician replacing a receipt printer paper roll at a restaurant counter."
          fill
          sizes="(max-width: 959px) 100vw, 50vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
          placeholder="blur"
          preload
        />
      </figure>
      <main className={styles.panel}>
        <div className={styles.content}>
          <header className={styles.brand}>
            <BrandMark size="large" />
            <Text as="h1" weight="semibold" className={styles.heading}>Hearthline Dispatch</Text>
            <Text className={styles.tagline}>Van stock and dispatch for field technicians</Text>
          </header>

          <section className={styles.form} aria-labelledby="sign-in-heading">
            <Text as="h2" id="sign-in-heading" size={500} weight="semibold" className={styles.sectionTitle}>Sign in</Text>
            <SignInForm onSignIn={signIn} onSignedIn={signedIn} />
          </section>

          {demoEnabled && <section className={styles.demo} aria-labelledby="demo-accounts-heading">
            <Text as="h2" id="demo-accounts-heading" size={400} weight="semibold" className={styles.sectionTitle}>Demo accounts</Text>
            <Text size={200} className={styles.tagline}>Use these credentials in the form above. Both accounts have full access.</Text>
            {demoAccounts.length === 0 && <Text>No demo accounts are available. Complete account setup first.</Text>}
            {demoAccounts.map((account) => {
              const label = account.role === "ADMIN" ? "Admin" : "Operations";
              const headingId = `demo-${account.role}-heading`;
              return <section key={account.role} className={styles.account} aria-labelledby={headingId}>
                <Text as="h3" id={headingId} weight="semibold" className={styles.sectionTitle}>{label}</Text>
                <dl className={styles.credentials}>
                  {[{ label: "Email", value: account.email }, ...(account.password ? [{ label: "Password", value: account.password }] : [])].map((credential) => {
                    const labelId = `demo-${account.role}-${credential.label}`;
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
                    </div>;
                  })}
                </dl>
              </section>;
            })}
          </section>}
        </div>
      </main>
    </div>
  );
}
