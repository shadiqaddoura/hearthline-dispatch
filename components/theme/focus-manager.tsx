"use client";

import {
  useArrowNavigationGroup,
  useFocusableGroup,
  useModalAttributes,
  useObservedElement,
} from "@fluentui/react-components";

/**
 * Starts every part of Fluent's focus manager (Tabster) that Fluent components
 * rely on. Render it once in each top-level screen, beside the Fluent
 * components it serves, not in the root layout.
 *
 * Tabster runs while any component uses it, and one tick after it starts it
 * reads the focus attributes already in the page. An attribute whose part
 * isn't started yet is skipped, with "<part> API used before initialization".
 * Next keeps visited routes in a hidden <Activity>: their effects stop, but
 * their attributes stay in the page. Without this component, the screen shown
 * next can start Tabster with only the parts it uses, and the hidden route's
 * other attributes are skipped.
 *
 * Not in the root layout: the root hydrates before the route's segment, so
 * Tabster would read the sidebar before React hydrates it and insert its focus
 * guards there, which breaks hydration.
 *
 * Each hook starts one part, exactly as the matching Fluent components do. The
 * attributes they return are deliberately unused.
 */
export function FocusManager() {
  useArrowNavigationGroup(); // arrow-key movement: sidebar, menus
  useFocusableGroup(); // focusable groups
  useModalAttributes(); // modal focus trapping and focus restoration: drawers, dialogs
  useObservedElement([]); // observed elements
  return null;
}
