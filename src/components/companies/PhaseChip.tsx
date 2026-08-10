import { cn } from "@/lib/utils";
import { phaseMeta, type Phase } from "@/lib/phase";

interface PhaseChipProps {
  phase: Phase | string | null | undefined;
  className?: string;
  /** Hides the label, leaving only the dot. For dense table cells. */
  compact?: boolean;
}

/**
 * A dot plus a label, tinted from the phase's own token.
 *
 * Deliberately not a shadcn `<Badge variant>`: there are four variants and
 * seven phases, so the previous mapping rendered `interviews_done` and
 * `completed` identically, which is precisely the distinction a student
 * scanning the table cares about.
 */
export function PhaseChip({ phase, className, compact = false }: PhaseChipProps) {
  const { label, description, token } = phaseMeta(phase);

  // Inline custom properties keep this to one element per chip rather than a
  // seven-branch className lookup, and stay theme-aware because the token
  // itself is redefined under .dark.
  const style = {
    "--chip": `var(--phase-${token})`,
  } as React.CSSProperties;

  return (
    <span
      style={style}
      title={description}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[999px] border px-2 py-0.5 text-xs font-medium",
        "border-[hsl(var(--chip)/0.28)] bg-[hsl(var(--chip)/0.12)] text-[hsl(var(--chip))]",
        className,
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-[999px] bg-[hsl(var(--chip))]" />
      {compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
