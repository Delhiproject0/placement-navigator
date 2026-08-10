import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computePlacementStatus,
  formatForInputInIST,
  formatInISTHuman,
  inputISTToOffsetISOString,
  type PlacementTimings,
} from "@/lib/utils";

/** Every field absent unless a test sets it. */
function timings(overrides: Partial<PlacementTimings> = {}): PlacementTimings {
  return {
    status: "upcoming",
    registration_deadline: null,
    ppt_datetime: null,
    oa_datetime: null,
    interview_datetime: null,
    ...overrides,
  };
}

// A fixed "now" so the date-relative branches are deterministic.
const NOW = new Date("2026-03-15T12:00:00+05:30");
const PAST = "2026-03-01T10:00:00+05:30";
const FUTURE = "2026-04-01T10:00:00+05:30";

describe("computePlacementStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("honours an explicit cancelled status over any dates", () => {
    expect(
      computePlacementStatus(timings({ status: "cancelled", interview_datetime: PAST })),
    ).toBe("cancelled");
  });

  it("is upcoming while the registration deadline is still in the future", () => {
    expect(computePlacementStatus(timings({ registration_deadline: FUTURE }))).toBe("upcoming");
  });

  it("prefers the registration deadline over later events that have passed", () => {
    // Registration still open but an OA date sits in the past: the deadline wins.
    expect(
      computePlacementStatus(timings({ registration_deadline: FUTURE, oa_datetime: PAST })),
    ).toBe("upcoming");
  });

  it("reports the latest completed stage, not the earliest", () => {
    expect(
      computePlacementStatus(
        timings({ ppt_datetime: PAST, oa_datetime: PAST, interview_datetime: PAST }),
      ),
    ).toBe("interviews_done");
  });

  it("reports oa_done when the interview has not happened yet", () => {
    expect(
      computePlacementStatus(
        timings({ ppt_datetime: PAST, oa_datetime: PAST, interview_datetime: FUTURE }),
      ),
    ).toBe("oa_done");
  });

  it("reports ppt_done when only the PPT has passed", () => {
    expect(
      computePlacementStatus(timings({ ppt_datetime: PAST, oa_datetime: FUTURE })),
    ).toBe("ppt_done");
  });

  it("is ongoing when every scheduled event is still ahead and registration has closed", () => {
    expect(
      computePlacementStatus(timings({ registration_deadline: PAST, oa_datetime: FUTURE })),
    ).toBe("ongoing");
  });

  it("falls back to upcoming when nothing is scheduled at all", () => {
    expect(computePlacementStatus(timings())).toBe("upcoming");
  });

  it("accepts the four-value stored enum without complaint", () => {
    // The stored column and the returned type are different vocabularies; the
    // function must take the stored one as input.
    for (const stored of ["upcoming", "ongoing", "completed", "cancelled"] as const) {
      expect(() => computePlacementStatus(timings({ status: stored }))).not.toThrow();
    }
  });
});

describe("IST helpers", () => {
  it("round-trips a datetime-local value through the offset form", () => {
    const input = "2026-03-15T14:30";
    const iso = inputISTToOffsetISOString(input);
    expect(iso).toBe("2026-03-15T14:30:00+05:30");
    expect(formatForInputInIST(iso)).toBe(input);
  });

  it("renders a UTC instant in IST, not in the runner's local zone", () => {
    // 09:00 UTC is 14:30 IST.
    expect(formatInISTHuman("2026-03-15T09:00:00Z")).toContain("2:30 PM");
  });

  it("shifts the date when the UTC instant is late enough to cross midnight IST", () => {
    // 20:00 UTC on the 15th is 01:30 IST on the 16th.
    expect(formatForInputInIST("2026-03-15T20:00:00Z")).toBe("2026-03-16T01:30");
  });

  it("treats null and empty input as absent rather than epoch", () => {
    expect(formatForInputInIST(null)).toBe("");
    expect(formatForInputInIST(undefined)).toBe("");
    expect(inputISTToOffsetISOString("")).toBeNull();
    expect(formatInISTHuman(null)).toBe("Not scheduled");
  });
});
