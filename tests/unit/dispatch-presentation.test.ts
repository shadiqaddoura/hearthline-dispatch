import { describe, expect, it } from "vitest";
import {
  describeWaitingTime,
  formatDay,
  isIsoDay,
  requestedOnLabel,
  scheduleLabel,
  waitingLabel,
} from "@/lib/dispatch/presentation";

describe("describeWaitingTime", () => {
  it("uses the API's day count from the request date", () => {
    const waiting = describeWaitingTime({ requestedOn: "2026-10-02", waitingDays: 14 });
    expect(waiting).toEqual({ kind: "waiting", requestedOn: "2026-10-02", days: 14 });
    expect(waitingLabel(waiting)).toBe("Waiting 14 days");
    expect(requestedOnLabel(waiting)).toBe("Fri 2 Oct 2026");
  });

  it("words one day and same-day requests naturally", () => {
    expect(waitingLabel(describeWaitingTime({ requestedOn: "2026-10-15", waitingDays: 1 }))).toBe("Waiting 1 day");
    expect(waitingLabel(describeWaitingTime({ requestedOn: "2026-10-16", waitingDays: 0 }))).toBe("Requested today");
  });

  it("says when the request date is missing instead of inventing one", () => {
    for (const requestedOn of [null, "", "  "]) {
      const waiting = describeWaitingTime({ requestedOn, waitingDays: null });
      expect(waiting).toEqual({ kind: "missing-date" });
      expect(waitingLabel(waiting)).toBe("Request date not recorded");
      expect(requestedOnLabel(waiting)).toBe("Not recorded");
    }
  });

  it("rejects dates that are not real calendar days, even with a day count", () => {
    for (const recorded of ["2026-02-30", "18/10/2026", "soon"]) {
      const waiting = describeWaitingTime({ requestedOn: recorded, waitingDays: 3 });
      expect(waiting).toEqual({ kind: "invalid-date", recorded });
      expect(waitingLabel(waiting)).toBe("Request date unreadable");
      expect(requestedOnLabel(waiting)).toContain(recorded);
    }
  });

  it("does not show a negative wait for a request dated after the board day", () => {
    const waiting = describeWaitingTime({ requestedOn: "2026-10-18", waitingDays: -2 });
    expect(waiting).toEqual({ kind: "future-date", requestedOn: "2026-10-18" });
    expect(waitingLabel(waiting)).toBe("Request date is after today");
  });

  it("reports an uncounted wait rather than guessing one", () => {
    expect(describeWaitingTime({ requestedOn: "2026-10-02", waitingDays: null })).toEqual({
      kind: "not-counted",
      requestedOn: "2026-10-02",
    });
  });
});

describe("dates and schedules", () => {
  it("recognises only real YYYY-MM-DD days", () => {
    expect(isIsoDay("2026-10-16")).toBe(true);
    expect(isIsoDay("2024-02-29")).toBe(true);
    expect(isIsoDay("2026-02-29")).toBe(false);
    expect(isIsoDay("2026-10-16T00:00:00Z")).toBe(false);
  });

  it("formats a calendar day without shifting it across time zones", () => {
    expect(formatDay("2026-10-18")).toBe("Sun 18 Oct 2026");
  });

  it("describes the scheduled day and the van's order separately from the request date", () => {
    expect(scheduleLabel({ scheduledFor: "2026-10-18", sequence: 2 })).toBe("Sun 18 Oct 2026 · #2 in the van's day");
    expect(scheduleLabel({ scheduledFor: null, sequence: null })).toBe("Not scheduled");
  });
});
