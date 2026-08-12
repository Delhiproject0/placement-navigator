import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Check, Loader2, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useCreateSeason, useDeleteSeason, useSetCurrentSeason } from "@/hooks/queries";
import { useSeason } from "@/hooks/useSeason";
import { api, ApiError } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

/** The next season after the newest one on record, as a starting suggestion. */
function suggestNext(slugs: string[]): string {
  const years = slugs.map((slug) => Number(slug.slice(0, 4))).filter(Number.isFinite);
  const start = years.length ? Math.max(...years) + 1 : new Date().getFullYear();
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function SeasonsPanel() {
  const { season: viewing } = useSeason();
  const { data: seasons = [], isPending } = useQuery({
    queryKey: qk.seasons,
    queryFn: () => api.seasons.list(),
  });

  const create = useCreateSeason();
  const setCurrent = useSetCurrentSeason();
  const remove = useDeleteSeason();

  const [slug, setSlug] = useState("");
  const [label, setLabel] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);

  const suggestion = suggestNext(seasons.map((entry) => entry.slug));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSlugError(null);
    try {
      await create.mutateAsync({ slug: slug.trim(), label: label.trim() || undefined });
      setSlug("");
      setLabel("");
    } catch (error) {
      // The API checks the year pair is consecutive and returns the correction
      // in the field error, which is more use next to the input than in a toast.
      if (error instanceof ApiError && error.details?.slug) setSlugError(error.details.slug);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-base">Placement seasons</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every company belongs to one season. The live season is what visitors see by default and
            what the calendar feed follows; the rest are the archive.
          </p>
        </CardHeader>

        <CardContent>
          {isPending ? (
            <Shimmer className="h-40 w-full rounded-sm" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-2xs uppercase tracking-wider">Season</TableHead>
                  <TableHead className="text-2xs uppercase tracking-wider">Runs</TableHead>
                  <TableHead className="text-2xs uppercase tracking-wider text-right">
                    Companies
                  </TableHead>
                  <TableHead className="text-2xs uppercase tracking-wider">Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {seasons.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span className="font-mono text-sm tabular">{entry.label}</span>
                      {entry.slug === viewing && (
                        <span className="ml-2 text-2xs text-muted-foreground">viewing</span>
                      )}
                    </TableCell>

                    <TableCell className="whitespace-nowrap font-mono text-2xs tabular text-muted-foreground">
                      {entry.starts_on} to {entry.ends_on}
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm tabular">
                      {entry.company_count}
                    </TableCell>

                    <TableCell>
                      {entry.is_current ? (
                        <Badge variant="default" className="gap-1">
                          <Check className="h-3 w-3" />
                          Live
                        </Badge>
                      ) : (
                        <Badge variant="outline">Archive</Badge>
                      )}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!entry.is_current && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-2xs"
                            disabled={setCurrent.isPending}
                            onClick={() => setCurrent.mutate(entry.slug)}
                          >
                            Make live
                          </Button>
                        )}

                        {/* Deleting a season with companies in it is refused by
                            the API, so the button is only offered when it would
                            actually work. */}
                        {!entry.is_current && entry.company_count === 0 && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                aria-label={`Delete ${entry.label}`}
                              >
                                <Trash className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {entry.label}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  It has no companies in it, so nothing is lost. It will be
                                  recreated automatically if a drive is dated inside it.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => remove.mutate(entry.slug)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="font-display text-base">Add a season</CardTitle>
          <p className="text-sm text-muted-foreground">
            A season runs August to July. Adding one does not change which is live - do that
            separately, once the drives are in.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="season-slug">Season</Label>
              <Input
                id="season-slug"
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugError(null);
                }}
                placeholder={suggestion}
                className={cn("w-40 font-mono tabular", slugError && "border-destructive")}
                aria-invalid={Boolean(slugError)}
                aria-describedby={slugError ? "season-slug-error" : undefined}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="season-label">Label (optional)</Label>
              <Input
                id="season-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={slug || suggestion}
                className="w-48"
              />
            </div>

            <Button type="submit" disabled={create.isPending || !slug.trim()}>
              {create.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CalendarPlus className="mr-2 h-4 w-4" />
              )}
              Add
            </Button>

            {!slug && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSlug(suggestion)}
                className="text-xs text-muted-foreground"
              >
                Use {suggestion}
              </Button>
            )}
          </form>

          {slugError && (
            <p id="season-slug-error" className="mt-2 text-xs text-destructive">
              {slugError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
