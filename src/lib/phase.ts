/**
 * Where a company sits in its drive.
 *
 * This replaces the old `computePlacementStatus` / `PlacementStatus` pair, and
 * fixes the bug it caused: the stored `status` column has four values, the
 * displayed status had seven, and the companies list filtered on the stored one
 * while the table rendered the computed one. A row could therefore show
 * "OA done" and match only the "Upcoming" filter.
 *
 * The fix is to have exactly one definition of the displayed value. This module
 * is that definition on the client; `public.company_phase()` mirrors it in SQL
 * so the server can filter, sort and paginate on the same value. The two are
 * held together by a parity test over a shared fixture table.
 *
 * The stored `status` column keeps a narrower job: an explicit override for the
 * two states that dates cannot express (`cancelled`, `completed`).
 */

export const PHASES = [
  "announced",
  "registration_open",
  "registration_closed",
  "ppt_done",
  "oa_done",
  "interviews_done",
  "completed",
  "cancelled",
] as const;

export type Phase = (typeof PHASES)[number];

/** Inputs the phase is derived from. Deliberately structural. */
export interface PhaseInput {
  status?: string | null;
  registration_deadline?: string | null;
  ppt_datetime?: string | null;
  oa_datetime?: string | null;
  interview_datetime?: string | null;
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Resolve the phase.
 *
 * Order matters: explicit overrides win, then the furthest-progressed event
 * that has already happened, then the registration window. Reading the events
 * latest-first is what makes a company with all three dates in the past report
 * `interviews_done` rather than `ppt_done`.
 */
export function resolvePhase(company: PhaseInput, now: number = Date.now()): Phase {
  if (company.status === "cancelled") return "cancelled";
  if (company.status === "completed") return "completed";

  const interview = toTime(company.interview_datetime);
  if (interview !== null && now > interview) return "interviews_done";

  const oa = toTime(company.oa_datetime);
  if (oa !== null && now > oa) return "oa_done";

  const ppt = toTime(company.ppt_datetime);
  if (ppt !== null && now > ppt) return "ppt_done";

  const registration = toTime(company.registration_deadline);
  if (registration !== null) {
    return now <= registration ? "registration_open" : "registration_closed";
  }

  // A future event with no registration deadline: the drive is scheduled, but
  // there is no window to miss.
  if (ppt !== null || oa !== null || interview !== null) return "registration_closed";

  // Nothing recorded at all. This is a real and common state - 22 of the 59
  // live companies have no dates yet - and it must not be reported as
  // "registration open", which would put companies you cannot act on at the
  // top of every deadline-sorted list.
  return "announced";
}

interface PhaseMeta {
  label: string;
  /** Longer form, for tooltips and screen readers. */
  description: string;
  /** Tailwind colour key -> `--phase-*` token. */
  token: string;
}

const PHASE_META: Record<Phase, PhaseMeta> = {
  announced: {
    label: "Announced",
    description: "The company is expected, but no dates have been published yet",
    token: "announced",
  },
  registration_open: {
    label: "Registration open",
    description: "Applications are still being accepted",
    token: "registration-open",
  },
  registration_closed: {
    label: "Registration closed",
    description: "The deadline has passed; the drive has not started",
    token: "registration-closed",
  },
  ppt_done: {
    label: "PPT done",
    description: "The pre-placement talk has taken place",
    token: "ppt",
  },
  oa_done: {
    label: "OA done",
    description: "The online assessment has taken place",
    token: "oa",
  },
  interviews_done: {
    label: "Interviews done",
    description: "Interviews are over; results may still be pending",
    token: "interviews-done",
  },
  completed: {
    label: "Completed",
    description: "The drive is finished and results are out",
    token: "completed",
  },
  cancelled: {
    label: "Cancelled",
    description: "The company withdrew from this cycle",
    token: "cancelled",
  },
};

/**
 * Metadata for a phase. Falls back to a neutral chip for an unrecognised value
 * rather than throwing - the previous `variants[status]` lookup crashed the
 * whole table if the database ever returned something unmapped.
 */
export function phaseMeta(phase: string | null | undefined): PhaseMeta {
  if (phase && phase in PHASE_META) return PHASE_META[phase as Phase];
  return {
    label: "Unknown",
    description: "No phase could be determined",
    token: "registration-closed",
  };
}

/** Display order, used for sorting a column by phase. */
export function phaseRank(phase: Phase): number {
  return PHASES.indexOf(phase);
}

export function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && (PHASES as readonly string[]).includes(value);
}
