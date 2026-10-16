import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { ApiRequestError } from "@/lib/api/client";
import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import {
  testBoard,
  undatedJob,
  undatedJobEligibility,
  waitingJob,
  waitingJobEligibility,
} from "../support/dispatch-fixtures";
import { renderWithFluent } from "../support/render";

const loadsBoard = (board: DispatchBoardDto = testBoard) => vi.fn(() => Promise.resolve(board));

/** Answers per job, like the eligibility endpoint. */
const loadsEligibility = (byJob: Record<string, VanEligibilityDto[]>) =>
  vi.fn((jobId: string) => Promise.resolve(byJob[jobId] ?? []));

/** A request in the list: a toggle button (aria-pressed) whose text includes `text`. */
const requestButton = (text: string) =>
  screen.getAllByRole("button").find((b) => b.hasAttribute("aria-pressed") && b.textContent?.includes(text))!;

const vanCard = (code: string) => screen.getByRole("group", { name: code });
const selectedRequest = () => screen.getByRole("region", { name: "Selected request" });

type LoadBoard = (signal: AbortSignal) => Promise<DispatchBoardDto>;
type LoadEligibility = (jobId: string, signal: AbortSignal) => Promise<VanEligibilityDto[]>;

function renderBoard(
  loadBoard: LoadBoard = loadsBoard(),
  loadEligibility: LoadEligibility = loadsEligibility({
    [waitingJob.id]: waitingJobEligibility,
    [undatedJob.id]: undatedJobEligibility,
  }),
) {
  return { ...renderWithFluent(<DispatchBoard loadBoard={loadBoard} loadEligibility={loadEligibility} />), loadEligibility };
}

describe("DispatchBoard", () => {
  it("announces loading, then separates waiting requests from assigned work", async () => {
    renderBoard();

    expect(screen.getByRole("status")).toHaveTextContent("Loading the dispatch board…");
    const awaiting = await screen.findByRole("region", { name: "Awaiting assignment (2)" });
    const assigned = screen.getByRole("region", { name: "Assigned or in progress (1)" });

    expect(within(awaiting).getByText("Harbour Cafe")).toBeVisible();
    expect(within(awaiting).getByText("Waiting 14 days")).toBeVisible();
    expect(within(assigned).getByText("Olive Room")).toBeVisible();
    expect(within(assigned).getByText(/T-N, Sun 18 Oct 2026 · #1 in the van's day/)).toBeVisible();
    expect(screen.getByText("Select a request to see its details and which vans can take it.")).toBeVisible();
  });

  it("shows a missing request date explicitly rather than a waiting time", async () => {
    const { user } = renderBoard();
    await screen.findByText("Lantern Diner");

    expect(within(requestButton("Lantern Diner")).getByText("Request date not recorded")).toBeVisible();
    await user.click(requestButton("Lantern Diner"));

    const details = selectedRequest();
    expect(within(details).getByText("Not recorded")).toBeVisible();
    expect(within(details).getByText(/waiting time can't be counted/)).toBeVisible();
    expect(within(details).getByText("Imported row had no request date.")).toBeVisible();
  });

  it("selecting a request shows its details and highlights the vans the backend says can take it", async () => {
    const { user, loadEligibility } = renderBoard();
    await screen.findByText("Harbour Cafe");

    await user.click(requestButton("Harbour Cafe"));

    expect(requestButton("Harbour Cafe")).toHaveAttribute("aria-pressed", "true");
    const details = selectedRequest();
    expect(within(details).getByRole("heading", { name: "Harbour Cafe — Test Street" })).toBeVisible();
    expect(within(details).getByText("Fri 2 Oct 2026")).toBeVisible();
    expect(within(details).getByRole("table", { name: "Products required for T-WAIT" })).toHaveTextContent("TEST-PRN");

    expect(await within(details).findByText(/2 vans can take this job:/)).toBeVisible();
    expect(within(details).getByText(/T-N \(same zone\), T-S/)).toBeVisible();
    expect(loadEligibility).toHaveBeenCalledWith(waitingJob.id, expect.any(AbortSignal));

    // Cross-zone T-S is still eligible: zone is a preference.
    expect(within(vanCard("T-N")).getByText("Can take this job")).toBeVisible();
    expect(within(vanCard("T-N")).getByText("Same zone")).toBeVisible();
    expect(within(vanCard("T-S")).getByText("Can take this job")).toBeVisible();
    expect(within(vanCard("T-S")).queryByText("Same zone")).not.toBeInTheDocument();

    const garage = vanCard("T-G");
    expect(within(garage).getByText("Can't take this job")).toBeVisible();
    expect(within(garage).getByText("Vehicle unavailable:")).toBeVisible();
    expect(within(garage).getByText(/T-G is in the garage/)).toBeVisible();
    expect(within(garage).getByText("No technician:")).toBeVisible();

    // Vans follow the backend's ranking.
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent).filter((t) => t?.startsWith("T-"))).toEqual([
      "T-N",
      "T-S",
      "T-G",
    ]);
  });

  it("explains why no van can take a request, with the backend's shortage figures", async () => {
    const { user } = renderBoard();
    await screen.findByText("Lantern Diner");

    await user.click(requestButton("Lantern Diner"));

    expect(await screen.findByText("No van can take this job right now.")).toBeVisible();
    const north = vanCard("T-N");
    expect(within(north).getByText("Serials not recorded:")).toBeVisible();
    expect(within(north).getByText(/TEST-PRN: needs 2, 1 available \(1 waiting for a serial\)/)).toBeVisible();
    expect(within(vanCard("T-S")).getByText("Not enough equipment:")).toBeVisible();
    expect(within(vanCard("T-S")).getByText(/TEST-PRN: needs 2, 0 available/)).toBeVisible();
  });

  it("keeps physical, reserved and available stock apart, and never counts broken or unverified units", async () => {
    const { user } = renderBoard();
    await screen.findByText("Harbour Cafe");
    const north = vanCard("T-N");

    await user.click(within(north).getByRole("button", { name: /All stock/ }));
    const row = within(within(north).getByRole("table", { name: /T-N stock/ })).getByRole("row", { name: /TEST-PRN/ });
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toContain("1 broken");
    expect(cells[0]).toContain("1 need a serial");
    expect(cells.slice(1)).toEqual(["3", "1", "1"]); // working, reserved, available
  });

  it("shows assigned work with its van and schedule, without asking for eligibility or offering actions", async () => {
    const { user, loadEligibility } = renderBoard();
    await screen.findByText("Olive Room");

    await user.click(requestButton("Olive Room"));

    const details = selectedRequest();
    expect(within(details).getByText("T-N with Driver of T-N")).toBeVisible();
    expect(within(details).getByText("Sun 18 Oct 2026 · #1 in the van's day")).toBeVisible();
    expect(within(details).getByText("Sat 10 Oct 2026")).toBeVisible(); // request date, not the scheduled date
    expect(within(details).getByText("Waiting 6 days")).toBeVisible();
    expect(within(vanCard("T-N")).getByText("Has T-ASSIGNED")).toBeVisible();
    expect(loadEligibility).not.toHaveBeenCalled();
    // No assignment or scheduling actions: the only buttons naming them are the request list items.
    const actions = screen.getAllByRole("button").filter((b) => !b.hasAttribute("aria-pressed"));
    expect(actions.filter((b) => /assign|schedul/i.test(b.textContent ?? ""))).toEqual([]);
  });

  it("shows only the latest request's eligibility when the selection changes quickly", async () => {
    let answerFirst!: (vans: VanEligibilityDto[]) => void;
    const loadEligibility = vi.fn((jobId: string, signal: AbortSignal) =>
      jobId === waitingJob.id
        ? new Promise<VanEligibilityDto[]>((resolve) => {
            answerFirst = resolve;
            signal.addEventListener("abort", () => resolve(waitingJobEligibility));
          })
        : Promise.resolve(undatedJobEligibility),
    );
    const { user } = renderBoard(loadsBoard(), loadEligibility);
    await screen.findByText("Harbour Cafe");

    await user.click(requestButton("Harbour Cafe"));
    await user.click(requestButton("Lantern Diner"));
    answerFirst(waitingJobEligibility);

    expect(await screen.findByText("No van can take this job right now.")).toBeVisible();
    expect(screen.queryByText(/vans can take this job/)).not.toBeInTheDocument();
    expect(within(selectedRequest()).getByRole("heading", { name: "Lantern Diner — Test Street" })).toBeVisible();
  });

  it("offers a retry when eligibility can't be checked", async () => {
    const loadEligibility = vi
      .fn<(jobId: string, signal: AbortSignal) => Promise<VanEligibilityDto[]>>()
      .mockRejectedValueOnce(new ApiRequestError("The server ran into a problem. Try again in a moment.", 500))
      .mockResolvedValueOnce(waitingJobEligibility);
    const { user } = renderBoard(loadsBoard(), loadEligibility);
    await screen.findByText("Harbour Cafe");

    await user.click(requestButton("Harbour Cafe"));
    expect(await screen.findByText("Eligible vans couldn't be checked.")).toBeVisible();

    await user.click(within(selectedRequest()).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(/2 vans can take this job:/)).toBeVisible();
  });

  it("shows an error with a retry when the board can't be loaded", async () => {
    const loadBoard = vi
      .fn<(signal: AbortSignal) => Promise<DispatchBoardDto>>()
      .mockRejectedValueOnce(new ApiRequestError("Couldn't reach the server. Check your connection and try again.", null))
      .mockResolvedValueOnce(testBoard);
    const { user } = renderBoard(loadBoard);

    expect(await screen.findByText("The dispatch board couldn't be loaded.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Harbour Cafe")).toBeVisible();
  });

  it("says plainly when there is nothing to dispatch and no vans", async () => {
    renderBoard(loadsBoard({ date: "2026-10-16", openRequests: [], assignedWork: [], vans: [] }));

    expect(await screen.findByText("Nothing is waiting for a van.")).toBeVisible();
    expect(screen.getByText("No customer work is assigned to a van.")).toBeVisible();
    expect(screen.getByText("There are no vans on the road or in the garage.")).toBeVisible();
  });

  // Arrow-key movement needs real layout (Tabster), so it is checked in the browser, not here.
  it("selects a focused request from the keyboard and moves the selection with it", async () => {
    const { user } = renderBoard();
    await screen.findByText("Harbour Cafe");

    requestButton("Harbour Cafe").focus();
    await user.keyboard("{Enter}");
    expect(requestButton("Harbour Cafe")).toHaveAttribute("aria-pressed", "true");

    requestButton("Lantern Diner").focus();
    await user.keyboard(" ");
    expect(requestButton("Lantern Diner")).toHaveAttribute("aria-pressed", "true");
    expect(requestButton("Harbour Cafe")).toHaveAttribute("aria-pressed", "false");
    expect(within(selectedRequest()).getByRole("heading", { name: "Lantern Diner — Test Street" })).toBeVisible();
    expect(screen.getByText("Selected T-UNDATED, Lantern Diner")).toBeInTheDocument();
  });
});
