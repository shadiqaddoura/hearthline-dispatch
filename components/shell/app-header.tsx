"use client";

import { useRouter } from "next/navigation";
import {
  Avatar,
  Badge,
  Button,
  Hamburger,
  Menu,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  makeStyles,
  tokens,
  useRestoreFocusTarget,
} from "@fluentui/react-components";
import { SignOutRegular } from "@fluentui/react-icons";
import { SIDEBAR_ID } from "./app-sidebar";

const useStyles = makeStyles({
  header: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalM,
    minHeight: "56px",
    paddingInline: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  title: {
    margin: 0,
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  account: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalS, flexShrink: 0 },
  demoBadge: { flexShrink: 0, whiteSpace: "nowrap" },
  // Phones get the short label; the title truncates before the badge does.
  wideLabel: { "@media (max-width: 479px)": { display: "none" } },
  narrowLabel: { display: "none", "@media (max-width: 479px)": { display: "inline" } },
  menuNote: { display: "block", maxWidth: "240px", paddingInline: tokens.spacingHorizontalS, color: tokens.colorNeutralForeground3 },
});

interface AppHeaderProps {
  title: string;
  navOpen: boolean;
  onToggleNav: () => void;
}

export function AppHeader({ title, navOpen, onToggleNav }: AppHeaderProps) {
  const styles = useStyles();
  const router = useRouter();
  const restoreFocusTarget = useRestoreFocusTarget();

  return (
    <header className={styles.header}>
      <Hamburger
        {...restoreFocusTarget}
        aria-label={navOpen ? "Hide navigation" : "Show navigation"}
        aria-expanded={navOpen}
        aria-controls={SIDEBAR_ID}
        onClick={onToggleNav}
      />
      <Text as="h1" size={500} weight="semibold" className={styles.title}>
        {title}
      </Text>
      <div className={styles.account}>
        <Badge appearance="tint" color="warning" className={styles.demoBadge}>
          <span className={styles.wideLabel}>Demo session</span>
          <span className={styles.narrowLabel}>Demo</span>
        </Badge>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" shape="circular" aria-label="Demo session: not signed in" icon={<Avatar size={28} />} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuGroup>
                <MenuGroupHeader>Demo session</MenuGroupHeader>
                <Text size={200} className={styles.menuNote}>
                  You are not signed in. Authentication isn&apos;t built yet, so anyone with the link can view this preview.
                </Text>
              </MenuGroup>
              <MenuDivider />
              <MenuItem icon={<SignOutRegular />} onClick={() => router.push("/sign-in")}>
                Leave demo
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </header>
  );
}
