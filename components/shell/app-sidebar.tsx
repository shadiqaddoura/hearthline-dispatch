"use client";

import { Fragment, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Hamburger,
  NavDrawer,
  NavDrawerBody,
  NavDrawerHeader,
  NavItem,
  NavSectionHeader,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
  useRestoreFocusSource,
} from "@fluentui/react-components";
import { BrandMark } from "@/components/brand/brand-mark";
import { NAV_DESTINATIONS, NAV_SECTIONS, type AvailableDestination } from "./navigation";

export const SIDEBAR_ID = "app-navigation";
const PLANNED_NOTE_ID = "nav-planned-note";

const useStyles = makeStyles({
  drawer: { height: "100dvh", position: "sticky", top: 0 },
  /** Before the viewport is known, hide the inline sidebar on narrow screens instead of flashing it. */
  hiddenWhenNarrow: { "@media (max-width: 767px)": { display: "none" } },
  header: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalS,
  },
  itemLabel: { display: "flex", alignItems: "center", justifyContent: "space-between", flexGrow: 1, gap: tokens.spacingHorizontalS },
  planned: { color: tokens.colorNeutralForeground3, cursor: "default" },
  visuallyHidden: {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
});

interface AppSidebarProps {
  /** "overlay" on narrow screens, where it is a modal drawer. */
  type: "inline" | "overlay";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedValue: string | undefined;
  /** True until the viewport size is known on the client. */
  viewportUnknown: boolean;
}

export function AppSidebar({ type, open, onOpenChange, selectedValue, viewportUnknown }: AppSidebarProps) {
  const styles = useStyles();
  const router = useRouter();
  // On close, focus returns to the header's menu button (marked with useRestoreFocusTarget).
  const restoreFocusSource = useRestoreFocusSource();

  // NavItem renders a plain <a>. Route ordinary clicks through the client router
  // so the shell stays mounted; modified clicks (new tab etc.) keep browser behaviour.
  const navigate = (event: MouseEvent<HTMLElement>, destination: AvailableDestination) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    router.push(destination.href);
    if (type === "overlay") onOpenChange(false);
  };

  return (
    <NavDrawer
      {...restoreFocusSource}
      id={SIDEBAR_ID}
      type={type}
      open={open}
      onOpenChange={(_, data) => onOpenChange(data.open)}
      selectedValue={selectedValue ?? ""}
      className={mergeClasses(type === "inline" && styles.drawer, viewportUnknown && styles.hiddenWhenNarrow)}
      aria-label="Main navigation"
    >
      <NavDrawerHeader className={styles.header}>
        {type === "overlay" && <Hamburger aria-label="Close navigation" onClick={() => onOpenChange(false)} />}
        <div className={styles.brand}>
          <BrandMark />
          <Text weight="semibold" size={400}>
            Hearthline Dispatch
          </Text>
        </div>
      </NavDrawerHeader>
      <NavDrawerBody>
        <span id={PLANNED_NOTE_ID} className={styles.visuallyHidden}>
          Not built yet. Coming in a later milestone.
        </span>
        {NAV_SECTIONS.map((section) => (
          <Fragment key={section}>
            <NavSectionHeader>{section}</NavSectionHeader>
            {NAV_DESTINATIONS.filter((d) => d.section === section).map((destination) => {
              const Icon = destination.icon;
              if (destination.status === "available") {
                return (
                  <NavItem
                    key={destination.value}
                    value={destination.value}
                    href={destination.href}
                    icon={<Icon />}
                    onClick={(event) => navigate(event, destination)}
                  >
                    {destination.label}
                  </NavItem>
                );
              }
              return (
                <NavItem
                  key={destination.value}
                  value={destination.value}
                  as="button"
                  disabledFocusable
                  aria-describedby={PLANNED_NOTE_ID}
                  icon={<Icon />}
                  className={styles.planned}
                >
                  <span className={styles.itemLabel}>
                    {destination.label}{" "}
                    <Badge appearance="tint" color="informative" size="small">
                      Soon
                    </Badge>
                  </span>
                </NavItem>
              );
            })}
          </Fragment>
        ))}
      </NavDrawerBody>
    </NavDrawer>
  );
}
