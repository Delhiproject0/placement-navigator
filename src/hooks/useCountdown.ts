import { useEffect, useState } from "react";

export interface Countdown {
  /** Milliseconds remaining; negative once the target has passed. */
  remainingMs: number;
  past: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function breakdown(remainingMs: number): Countdown {
  const abs = Math.abs(remainingMs);
  return {
    remainingMs,
    past: remainingMs < 0,
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1000),
  };
}

/**
 * Live countdown to an ISO timestamp.
 *
 * The tick interval scales with the distance: a deadline three weeks out does
 * not need a per-second re-render, and a page listing sixty companies would
 * otherwise re-render sixty times a second for no visible change.
 */
export function useCountdown(target: string | null | undefined): Countdown | null {
  const targetMs = target ? new Date(target).getTime() : Number.NaN;
  const valid = !Number.isNaN(targetMs);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!valid) return;
    const remaining = targetMs - Date.now();
    // Under an hour: tick every second. Under a day: every minute. Otherwise
    // hourly - enough to cross a threshold promptly without busy-rendering.
    const interval = Math.abs(remaining) < 3_600_000 ? 1000 : Math.abs(remaining) < 86_400_000 ? 60_000 : 3_600_000;
    const id = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(id);
  }, [targetMs, valid]);

  if (!valid) return null;
  return breakdown(targetMs - now);
}

/** "3d 4h", "12m", "2h 5m" - the shortest form that stays unambiguous. */
export function formatCountdown(c: Countdown): string {
  if (c.days > 0) return c.hours > 0 ? `${c.days}d ${c.hours}h` : `${c.days}d`;
  if (c.hours > 0) return c.minutes > 0 ? `${c.hours}h ${c.minutes}m` : `${c.hours}h`;
  if (c.minutes > 0) return `${c.minutes}m`;
  return `${c.seconds}s`;
}
