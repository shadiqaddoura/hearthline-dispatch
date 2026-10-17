"use client";
import type { ReactNode } from "react";
import { Button, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, mergeClasses, OverlayDrawer, makeStyles, tokens, useRestoreFocusSource } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";
const useStyles = makeStyles({
  sheet: { "@media (max-width: 479px)": { width: "100vw", maxWidth: "100vw" } },
  wideSheet: { width: "min(920px, 100vw)", maxWidth: "100vw" },
  body: { display: "flex", flexDirection: "column", gap: tokens.spacingVerticalXL },
  footer: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
});
/** Products viewing-sheet dimensions, Fluent overlay/motion and the shared mobile pattern. */
export function FleetSheet({ title, open, onClose, children, footer, busy = false, wide = false }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; footer: ReactNode; busy?: boolean; wide?: boolean;
}) {
  const styles = useStyles();
  const restore = useRestoreFocusSource();
  return <OverlayDrawer {...restore} position="end" size="medium" className={mergeClasses(styles.sheet, wide && styles.wideSheet)} open={open} onOpenChange={(_, d) => { if (!d.open) onClose(); }} aria-label={title}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Close sheet" icon={<DismissRegular />} disabled={busy} onClick={onClose} />}>{title}</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody className={styles.body}>{children}</DrawerBody>
    <DrawerFooter className={styles.footer}>{footer}</DrawerFooter>
  </OverlayDrawer>;
}
