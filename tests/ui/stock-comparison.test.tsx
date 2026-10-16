import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobItemsOnVan } from "@/components/dispatch/stock-summary";
import { testBoard, waitingJob } from "../support/dispatch-fixtures";
import { renderWithFluent } from "../support/render";

const item = { ...waitingJob.items[0], quantity: 2 };
const lines = testBoard.vans.find((entry) => entry.van.code === "T-N")!.stock.lines;
const shortages = [{ productId: item.productId, sku: item.sku, required: 2, available: 0, needsVerification: 1 }];

const comparison = <JobItemsOnVan items={[item]} lines={lines} vanCode="T-N" shortages={shortages} />;

describe("required product comparison", () => {
  it("uses the current eligibility quantities and keeps unverified units out of the assignable shortfall", () => {
    renderWithFluent(comparison);
    const table = screen.getByRole("table", { name: "Product comparison on T-N" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Product", "Needed", "Available", "Shortfall"]);
    const row = within(table).getByRole("row", { name: /Test printer/ });
    // The board snapshot has 1 available, but the newer eligibility answer says 0.
    expect(
      within(row)
        .getAllByRole("cell")
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(["2", "0", "2"]);
    expect(within(row).getByText("Unverified serials: 1")).toBeVisible();
    expect(screen.getByText(/unverified units are physically present but unavailable/)).toBeVisible();
    expect(within(row).getByText("Working 3 · Reserved 1 · Broken 1")).toBeVisible();
    expect(within(row).getByText("TEST-PRN")).toBeVisible();
  });

  it("shows zero shortfall for a product covered by the eligibility check", () => {
    renderWithFluent(<JobItemsOnVan items={waitingJob.items} lines={lines} vanCode="T-N" shortages={[]} />);
    const row = screen.getByRole("row", { name: /Test printer/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(["1", "1", "0"]);
  });

  it("does not invent an eligibility shortfall for already assigned work", () => {
    renderWithFluent(<JobItemsOnVan items={waitingJob.items} lines={lines} vanCode="T-N" />);
    const row = screen.getByRole("row", { name: /Test printer/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(["1", "1", "Not checked"]);
  });

  it("uses labelled product cards on mobile with the same shortage quantities", () => {
    const original = vi.mocked(window.matchMedia).getMockImplementation()!;
    const media = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query) => ({ ...original(query), matches: query === "(max-width: 600px)" }));
    try {
      renderWithFluent(comparison);
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      const card = within(screen.getByRole("list", { name: "Product comparison on T-N" })).getByRole("listitem");
      expect(within(card).getByText("Test printer")).toBeVisible();
      expect(
        within(card)
          .getAllByRole("term")
          .map((term) => term.textContent),
      ).toEqual(["Needed", "Available", "Shortfall"]);
      expect(
        within(card)
          .getAllByRole("definition")
          .map((value) => value.textContent),
      ).toEqual(["2", "0", "2"]);
      expect(within(card).getByText(/Unverified serials: 1/)).toBeVisible();
    } finally {
      media.mockRestore();
    }
  });
});
