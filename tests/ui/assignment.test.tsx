import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DispatchBoard } from "@/components/dispatch/dispatch-board";
import { ApiRequestError } from "@/lib/api/client";
import { assignJob, fetchJob, scheduleJob } from "@/lib/api/dispatch";
import type { DispatchBoardDto, VanEligibilityDto } from "@/lib/contracts/dispatch";
import type { JobDto } from "@/lib/contracts/jobs";
import { assignedJob, testBoard, testJob, waitingJob, waitingJobEligibility } from "../support/dispatch-fixtures";
import { renderWithFluent } from "../support/render";

vi.mock("@/lib/api/dispatch", () => ({
  fetchDispatchBoard: vi.fn(),
  fetchEligibleVans: vi.fn(),
  assignJob: vi.fn(),
  scheduleJob: vi.fn(),
  fetchJob: vi.fn(),
}));

const assign = vi.mocked(assignJob);
const schedule = vi.mocked(scheduleJob);
const verify = vi.mocked(fetchJob);

const savedAssignment: JobDto = {
  ...waitingJob,
  status: "ASSIGNED",
  van: { id: "van-north", code: "T-N" },
  technician: { id: "tech-van-north", name: "Driver of T-N" },
  scheduledFor: "2099-10-18",
  sequence: 1,
  activeReservations: [{ id: "res-1", locationId: "loc-van-north", productId: "prd-printer", quantity: 1, status: "ACTIVE" }],
};

let loadBoard: ReturnType<typeof vi.fn<(signal: AbortSignal) => Promise<DispatchBoardDto>>>;
let loadEligibility: ReturnType<typeof vi.fn<(jobId: string, signal: AbortSignal) => Promise<VanEligibilityDto[]>>>;

beforeEach(() => {
  vi.clearAllMocks();
  loadBoard = vi.fn(() => Promise.resolve(testBoard));
  loadEligibility = vi.fn(() => Promise.resolve(waitingJobEligibility));
});

const dialog = () => screen.getByRole("dialog");

/**
 * The open dialog, once Fluent's focus manager treats it as the active modal. Under
 * jsdom on a busy runner, Tabster can miss the dialog's initial focus and keep the
 * dialog aria-hidden; moving focus within it once (as any real interaction does)
 * activates it. Real browsers were checked separately.
 */
async function openedDialog() {
  const surface = await screen.findByRole("dialog", { hidden: true });
  const title = within(surface).getByRole("heading", { level: 2, hidden: true });
  act(() => title.focus());
  return screen.findByRole("dialog");
}

async function openAssignDialog() {
  const view = renderWithFluent(<DispatchBoard loadBoard={loadBoard} loadEligibility={loadEligibility} />);
  await view.user.click(await screen.findByText("Harbour Cafe"));
  await view.user.click(await screen.findByRole("button", { name: "Assign to a van…" }));
  await within(await openedDialog()).findByRole("radio", { name: /T-N/ });
  return view;
}

async function chooseAndReview(user: Awaited<ReturnType<typeof openAssignDialog>>["user"], schedule = { day: "2099-10-18", position: "1" }) {
  const open = await openedDialog();
  await user.click(within(open).getByRole("radio", { name: /T-N/ }));
  fireEvent.change(within(open).getByLabelText("Scheduled day"), { target: { value: schedule.day } });
  fireEvent.change(within(open).getByLabelText("Position in the van's day"), { target: { value: schedule.position } });
  await user.type(within(open).getByRole("textbox", { name: /your name/i }), "Noor");
  await user.click(within(open).getByRole("button", { name: "Review assignment" }));
}

describe("assigning a waiting request", () => {
  it("rechecks eligibility on opening, offers only eligible vans and explains the rest", async () => {
    await openAssignDialog();

    expect(loadEligibility).toHaveBeenCalledTimes(2); // on selection, and again when the dialog opens
    expect(within(dialog()).getAllByRole("radio")).toHaveLength(2);
    expect(within(dialog()).queryByRole("radio", { name: /T-G/ })).not.toBeInTheDocument();
    expect(within(dialog()).getByText("Vans that can't take it (1)")).toBeVisible();
  });

  it("confirms the job, van, technician, schedule and equipment, then saves once and reports what the server saved", async () => {
    const { user } = await openAssignDialog();
    let finish!: (job: JobDto) => void;
    assign.mockImplementation(() => new Promise((resolve) => (finish = resolve)));

    await chooseAndReview(user);
    const summary = dialog();
    expect(within(summary).getByRole("heading", { name: "Confirm assigning T-WAIT" })).toBeVisible();
    for (const text of ["T-N", "Driver of T-N", "Fri 2 Oct 2026 (unchanged)", "Sun 18 Oct 2099", "#1", "Noor"]) {
      expect(within(summary).getByText(text)).toBeVisible();
    }
    expect(within(summary).getByText(/1 × TEST-PRN Test printer \(1 available on T-N now\)/)).toBeVisible();

    const confirm = within(summary).getByRole("button", { name: "Confirm assignment" });
    await user.click(confirm);
    await user.click(within(summary).getByRole("button", { name: /Assigning/ }));
    expect(within(summary).getByRole("button", { name: /Assigning/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/T-WAIT (is|was) assigned\./)).not.toBeInTheDocument(); // nothing claimed before the server answers
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(waitingJob.id, {
      vanId: "van-north",
      assignedBy: "Noor",
      scheduledFor: "2099-10-18",
      sequence: 1,
    });

    finish(savedAssignment);
    const notice = await screen.findByText("T-WAIT is assigned.");
    expect(notice.closest("[tabindex='-1']")).toHaveFocus();
    expect(screen.getByText(/On T-N with Driver of T-N\. Scheduled Sun 18 Oct 2099 · #1 in the van's day\. Reserved: 1 × TEST-PRN\./)).toBeVisible();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(loadBoard).toHaveBeenCalledTimes(2)); // the board reloads with the new reservations
  });

  it("returns to the van list with fresh eligibility when the van can no longer take the job", async () => {
    const { user } = await openAssignDialog();
    assign.mockRejectedValue(new ApiRequestError("T-N is short: TEST-PRN 0/1", 409, "INSUFFICIENT_STOCK"));
    const eligibilityCalls = loadEligibility.mock.calls.length;

    await chooseAndReview(user);
    await user.click(within(dialog()).getByRole("button", { name: "Confirm assignment" }));

    expect(await within(dialog()).findByText("That van can no longer take this job.")).toBeVisible();
    expect(within(dialog()).getByText(/T-N is short: TEST-PRN 0\/1\. The vans have been rechecked: choose again\./)).toBeVisible();
    expect(within(dialog()).getByRole("heading", { name: "Assign T-WAIT" })).toBeVisible();
    expect(within(dialog()).getByRole("radio", { name: /T-N/ })).not.toBeChecked();
    expect(screen.queryByText(/T-WAIT (is|was) assigned\./)).not.toBeInTheDocument();
    await waitFor(() => expect(loadEligibility.mock.calls.length).toBeGreaterThan(eligibilityCalls));
    expect(loadBoard).toHaveBeenCalledTimes(2);
  });

  it("shows the server's reason for a taken position against the field, without assigning", async () => {
    const { user } = await openAssignDialog();
    assign.mockRejectedValue(
      new ApiRequestError("T-N already has T-ASSIGNED at #1 on 2099-10-18; choose another position", 409, "CONFLICT", {
        fieldErrors: { sequence: ["#1 is taken by T-ASSIGNED"] },
      }),
    );

    await chooseAndReview(user);
    await user.click(within(dialog()).getByRole("button", { name: "Confirm assignment" }));

    expect(await within(dialog()).findByText("#1 is taken by T-ASSIGNED")).toBeVisible();
    expect(within(dialog()).getByLabelText("Position in the van's day")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/T-WAIT (is|was) assigned\./)).not.toBeInTheDocument();
  });

  it("checks the job instead of guessing when the server doesn't answer, and reports it saved if it was", async () => {
    const { user } = await openAssignDialog();
    assign.mockRejectedValue(new ApiRequestError("Couldn't reach the server. Check your connection and try again.", null));
    verify.mockResolvedValue(savedAssignment);

    await chooseAndReview(user);
    await user.click(within(dialog()).getByRole("button", { name: "Confirm assignment" }));

    expect(await screen.findByText("T-WAIT was assigned.")).toBeVisible();
    expect(screen.getByText(/The connection dropped, but the server shows it was saved\./)).toBeVisible();
    expect(verify).toHaveBeenCalledWith(waitingJob.id);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("says plainly when an unanswered assignment wasn't saved, and lets the dispatcher try again", async () => {
    const { user } = await openAssignDialog();
    assign
      .mockRejectedValueOnce(new ApiRequestError("Couldn't reach the server. Check your connection and try again.", null))
      .mockResolvedValueOnce(savedAssignment);
    verify.mockResolvedValue(waitingJob);

    await chooseAndReview(user);
    await user.click(within(dialog()).getByRole("button", { name: "Confirm assignment" }));
    expect(await within(dialog()).findByText("The assignment wasn't saved.")).toBeVisible();
    expect(screen.queryByText(/T-WAIT (is|was) assigned\./)).not.toBeInTheDocument();

    // Still on the confirm step: retrying is one click, and the server rejects duplicates anyway.
    await user.click(within(dialog()).getByRole("button", { name: "Confirm assignment" }));
    expect(await screen.findByText("T-WAIT is assigned.")).toBeVisible();
    expect(assign).toHaveBeenCalledTimes(2);
  });

  it("checks the form before reviewing", async () => {
    const { user } = await openAssignDialog();
    fireEvent.change(within(dialog()).getByLabelText("Position in the van's day"), { target: { value: "1" } });

    await user.click(within(dialog()).getByRole("button", { name: "Review assignment" }));

    expect(within(dialog()).getByText("Choose a van that can take this job")).toBeVisible();
    expect(within(dialog()).getByText("Enter your name")).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("changing an assigned job's schedule", () => {
  async function openScheduleDialog() {
    const view = renderWithFluent(<DispatchBoard loadBoard={loadBoard} loadEligibility={loadEligibility} />);
    await view.user.click(await screen.findByText("Olive Room"));
    await view.user.click(screen.getByRole("button", { name: "Change schedule…" }));
    await openedDialog();
    return view;
  }

  it("saves only the day and position and says stock is untouched", async () => {
    const { user } = await openScheduleDialog();
    expect(within(dialog()).getByLabelText("Scheduled day")).toHaveValue("2026-10-18");
    expect(within(dialog()).getByLabelText("Position in the van's day")).toHaveValue(1);
    expect(within(dialog()).getByText(/Requested on Sat 10 Oct 2026\. That date stays as recorded/)).toBeVisible();
    schedule.mockResolvedValue({ ...assignedJob, scheduledFor: "2099-10-20", sequence: 2 });

    fireEvent.change(within(dialog()).getByLabelText("Scheduled day"), { target: { value: "2099-10-20" } });
    fireEvent.change(within(dialog()).getByLabelText("Position in the van's day"), { target: { value: "2" } });
    await user.click(within(dialog()).getByRole("button", { name: "Save schedule" }));

    expect(schedule).toHaveBeenCalledWith(assignedJob.id, { scheduledFor: "2099-10-20", sequence: 2 });
    expect(await screen.findByText("T-ASSIGNED's schedule is saved.")).toBeVisible();
    expect(screen.getByText(/Scheduled Tue 20 Oct 2099 · #2 in the van's day\. Stock and reservations are unchanged\./)).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });

  it("clears the schedule when the day is emptied", async () => {
    const { user } = await openScheduleDialog();
    schedule.mockResolvedValue({ ...assignedJob, scheduledFor: null, sequence: null });

    fireEvent.change(within(dialog()).getByLabelText("Scheduled day"), { target: { value: "" } });
    fireEvent.change(within(dialog()).getByLabelText("Position in the van's day"), { target: { value: "" } });
    await user.click(within(dialog()).getByRole("button", { name: "Save schedule" }));

    expect(schedule).toHaveBeenCalledWith(assignedJob.id, { scheduledFor: null, sequence: null });
    expect(await screen.findByText(/No scheduled day\./)).toBeVisible();
  });

  it("keeps the dialog open with the server's reason when it refuses", async () => {
    const { user } = await openScheduleDialog();
    schedule.mockRejectedValue(
      new ApiRequestError("A visit can't be scheduled in the past (today is 2026-10-16)", 400, "VALIDATION_FAILED", {
        fieldErrors: { scheduledFor: ["Choose today or a later day"] },
      }),
    );

    fireEvent.change(within(dialog()).getByLabelText("Scheduled day"), { target: { value: "2026-10-01" } });
    await user.click(within(dialog()).getByRole("button", { name: "Save schedule" }));

    expect(await within(dialog()).findByText("Choose today or a later day")).toBeVisible();
    expect(within(dialog()).getByText(/can't be scheduled in the past/)).toBeVisible();
    expect(screen.queryByText(/schedule is saved/)).not.toBeInTheDocument();
  });

  it("offers no schedule change for work that has started", async () => {
    loadBoard = vi.fn(() =>
      Promise.resolve({
        ...testBoard,
        assignedWork: [testJob({ ...assignedJob, id: "job-started", reference: "T-STARTED", status: "IN_PROGRESS" })],
      }),
    );
    renderWithFluent(<DispatchBoard loadBoard={loadBoard} loadEligibility={loadEligibility} />);
    const started = await screen.findByText("T-STARTED", { exact: false });
    fireEvent.click(started.closest("button")!);

    expect(await screen.findByText(/It has started, so its schedule can't change\./)).toBeVisible();
    expect(screen.queryByRole("button", { name: /Change schedule|Assign to a van/ })).not.toBeInTheDocument();
  });
});
