import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import type { PlacementStatus } from "@/types/database";

/**
 * The stored `status` column and the displayed status are different
 * vocabularies: the database enum has four values, this returns seven. So the
 * input is typed structurally on the stored shape (which only ever carries the
 * four) rather than on `Company`, whose `status` is the seven-value display
 * type. That mismatch is what the `as any` at every call site was hiding.
 */
export interface PlacementTimings {
  status: string | null;
  registration_deadline?: string | null;
  ppt_datetime?: string | null;
  oa_datetime?: string | null;
  interview_datetime?: string | null;
}

// Compute a placement status from timing fields when status is not explicitly set
export function computePlacementStatus(company: PlacementTimings): PlacementStatus {
  // honor explicit cancelled status
  if (company.status === 'cancelled') return 'cancelled';

  const now = new Date();
  const parse = (v?: string | null) => (v ? new Date(v) : null);
  const reg = parse(company.registration_deadline);
  const ppt = parse(company.ppt_datetime);
  const oa = parse(company.oa_datetime);
  const iv = parse(company.interview_datetime);

  // If registration deadline exists and is in future -> upcoming
  if (reg && now < reg) return 'upcoming';

  // If interview time exists and is already passed -> interviews done
  if (iv && now > iv) return 'interviews_done';

  // If OA time exists and is already passed -> OA done
  if (oa && now > oa) return 'oa_done';

  // If PPT time exists and is already passed -> PPT done
  if (ppt && now > ppt) return 'ppt_done';

  // If any event (PPT/OA/Interview) is in the future -> ongoing
  if ((oa && now < oa) || (ppt && now < ppt) || (iv && now < iv)) return 'ongoing';

  // Fallback: if none of the above, treat as upcoming
  return 'upcoming';
}

// Date/time helpers for IST (Asia/Kolkata)
export function formatForInputInIST(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  // use Intl to get parts in Asia/Kolkata timezone
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d);

  const map: Record<string, string> = {};
  parts.forEach(p => { if (p.type !== 'literal') map[p.type] = p.value; });
  // format YYYY-MM-DDTHH:mm
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

// Convert a datetime-local input value (treated as IST) to an ISO string with +05:30 offset
export function inputISTToOffsetISOString(value: string) {
  if (!value) return null;
  // value expected as 'YYYY-MM-DDTHH:mm'
  // Append seconds and +05:30 offset
  const withOffset = `${value}:00+05:30`;
  return withOffset;
}

// Format an ISO datetime into a human-readable IST string
export function formatInISTHuman(iso?: string | null) {
  if (!iso) return 'Not scheduled';
  const d = new Date(iso);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: true
  });
  return formatter.format(d);
}
