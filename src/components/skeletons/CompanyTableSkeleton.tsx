import { cn } from "@/lib/utils";

/** A shimmering block. Matches the shape of what is loading, not a spinner. */
export function Shimmer({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-xs bg-[linear-gradient(90deg,hsl(var(--muted)),hsl(var(--muted-foreground)/0.12),hsl(var(--muted)))] bg-[length:200%_100%] animate-shimmer",
        className,
      )}
    />
  );
}

export function CompanyTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading companies"
      className="overflow-hidden rounded-lg border border-border bg-card shadow-xs"
    >
      <div className="hidden h-10 items-center gap-4 border-b border-border bg-muted/40 px-4 md:flex">
        {["w-24", "w-16", "w-20", "w-12", "w-16", "w-20"].map((width) => (
          <Shimmer key={width} className={cn("h-2.5", width)} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0"
          // Staggering the rows reads as progressive loading rather than one
          // synchronised flash.
          style={{ animationDelay: `${index * 60}ms` }}
        >
          <Shimmer className="h-8 w-8 shrink-0 rounded-sm" />
          <Shimmer className="h-3 w-40 max-w-[35%]" />
          <Shimmer className="hidden h-5 w-28 rounded-[999px] md:block" />
          <Shimmer className="hidden h-3 w-20 md:block" />
          <Shimmer className="ml-auto hidden h-3 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}
