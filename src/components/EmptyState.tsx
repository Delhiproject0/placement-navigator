import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "search" | "companies" | "experiences" | "questions" | "documents" | "bookmarks" | "error";

/**
 * Hand-drawn-feel line art, inline so there is no extra request and both
 * strokes inherit the current text colour (which keeps them theme-correct).
 * Each variant says something about the specific absence rather than reusing
 * one generic "no data" glyph.
 */
function Art({ variant }: { variant: Variant }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg viewBox="0 0 96 72" className="h-20 w-24 text-muted-foreground/45" aria-hidden>
      {variant === "search" && (
        <>
          <circle cx="42" cy="32" r="17" {...common} />
          <path d="M54 44 L67 57" {...common} />
          <path d="M34 32h16M38 26h8" {...common} opacity={0.55} />
        </>
      )}
      {variant === "companies" && (
        <>
          <path d="M20 58V26l16-9 16 9v32" {...common} />
          <path d="M52 58V36l18 6v16" {...common} />
          <path d="M30 40h12M30 48h12M60 46h4" {...common} opacity={0.55} />
          <path d="M14 58h68" {...common} />
        </>
      )}
      {(variant === "experiences" || variant === "questions") && (
        <>
          <path d="M24 16h34l14 13v27a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4Z" {...common} />
          <path d="M58 16v13h14" {...common} />
          <path d="M30 38h26M30 46h18" {...common} opacity={0.55} />
        </>
      )}
      {variant === "documents" && (
        <>
          <path d="M18 24a4 4 0 0 1 4-4h14l6 7h32a4 4 0 0 1 4 4v25a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4Z" {...common} />
          <path d="M40 42h20M48 34v16" {...common} opacity={0.6} />
        </>
      )}
      {variant === "bookmarks" && (
        <>
          <path d="M34 14h28a3 3 0 0 1 3 3v43L48 49 31 60V17a3 3 0 0 1 3-3Z" {...common} />
        </>
      )}
      {variant === "error" && (
        <>
          <path d="M48 16 78 60H18Z" {...common} />
          <path d="M48 33v13M48 52v.5" {...common} />
        </>
      )}
    </svg>
  );
}

interface EmptyStateProps {
  variant?: Variant;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  variant = "companies",
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/40 px-6 py-14 text-center",
        className,
      )}
    >
      <Art variant={variant} />
      <p className="mt-4 font-display text-lg font-semibold">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
