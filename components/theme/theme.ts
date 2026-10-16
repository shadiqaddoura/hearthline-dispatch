import { createLightTheme, type BrandVariants, type Theme } from "@fluentui/react-components";

/**
 * Hearthline's restrained teal, as the 16-step brand ramp Fluent derives its
 * brand tokens from. The light theme uses step 80 behind white text (5.2:1)
 * and step 70 for brand-coloured text and links (6.4:1), both above WCAG AA.
 */
export const hearthlineBrand: BrandVariants = {
  10: "#020F10",
  20: "#08201F",
  30: "#0C3130",
  40: "#0E3F3E",
  50: "#0F4D4C",
  60: "#0F5C5A",
  70: "#0D6A68",
  80: "#0A7976",
  90: "#2A8886",
  100: "#469795",
  110: "#5FA6A4",
  120: "#78B5B3",
  130: "#91C4C2",
  140: "#AAD3D1",
  150: "#C4E2E1",
  160: "#DEF0EF",
};

/** The one place the app's theme is defined. Swap this to change design direction. */
export const hearthlineLightTheme: Theme = createLightTheme(hearthlineBrand);
