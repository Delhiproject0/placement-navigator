import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DeadlinePill } from "@/components/companies/DeadlinePill";
import type { Company } from "@/types/database";
import { cn } from "@/lib/utils";

/** Pixels per second. Slow enough to read a company name in passing. */
const SPEED = 45;

/**
 * The strip of open deadlines under the hero.
 *
 * It only scrolls when it has to. The original always scrolled, with the list
 * rendered twice and the track translated by -50%, which assumes one copy is
 * already wider than the screen. With two drives open it was not, so the strip
 * slid away and left most of the row empty before snapping back.
 *
 * Now the content is measured: if it fits, it is simply laid out and left
 * alone; if it overflows, it is duplicated and scrolled at a fixed speed
 * regardless of how many drives are open. Padding a short list out by
 * repeating it would fill the row, but seeing the same company seven times is
 * worse than a row that is honestly half empty.
 */
export function DeadlineTicker({ companies }: { companies: Company[] }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  const [duration, setDuration] = useState(0);

  const measure = useCallback(() => {
    const run = runRef.current;
    // Measured against the *container* width, not the viewport: a strip that
    // stays put is aligned with the rest of the page, so that is the space it
    // actually has. The probe carries the same `container` class rather than
    // repeating its max-width and padding here, where the two would drift.
    const probe = probeRef.current;
    if (!run || !probe) return;

    const runWidth = run.scrollWidth;
    const available = probe.clientWidth;
    if (runWidth <= 0 || available <= 0) return;

    setScrolls(runWidth > available);
    setDuration(runWidth / SPEED);
  }, []);

  // Layout effect, so the first painted frame is already correct rather than
  // visibly reflowing a moment after the page settles.
  useLayoutEffect(measure, [measure, companies]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [measure]);

  if (companies.length === 0) return null;

  const items = (copy: number) =>
    companies.map((company) => (
      <Link
        key={`${copy}-${company.id}`}
        to={`/companies/${company.id}`}
        tabIndex={copy === 1 ? -1 : undefined}
        className="flex shrink-0 items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="h-1 w-1 rounded-[999px] bg-primary/60" aria-hidden />
        <span className="font-medium text-foreground">{company.name}</span>
        <DeadlinePill deadline={company.registration_deadline} />
      </Link>
    ));

  return (
    <div
      ref={viewportRef}
      className={cn(
        "relative overflow-hidden border-t border-border bg-card/50 py-2.5",
        // The edge fade is only meaningful against something moving past it.
        scrolls && "mask-fade-x",
      )}
    >
      <div ref={probeRef} className="container pointer-events-none h-0" aria-hidden />

      <div
        className={cn(
          "flex",
          scrolls ? "w-max animate-marquee hover:[animation-play-state:paused]" : "container",
        )}
        // Duration tracks the content width so the strip always moves at
        // SPEED, whether two drives are open or twenty.
        style={scrolls && duration ? { animationDuration: `${duration}s` } : undefined}
      >
        <div ref={runRef} className="flex shrink-0 gap-8 pr-8">
          {items(0)}
        </div>

        {/* The second run only exists to cover the seam: the animation moves
            the track by exactly one run, so this lands where the first began. */}
        {scrolls && (
          <div className="flex shrink-0 gap-8 pr-8" aria-hidden>
            {items(1)}
          </div>
        )}
      </div>
    </div>
  );
}
