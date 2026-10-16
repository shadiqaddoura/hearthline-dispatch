"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { makeStyles, tokens } from "@fluentui/react-components";
import { FocusManager } from "@/components/theme/focus-manager";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { destinationForPath } from "./navigation";
import { COMPACT_MEDIA_QUERY, useMediaQuery } from "./use-media-query";

const MAIN_ID = "main-content";

const useStyles = makeStyles({
  root: { display: "flex", minHeight: "100dvh", backgroundColor: tokens.colorNeutralBackground2 },
  column: { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: 0 },
  main: {
    flexGrow: 1,
    width: "100%",
    maxWidth: "1280px",
    marginInline: "auto",
    padding: tokens.spacingHorizontalXXL,
    "@media (max-width: 767px)": { padding: tokens.spacingHorizontalL },
    ":focus": { outlineStyle: "none" },
  },
  skipLink: {
    position: "absolute",
    left: tokens.spacingHorizontalS,
    top: "-100px",
    zIndex: 2,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorBrandForeground1,
    boxShadow: tokens.shadow8,
    ":focus": { top: tokens.spacingVerticalS },
  },
});

/** Sidebar, header and the main content area shared by every signed-in screen. */
export function AppShell({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const pathname = usePathname();
  const compact = useMediaQuery(COMPACT_MEDIA_QUERY);

  // Separate state per layout: collapsing the desktop sidebar shouldn't open the mobile drawer.
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navOpen = compact ? mobileOpen : desktopOpen;
  const setNavOpen = compact ? setMobileOpen : setDesktopOpen;

  const destination = destinationForPath(pathname);

  return (
    <div className={styles.root}>
      <FocusManager />
      <a href={`#${MAIN_ID}`} className={styles.skipLink}>
        Skip to main content
      </a>
      <AppSidebar
        type={compact ? "overlay" : "inline"}
        open={navOpen}
        onOpenChange={setNavOpen}
        selectedValue={destination?.value}
        viewportUnknown={compact === null}
      />
      <div className={styles.column}>
        <AppHeader
          title={destination?.label ?? "Hearthline Dispatch"}
          navOpen={navOpen}
          onToggleNav={() => setNavOpen(!navOpen)}
        />
        <main id={MAIN_ID} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
