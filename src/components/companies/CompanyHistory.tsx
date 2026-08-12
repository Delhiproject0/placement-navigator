import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, History, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { useCompanyHistory } from "@/hooks/queries";
import { useSeason } from "@/hooks/useSeason";
import { formatCtc, parseCtcToNumber } from "@/lib/ctc";
import { cn } from "@/lib/utils";

/**
 * How this organisation has hired here in previous years.
 *
 * The point of an archive is comparison, so the package is shown against the
 * previous season rather than as a bare number - "46L" means much less than
 * "46L, up from 39L".
 */
export function CompanyHistory({ companyId }: { companyId: string }) {
  const { data, isPending } = useCompanyHistory(companyId);
  const { season, setSeason } = useSeason();

  if (isPending) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Previous seasons</CardTitle>
        </CardHeader>
        <CardContent>
          <Shimmer className="h-20 w-full rounded-sm" />
        </CardContent>
      </Card>
    );
  }

  const history = data?.history ?? [];
  // One entry is just the row being looked at - there is no history to show.
  if (history.length <= 1) return null;

  // Viewed from an archived year, some of the list is in that year's future,
  // so "previous seasons" would be a plain lie about half the rows.
  const viewedIndex = history.findIndex((entry) => entry.id === companyId);
  const title = viewedIndex <= 0 ? "Previous seasons" : "Every season";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <History className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-1">
        {history.map((entry, index) => {
          const ctc = parseCtcToNumber(entry.offered_ctc);
          // Compared against the next entry, which is the season before it -
          // the list is already newest-first. Only when it really is a
          // different season: a company can run two drives in one year, and
          // labelling the gap between them as a year-on-year change would be
          // an invented trend.
          const previous = history[index + 1];
          const previousCtc =
            previous && previous.season?.slug !== entry.season?.slug
              ? parseCtcToNumber(previous.offered_ctc)
              : null;
          const delta = ctc !== null && previousCtc !== null ? ctc - previousCtc : null;
          const isViewing = entry.id === companyId;

          return (
            <div
              key={entry.id}
              className={cn(
                "flex items-center gap-3 rounded-sm px-2 py-2",
                isViewing && "bg-muted/50",
              )}
            >
              <span className="w-[4.5rem] shrink-0 font-mono text-2xs tabular text-muted-foreground">
                {entry.season?.slug ?? "?"}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-sm tabular">
                    {ctc ? formatCtc(ctc) : "--"}
                  </span>
                  {delta !== null && delta !== 0 && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 font-mono text-2xs tabular",
                        delta > 0 ? "text-success" : "text-destructive",
                      )}
                      title={`${delta > 0 ? "Up" : "Down"} on the previous season`}
                    >
                      {delta > 0 ? (
                        <ArrowUpRight className="h-3 w-3" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" />
                      )}
                      {formatCtc(Math.abs(delta))}
                    </span>
                  )}
                  {delta === 0 && (
                    <span className="inline-flex items-center text-2xs text-muted-foreground">
                      <Minus className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <p className="text-2xs text-muted-foreground">
                  {entry.people_selected != null
                    ? `${entry.people_selected} selected`
                    : "Selections not recorded"}
                  {entry.cgpa_cutoff != null && ` · CGPA ${Number(entry.cgpa_cutoff).toFixed(2)}`}
                </p>
              </div>

              {isViewing ? (
                <span className="shrink-0 text-2xs text-muted-foreground">viewing</span>
              ) : (
                <Link
                  to={`/companies/${entry.id}?season=${entry.season?.slug ?? season}`}
                  onClick={() => entry.season && setSeason(entry.season.slug)}
                  className="shrink-0 text-2xs text-primary underline-offset-4 hover:underline"
                >
                  Open
                </Link>
              )}
            </div>
          );
        })}

        <p className="pt-2 text-2xs text-muted-foreground">
          Matched on the company name, so a renamed company may not link up.
        </p>
      </CardContent>
    </Card>
  );
}
