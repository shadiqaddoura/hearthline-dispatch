import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { disposeTabster, getTabster } from "tabster";
import { afterEach, vi } from "vitest";

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
