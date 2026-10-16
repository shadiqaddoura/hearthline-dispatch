import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import { renderWithFluent } from "../support/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/products",
  useRouter: () => ({ push }),
}));

describe("AppShell", () => {
  it("titles the page and marks Products as the current page", () => {
    renderWithFluent(<AppShell>content</AppShell>);

    expect(screen.getByRole("heading", { level: 1, name: "Products" })).toBeVisible();
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("main")).toHaveTextContent("content");
  });

  it("shows unfinished areas as disabled, explained items rather than links", () => {
    renderWithFluent(<AppShell>content</AppShell>);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });

    for (const label of ["Dispatch", "Fleet", "Inventory", "Restocking", "Imports"]) {
      const item = within(nav).getByRole("button", { name: `${label} Soon` });
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(item).toHaveAccessibleDescription(/not built yet/i);
    }
    expect(within(nav).getAllByRole("link")).toHaveLength(1);
  });

  it("collapses and reopens the sidebar from the header button", async () => {
    const { user } = renderWithFluent(<AppShell>content</AppShell>);
    const toggle = screen.getByRole("button", { name: "Hide navigation" });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Show navigation" })).toHaveAttribute("aria-expanded", "false");
  });

  it("is honest that this is an unauthenticated demo", async () => {
    const { user } = renderWithFluent(<AppShell>content</AppShell>);

    expect(screen.getByText("Demo session")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Demo session: not signed in" }));
    await user.click(await screen.findByRole("menuitem", { name: "Leave demo" }));
    expect(push).toHaveBeenCalledWith("/sign-in");
  });
});
