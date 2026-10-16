import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { disposeTabster, getTabster } from "tabster";
import { afterEach, vi } from "vitest";

// Fluent dialogs and drawers mount in a portal and animate; the default 1s is tight when files run in parallel.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  // Every test shares one jsdom window, and Fluent's focus manager (Tabster) keeps
  // one instance per window. Start each test with a fresh one, as a new page would.
  const tabster = getTabster(window);
  if (tabster) disposeTabster(tabster, true);
});

// jsdom has no layout engine. Fluent and the app shell query these; desktop width by default.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
