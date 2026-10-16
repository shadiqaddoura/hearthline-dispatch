import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductsView } from "@/components/products/products-view";
import { ApiRequestError } from "@/lib/api/client";
import type { ProductDto } from "@/lib/contracts/products";
import { product } from "../support/products";
import { renderWithFluent } from "../support/render";

const catalogue: ProductDto[] = [
  product({ sku: "PAP-80", name: "Thermal paper 80mm", baseUnit: "roll", packUnit: "box", packSize: 50, vanMinimum: 100 }),
  product({ sku: "PRN-80", name: "Receipt printer 80mm", serialised: true, vanMinimum: 3 }),
  product({
    sku: "KDS-15",
    name: "Kitchen display 15in",
    serialised: true,
    autoRestock: false,
    restockPolicyNeedsReview: true,
    restockPolicyNote: "Hub says kitchen displays ship direct.",
  }),
];

const loads = (products: ProductDto[]) => vi.fn(() => Promise.resolve(products));
const table = () => screen.getByRole("table", { name: "Product catalogue" });
const bodyRows = () => within(table()).getAllByRole("row").slice(1);

describe("ProductsView", () => {
  it("announces loading, then lists products with their catalogue fields", async () => {
    renderWithFluent(<ProductsView loadProducts={loads(catalogue)} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading products…");
    expect(await screen.findByRole("table", { name: "Product catalogue" })).toBeVisible();
    expect(bodyRows()).toHaveLength(3);

    const paper = within(table()).getByRole("row", { name: /PAP-80/ });
    expect(paper).toHaveTextContent("Roll, box of 50");
    expect(paper).toHaveTextContent("100 rolls (2 boxes)");
    expect(paper).toHaveTextContent("Not tracked");
    expect(within(table()).getByRole("row", { name: /KDS-15/ })).toHaveTextContent("Off · needs review");
    expect(screen.getByText("3 products")).toBeVisible();
  });

  it("filters by name or SKU and offers to clear a search with no results", async () => {
    const { user } = renderWithFluent(<ProductsView loadProducts={loads(catalogue)} />);
    const search = await screen.findByRole("searchbox", { name: "Search products by name or SKU" });

    await user.type(search, "prn");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("1 of 3 products")).toBeVisible();

    await user.clear(search);
    await user.type(search, "display");
    expect(within(table()).getByRole("row", { name: /KDS-15/ })).toBeVisible();

    await user.type(search, "zzz");
    expect(screen.getByRole("heading", { name: "No matching products" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(bodyRows()).toHaveLength(3);
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
  });

  it("shows an error with a retry that loads again", async () => {
    const load = vi
      .fn<(signal: AbortSignal) => Promise<ProductDto[]>>()
      .mockRejectedValueOnce(new ApiRequestError("The server ran into a problem. Try again in a moment.", 500))
      .mockResolvedValueOnce(catalogue);
    const { user } = renderWithFluent(<ProductsView loadProducts={load} />);

    expect(await screen.findByText("The server ran into a problem. Try again in a moment.")).toBeVisible();
    expect(screen.getByRole("searchbox")).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("table", { name: "Product catalogue" })).toBeVisible();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("explains an empty catalogue instead of showing an empty table", async () => {
    renderWithFluent(<ProductsView loadProducts={loads([])} />);

    expect(await screen.findByRole("heading", { name: "No products yet" })).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toBeDisabled();
  });

  it("opens read-only details, including a policy flagged for review", async () => {
    const { user } = renderWithFluent(<ProductsView loadProducts={loads(catalogue)} />);

    await user.click(await screen.findByRole("button", { name: "Kitchen display 15in, view details" }));

    const details = await screen.findByRole("dialog", { name: "Kitchen display 15in details" });
    expect(within(details).getByText("Restocking policy needs review")).toBeVisible();
    expect(within(details).getByText("Hub says kitchen displays ship direct.")).toBeVisible();
    expect(within(details).getByText("Required for every unit")).toBeVisible();
    expect(within(details).getByText(/Editing products isn.t available yet/)).toBeVisible();
    expect(within(details).queryByRole("button", { name: /edit|delete/i })).not.toBeInTheDocument();
  });
});
