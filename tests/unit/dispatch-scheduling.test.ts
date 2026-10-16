import { describe, expect, it } from "vitest";
import { ApiRequestError } from "@/lib/api/client";
import { explainFailure, parseScheduleInput } from "@/lib/dispatch/scheduling";

describe("parseScheduleInput", () => {
  it("treats both fields as optional and keeps the calendar day exactly as typed", () => {
    expect(parseScheduleInput({ date: "", position: "" })).toEqual({ ok: true, scheduledFor: null, sequence: null });
    expect(parseScheduleInput({ date: "2099-10-18", position: "" })).toEqual({ ok: true, scheduledFor: "2099-10-18", sequence: null });
    expect(parseScheduleInput({ date: " 2099-10-18 ", position: " 2 " })).toEqual({ ok: true, scheduledFor: "2099-10-18", sequence: 2 });
  });

  it("needs a day before a position, and a whole number from 1", () => {
    expect(parseScheduleInput({ date: "", position: "1" })).toEqual({ ok: false, errors: { sequence: "Choose a day first" } });
    for (const position of ["0", "-1", "1.5", "two"]) {
      expect(parseScheduleInput({ date: "2099-10-18", position })).toEqual({
        ok: false,
        errors: { sequence: "Enter a whole number from 1" },
      });
    }
  });

  it("rejects dates that aren't real calendar days", () => {
    expect(parseScheduleInput({ date: "2099-02-30", position: "" })).toEqual({ ok: false, errors: { scheduledFor: "Enter a real date" } });
  });
});

describe("explainFailure", () => {
  it("treats stock, driver and vehicle changes as a changed van", () => {
    for (const code of ["INSUFFICIENT_STOCK", "VAN_UNAVAILABLE", "NO_TECHNICIAN"]) {
      expect(explainFailure(new ApiRequestError("V02 is short", 409, code)).kind).toBe("van-changed");
    }
  });

  it("treats a job that changed state as a changed job", () => {
    expect(explainFailure(new ApiRequestError("Already assigned", 409, "INVALID_STATE")).kind).toBe("job-changed");
  });

  it("passes the server's field messages through for the form", () => {
    const failure = explainFailure(
      new ApiRequestError("Position taken", 409, "CONFLICT", { fieldErrors: { sequence: ["#1 is taken by J-1"] } }),
    );
    expect(failure).toEqual({ kind: "input", message: "Position taken", fieldErrors: { sequence: "#1 is taken by J-1" } });
  });

  it("never treats an unanswered request as a decision", () => {
    expect(explainFailure(new ApiRequestError("Couldn't reach the server.", null)).kind).toBe("unknown");
    expect(explainFailure(new ApiRequestError("The server ran into a problem.", 500)).kind).toBe("unknown");
    expect(explainFailure(new TypeError("boom")).kind).toBe("unknown");
  });
});
