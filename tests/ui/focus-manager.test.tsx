import { Activity, StrictMode, act } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { FluentProvider } from "@fluentui/react-components";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { AppShell } from "@/components/shell/app-shell";
import { SignInScreen } from "@/components/sign-in/sign-in-screen";
import { hearthlineLightTheme } from "@/components/theme/theme";
import { testBoard, waitingJobEligibility } from "../support/dispatch-fixtures";

vi.mock("next/navigation", () => ({
  usePathname: () => "/products",
  useRouter: () => ({ push: vi.fn() }),
}));

// Tabster and Keyborg only report these problems in development builds.
const FOCUS_MANAGER_ERROR = /API used before initialization|Keyborg instance .* disposed incorrectly/;

let consoleError: MockInstance<typeof console.error>;
let nodeEnv: string | undefined;

beforeEach(() => {
  nodeEnv = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "development";
  consoleError = vi.spyOn(console, "error");
});

afterEach(() => {
  consoleError.mockRestore();
  (process.env as Record<string, string | undefined>).NODE_ENV = nodeEnv;
});

/** Tabster reads the page one tick after it starts. */
const tabsterTick = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

const focusManagerErrors = () =>
  consoleError.mock.calls.map((args) => String(args[0])).filter((message) => FOCUS_MANAGER_ERROR.test(message));

type Route = "products" | "dispatch" | "sign-in";
const loadBoard = () => Promise.resolve(testBoard);
const loadEligibility = () => Promise.resolve(waitingJobEligibility);

/** The screens, shown and hidden the way Next keeps visited routes in <Activity>. */
function Routes({ visible }: { visible: Route }) {
  const mode = (route: Route) => (visible === route ? "visible" : "hidden");
  return (
    <StrictMode>
      <FluentProvider theme={hearthlineLightTheme}>
        <Activity mode={mode("products")}>
          <AppShell>catalogue</AppShell>
        </Activity>
        <Activity mode={mode("dispatch")}>
          {/* The board's request lists add arrow-key groups to the hidden route. */}
          <AppShell>
            <DispatchBoard loadBoard={loadBoard} loadEligibility={loadEligibility} />
          </AppShell>
        </Activity>
        <Activity mode={mode("sign-in")}>
          <SignInScreen />
        </Activity>
      </FluentProvider>
    </StrictMode>
  );
}

describe("Fluent focus manager", () => {
  it("starts and restarts under Strict Mode without errors", async () => {
    render(<Routes visible="products" />);
    await tabsterTick();

    expect(focusManagerErrors()).toEqual([]);
  });

  it("keeps working while a visited route is hidden and shown again", async () => {
    const { rerender } = render(<Routes visible="products" />);
    await tabsterTick();

    for (let round = 0; round < 3; round++) {
      for (const route of ["dispatch", "sign-in", "products"] as const) {
        rerender(<Routes visible={route} />);
        await tabsterTick();
      }
    }

    expect(focusManagerErrors()).toEqual([]);
  });
});
