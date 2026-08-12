import { CalendarRange, Check, History } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useSeason } from "@/hooks/useSeason";
import { cn } from "@/lib/utils";

/**
 * The global year selector.
 *
 * Everything the site shows is scoped to one placement season, so this sits in
 * the header rather than on any one page - changing it on the analytics page
 * and finding the company list still on last year would be the obvious way to
 * get this wrong.
 */
export function SeasonSelect({ className }: { className?: string }) {
  const { season, setSeason, seasons, current, isArchive, loading } = useSeason();

  if (loading || seasons.length === 0) {
    return <div className={cn("h-8 w-24 animate-pulse rounded-sm bg-muted", className)} />;
  }

  // An empty season that is not current is noise in a public selector - it is
  // usually just next year, created automatically the moment the calendar
  // rolled over.
  const visible = seasons.filter(
    (entry) => entry.company_count > 0 || entry.is_current || entry.slug === season,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5 font-mono text-xs tabular",
            // An archive year is visually distinct, because every number on
            // screen means something different when you are looking at 2023.
            isArchive && "border-warning/40 bg-warning/10 text-warning hover:text-warning",
            className,
          )}
          aria-label={`Placement season: ${season}. Change year.`}
        >
          {isArchive ? <History className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />}
          {season}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
          Placement season
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {visible.map((entry) => (
          <DropdownMenuItem
            key={entry.slug}
            onClick={() => setSeason(entry.slug)}
            className="justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <Check
                className={cn("h-3.5 w-3.5", entry.slug === season ? "opacity-100" : "opacity-0")}
              />
              <span className="font-mono tabular">{entry.label}</span>
              {entry.is_current && (
                <span className="rounded-xs bg-primary/12 px-1 text-2xs text-primary">now</span>
              )}
            </span>
            <span className="font-mono text-2xs tabular text-muted-foreground">
              {entry.company_count}
            </span>
          </DropdownMenuItem>
        ))}

        {isArchive && current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setSeason(current.slug)}>
              <History className="mr-2 h-3.5 w-3.5" />
              Back to {current.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A standing reminder that the numbers on screen are historical.
 *
 * Without it, someone who changed the year three pages ago reads an old
 * deadline as a live one - which is the single most damaging thing this
 * feature could cause.
 */
export function ArchiveBanner() {
  const { season, isArchive, current, setSeason } = useSeason();
  if (!isArchive || !current) return null;

  return (
    <div className="border-b border-warning/25 bg-warning/10">
      <div className="container flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm text-warning">
        <History className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          You are viewing the <strong className="font-mono tabular">{season}</strong> archive.
          Deadlines and schedules here have already passed.
        </span>
        <button
          type="button"
          onClick={() => setSeason(current.slug)}
          className="font-medium underline underline-offset-4"
        >
          Back to {current.label}
        </button>
      </div>
    </div>
  );
}
