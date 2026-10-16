import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RestockingView } from "@/components/restocking/restocking-view";
import { ApiRequestError } from "@/lib/api/client";
import type { RestockJobDto } from "@/lib/contracts/restocking";
import { collectedJob, paperJob, printerJob } from "../support/restock-fixtures";
import { renderWithFluent } from "../support/render";

const loads = (jobs: RestockJobDto[]) => vi.fn(() => Promise.resolve(jobs));
const vanButton = (code: string) =>
  screen.getAllByRole("button").find((b) => b.hasAttribute("aria-pressed") && b.textContent?.startsWith(code))!;
const details = () => screen.getByRole("region", { name: "Selected pick list" });
const pickTable = (code: string) => within(details()).getByRole("table", { name: `Pick list for ${code}` });
const row = (code: string, sku: string) => within(pickTable(code)).getByRole("row", { name: new RegExp(sku) });

describe("RestockingView", () => {
  it("announces loading, then lists vans in code order with what each needs", async () => {
    renderWithFluent(<RestockingView loadJobs={loads([paperJob, collectedJob, printerJob])} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading restock jobs…");
    const list = await screen.findByRole("list", { name: "Vans with an open restock job" });
    const vans = within(list).getAllByRole("button");
    expect(vans.map((v) => v.textContent?.slice(0, 3))).toEqual(["T-A", "T-B", "T-C"]);
    expect(vanButton("T-A")).toHaveTextContent("No driver");
    expect(vanButton("T-A")).toHaveTextContent("Partly collected");
    expect(vanButton("T-B")).toHaveTextContent("2 products to collect");
    expect(vanButton("T-B")).toHaveTextContent("2 broken units to return");
    expect(vanButton("T-C")).toHaveTextContent("Nothing left to collect");
  });

  it("shows the selected van's pick list with the backend's outstanding quantity, minimum and working stock", async () => {
    const { user } = renderWithFluent(<RestockingView loadJobs={loads([paperJob])} />);
    await user.click(await screen.findByText("T-B"));

    expect(within(details()).getByRole("heading", { name: "T-B restock" })).toBeVisible();
    expect(within(details()).getByText(/Driven by Driver of T-B/)).toBeVisible();
    // Minimum 10, working 4, but the backend says 5: the page shows the backend's number.
    expect(within(row("T-B", "TEST-CBL")).getAllByRole("cell").map((c) => c.textContent)).toEqual([
      "TEST-CBLTest cable",
      "Each",
      "10",
      "4",
      "5",
      "None yet",
    ]);
  });

  it("shows a partial box of paper as boxes plus rolls without losing the exact roll count", async () => {
    const { user } = renderWithFluent(<RestockingView loadJobs={loads([paperJob])} />);
    await user.click(await screen.findByText("T-B"));

    const paper = row("T-B", "TEST-PAP");
    expect(within(paper).getByText("1 box + 25 rolls")).toBeVisible();
    expect(within(paper).getByText("exactly 75 rolls")).toBeVisible();
    expect(within(paper).getByText("Whole boxes only: 2 boxes (25 rolls more than needed)")).toBeVisible();
    expect(within(paper).getByText("Roll, box of 50")).toBeVisible();
    expect(within(paper).getByText("100 rolls")).toBeVisible();
  });

  it("keeps broken equipment to return apart from working stock to collect", async () => {
    const { user } = renderWithFluent(<RestockingView loadJobs={loads([paperJob])} />);
    await user.click(await screen.findByText("T-B"));

    expect(within(pickTable("T-B")).queryByText("TEST-PRN")).not.toBeInTheDocument();
    const broken = within(details()).getByRole("region", { name: "Broken equipment to return" });
    expect(within(broken).getByText(/Test printer: 2/)).toBeVisible();
    expect(within(broken).getByText("Serials: DEAD-1 (1 without a recorded serial)")).toBeVisible();
  });

  it("explains products left off by policy, keeping the review warning", async () => {
    const { user } = renderWithFluent(<RestockingView loadJobs={loads([paperJob])} />);
    await user.click(await screen.findByText("T-B"));

    expect(within(details()).getByText("Not on this list: automatic restocking is off")).toBeVisible();
    expect(
      within(details()).getByText(/TEST-KDS Test kitchen display: T-B has 0 of a minimum of 1\. The policy is flagged for review: Provisionally excluded/),
    ).toBeVisible();
    expect(within(pickTable("T-B")).queryByText("TEST-KDS")).not.toBeInTheDocument();
  });

  it("separates what has been received from what is still planned, and flags a count below zero", async () => {
    const { user } = renderWithFluent(<RestockingView loadJobs={loads([printerJob])} />);
    await user.click(await screen.findByText("T-A"));

    expect(within(row("T-A", "TEST-PAP")).getByText("Nothing left")).toBeVisible();
    expect(within(row("T-A", "TEST-PAP")).getAllByText("100 rolls")).toHaveLength(3); // minimum, working, received
    expect(within(row("T-A", "TEST-PRN")).getByText("Below zero: counted as 0 until reviewed")).toBeVisible();
    expect(within(details()).getByText(/Already returned under this job/)).toBeVisible();
    const returned = within(details()).getAllByRole("listitem").find((li) => li.textContent?.includes("by Nadia"));
    expect(returned).toHaveTextContent(/TEST-PRN × 1 by Nadia, 16 Oct 2026, 10:00 \(OLD-1\)/);
  });

  it("says when nothing is left to collect, while still listing broken returns", async () => {
    const { user } = renderWithFluent(<RestockingView loadJobs={loads([collectedJob])} />);
    await user.click(await screen.findByText("T-C"));

    expect(within(details()).getByText("Nothing left to collect for T-C.")).toBeVisible();
    expect(within(details()).getByText("No serials recorded")).toBeVisible();
  });

  it("offers no collection or return actions: viewing is read-only", async () => {
    const { user } = renderWithFluent(<RestockingView loadJobs={loads([paperJob])} />);
    await user.click(await screen.findByText("T-B"));

    const actions = screen.getAllByRole("button").filter((b) => !b.hasAttribute("aria-pressed"));
    expect(actions.map((b) => b.textContent)).toEqual(["Refresh"]);
  });

  it("explains an empty list, and offers a retry when loading fails", async () => {
    const { unmount } = renderWithFluent(<RestockingView loadJobs={loads([])} />);
    expect(await screen.findByRole("heading", { name: "No van needs restocking" })).toBeVisible();
    unmount();

    const load = vi
      .fn<(signal: AbortSignal) => Promise<RestockJobDto[]>>()
      .mockRejectedValueOnce(new ApiRequestError("The server ran into a problem. Try again in a moment.", 500))
      .mockResolvedValueOnce([paperJob]);
    const { user } = renderWithFluent(<RestockingView loadJobs={load} />);
    expect(await screen.findByText("The restock list couldn't be loaded.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("T-B")).toBeVisible();
  });
});
