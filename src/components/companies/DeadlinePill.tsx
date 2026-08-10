import { AlarmClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInISTHuman } from "@/lib/utils";
import { formatCountdown, useCountdown } from "@/hooks/useCountdown";

interface DeadlinePillProps {
  deadline: string | null | undefined;
  className?: string;
  /** Show the absolute date next to the countdown. */
  withDate?: boolean;
}

/**
 * A live countdown to a registration deadline, escalating in colour as it
 * approaches.
 *
 * Replaces a hardcoded `text-red-600` applied inside a 12-hour window, which
 * had two problems: the raw palette colour is nearly invisible on the dark
 * background, and a single binary threshold gave no sense of whether a
 * deadline was in two days or two weeks.
 */
export function DeadlinePill({ deadline, className, withDate = false }: DeadlinePillProps) {
  const countdown = useCountdown(deadline);

  if (!deadline || !countdown) {
    return <span className={cn("text-sm text-muted-foreground", className)}>Not scheduled</span>;
  }

  const hoursLeft = countdown.remainingMs / 3_600_000;

  const tone = countdown.past
    ? "closed"
    : hoursLeft <= 6
      ? "critical"
      : hoursLeft <= 24
        ? "urgent"
        : hoursLeft <= 72
          ? "soon"
          : "calm";

  const toneClass = {
    closed: "border-border bg-muted/60 text-muted-foreground",
    critical: "border-destructive/30 bg-destructive/10 text-destructive animate-pulse-soft",
    urgent: "border-warning/35 bg-warning/12 text-warning",
    soon: "border-info/30 bg-info/10 text-info",
    calm: "border-border bg-muted/40 text-muted-foreground",
  }[tone];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-2xs tabular",
          toneClass,
        )}
        title={formatInISTHuman(deadline)}
      >
        {!countdown.past && hoursLeft <= 24 && <AlarmClock className="h-3 w-3" aria-hidden />}
        {countdown.past ? "closed" : formatCountdown(countdown)}
      </span>
      {withDate && (
        <span className="text-sm text-muted-foreground">{formatInISTHuman(deadline)}</span>
      )}
    </span>
  );
}
