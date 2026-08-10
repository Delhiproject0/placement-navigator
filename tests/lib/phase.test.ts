import { describe, expect, it } from "vitest";
import { PHASES, isPhase, phaseMeta, phaseRank, resolvePhase, type PhaseInput } from "@/lib/phase";

const NOW = new Date("2026-03-15T12:00:00Z").getTime();
const PAST = "2026-03-01T10:00:00Z";
const FUTURE = "2026-04-01T10:00:00Z";

/**
 * The shared fixture table. `public.company_phase()` is checked against these
 * same cases, so any divergence between the TypeScript and SQL implementations
 * shows up as a failure here rather than as a filter that quietly disagrees
 * with the badge next to it.
 */
export const PHASE_FIXTURES: Array<{ name: string; input: PhaseInput; expected: string }> = [
  {
    name: "cancelled beats every date",
    input: { status: "cancelled", interview_datetime: PAST, registration_deadline: FUTURE },
    expected: "cancelled",
  },
  {
    name: "explicit completed beats the derived stage",
    input: { status: "completed", ppt_datetime: PAST },
    expected: "completed",
  },
  {
    name: "all events past reports the furthest stage",
    input: { status: "upcoming", ppt_datetime: PAST, oa_datetime: PAST, interview_datetime: PAST },
    expected: "interviews_done",
  },
  {
    name: "interview still ahead reports oa_done",
    input: { status: "upcoming", ppt_datetime: PAST, oa_datetime: PAST, interview_datetime: FUTURE },
    expected: "oa_done",
  },
  {
    name: "only the ppt has passed",
    input: { status: "upcoming", ppt_datetime: PAST, oa_datetime: FUTURE },
    expected: "ppt_done",
  },
  {
    name: "deadline ahead, nothing has happened",
    input: { status: "upcoming", registration_deadline: FUTURE },
    expected: "registration_open",
  },
  {
    name: "deadline passed, nothing has happened yet",
    input: { status: "upcoming", registration_deadline: PAST, oa_datetime: FUTURE },
    expected: "registration_closed",
  },
  {
    // 22 of the 59 live companies are in exactly this state.
    name: "no dates at all is announced, not open",
    input: { status: "upcoming" },
    expected: "announced",
  },
  {
    name: "a future event but no registration deadline",
    input: { status: "upcoming", interview_datetime: FUTURE },
    expected: "registration_closed",
  },
  {
    name: "a passed event outranks an open registration window",
    input: { status: "upcoming", registration_deadline: FUTURE, oa_datetime: PAST },
    expected: "oa_done",
  },
];

describe("resolvePhase", () => {
  for (const { name, input, expected } of PHASE_FIXTURES) {
    it(name, () => {
      expect(resolvePhase(input, NOW)).toBe(expected);
    });
  }

  it("treats the deadline instant itself as still open", () => {
    const deadline = "2026-03-15T12:00:00Z";
    expect(resolvePhase({ registration_deadline: deadline }, NOW)).toBe("registration_open");
    expect(resolvePhase({ registration_deadline: deadline }, NOW + 1)).toBe("registration_closed");
  });

  it("ignores unparseable dates instead of treating them as the epoch", () => {
    // new Date("not a date").getTime() is NaN; every comparison against it is
    // false, so an unguarded implementation silently reports the wrong phase.
    expect(resolvePhase({ status: "upcoming", oa_datetime: "not a date" }, NOW)).toBe("announced");
  });

  it("always returns a member of PHASES", () => {
    for (const { input } of PHASE_FIXTURES) {
      expect(PHASES).toContain(resolvePhase(input, NOW));
    }
  });
});

describe("phaseMeta", () => {
  it("gives every phase a distinct label and token", () => {
    const labels = PHASES.map((p) => phaseMeta(p).label);
    const tokens = PHASES.map((p) => phaseMeta(p).token);
    // The old StatusBadge rendered both interviews_done and completed as
    // "Completed", collapsing two phases into one on screen.
    expect(new Set(labels).size).toBe(PHASES.length);
    expect(new Set(tokens).size).toBe(PHASES.length);
  });

  it("degrades to a neutral chip instead of throwing on an unknown value", () => {
    expect(() => phaseMeta("something_new")).not.toThrow();
    expect(phaseMeta("something_new").label).toBe("Unknown");
    expect(phaseMeta(null).label).toBe("Unknown");
    expect(phaseMeta(undefined).label).toBe("Unknown");
  });
});

describe("phaseRank / isPhase", () => {
  it("ranks phases in progression order", () => {
    expect(phaseRank("registration_open")).toBeLessThan(phaseRank("oa_done"));
    expect(phaseRank("oa_done")).toBeLessThan(phaseRank("interviews_done"));
  });

  it("narrows unknown strings", () => {
    expect(isPhase("oa_done")).toBe(true);
    expect(isPhase("upcoming")).toBe(false);
    expect(isPhase(42)).toBe(false);
  });
});
