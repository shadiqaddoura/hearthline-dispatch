import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobItemsOnVan, StockTable } from "@/components/dispatch/stock-summary";
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
    expect(within(row).queryByText(/Unverified serials/)).not.toBeInTheDocument();
    expect(screen.getByText(/unverified units are physically present but unavailable/)).toBeVisible();
    expect(within(row).queryByText(/Working 3/)).not.toBeInTheDocument();
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
      expect(within(card).queryByText(/Working|Unverified serials/)).not.toBeInTheDocument();
    } finally {
      media.mockRestore();
    }
  });
});

describe("structured stock details", () => {
  it("has a visible full-inventory title and separate numeric condition columns", () => {
    renderWithFluent(
      <StockTable
        lines={[
          { ...lines[0], working: 11, verifiedWorking: 7, reserved: 2, available: 5, broken: 3, needsVerification: 4 },
        ]}
        title="Full inventory on T-N"
      />,
    );
    expect(screen.getByRole("heading", { name: "Full inventory on T-N" })).toBeVisible();
    const table = screen.getByRole("table", { name: "Full inventory on T-N" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Product", "Working", "Reserved", "Available", "Broken", "Unverified"]);
    const row = within(table).getByRole("row", { name: /Test printer/ });
    expect(
      within(row)
        .getAllByRole("cell")
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(["11", "2", "5", "3", "4"]);
    expect(within(table).queryByText(/1 broken|1 need a serial/)).not.toBeInTheDocument();
  });

  it("keeps the comparison to four columns and reveals required-product stock only on request", async () => {
    const { user } = renderWithFluent(
      <JobItemsOnVan items={[item]} lines={lines} vanCode="T-N" shortages={shortages} showStockDetails />,
    );
    expect(screen.getByRole("table", { name: "Product comparison on T-N" })).toBeVisible();
    expect(screen.queryByRole("table", { name: "Required-product stock on T-N" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stock details" }));
    const table = screen.getByRole("table", { name: "Required-product stock on T-N" });
    expect(within(table).getAllByRole("row")).toHaveLength(2); // only the required printer, not all van stock
    expect(within(table).queryByText("Test cable")).not.toBeInTheDocument();
    expect(
      within(within(table).getByRole("row", { name: /Test printer/ }))
        .getAllByRole("cell")
        .slice(1)
        .map((cell) => cell.textContent),
    ).toEqual(["3", "1", "1", "1", "1"]);
  });

  it("keeps mobile stock counts labelled and preserves negative-count warnings", () => {
    const original = vi.mocked(window.matchMedia).getMockImplementation()!;
    const media = vi
      .spyOn(window, "matchMedia")
      .mockImplementation((query) => ({ ...original(query), matches: query === "(max-width: 1023px)" }));
    try {
      renderWithFluent(
        <StockTable lines={[{ ...lines[0], working: -2, available: 0 }]} title="Full inventory on T-N" />,
      );
      expect(screen.getByRole("heading", { name: "Full inventory on T-N" })).toBeVisible();
      const card = within(screen.getByRole("list", { name: "Full inventory on T-N" })).getByRole("listitem");
      expect(
        within(card)
          .getAllByRole("term")
          .map((term) => term.textContent),
      ).toEqual(["Working", "Reserved", "Available", "Broken", "Unverified"]);
      expect(
        within(card)
          .getAllByRole("definition")
          .map((value) => value.textContent),
      ).toEqual(["-2", "1", "0", "1", "1"]);
      expect(within(card).getByText("Count below zero — needs a recount")).toBeVisible();
    } finally {
      media.mockRestore();
    }
  });
});
