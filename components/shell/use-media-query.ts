"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Narrow screens get the overlay navigation drawer instead of the inline sidebar. */
export const COMPACT_MEDIA_QUERY = "(max-width: 767px)";

/**
 * Whether the media query matches. Returns null during the server render and
 * hydration, when the viewport is unknown, so callers can fall back to CSS.
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}
