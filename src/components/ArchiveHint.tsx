import { Link } from "react-router-dom";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeason } from "@/hooks/useSeason";
import type { Season } from "@/lib/api";

/**
 * The most recent season that actually has drives in it, other than the one
 * being viewed.
 *
 * Returns null when there is nothing better to offer, so callers can render
 * the hint unconditionally and get nothing when it would be noise.
 */
function useArchiveFallback(): Season | null {
  const { season, seasons } = useSeason();
  if (!season) return null;

  return (
    [...seasons]
      .sort((a, b) => b.slug.localeCompare(a.slug))
      .find((entry) => entry.slug !== season && entry.company_count > 0) ?? null
  );
}

/**
 * A way out of an empty season.
 *
 * A placement year runs August to July, so for a stretch every August the
 * current season is real but has no drives in it yet. Without this the site
 * greets a student with "0 companies tracked" and two empty panels, and gives
 * them no hint that several hundred past drives are one dropdown away - the
 * year selector is in the header, but nobody thinks to look at it when the
 * page appears to be simply empty.
 */
export function ArchiveHint({ className }: { className?: string }) {
  const fallback = useArchiveFallback();
  if (!fallback) return null;

  return (
    <Button variant="outline" className={className} asChild>
      <Link to={`/companies?season=${fallback.slug}`}>
        <History className="mr-2 h-4 w-4" />
        Browse the {fallback.label} archive
        <span className="ml-2 font-mono text-2xs tabular text-muted-foreground">
          {fallback.company_count}
        </span>
      </Link>
    </Button>
  );
}

/**
 * The same offer as a sentence, for places where a button would be too loud.
 */
export function ArchiveHintLine({ className }: { className?: string }) {
  const fallback = useArchiveFallback();
  const { season } = useSeason();
  if (!fallback) return null;

  return (
    <p className={className}>
      The <span className="font-mono tabular">{season}</span> season has not started yet.{" "}
      <Link
        to={`/companies?season=${fallback.slug}`}
        className="font-medium text-primary underline-offset-4 hover:underline"
      >
        Browse the {fallback.label} archive
      </Link>{" "}
      to see how last year went.
    </p>
  );
}
