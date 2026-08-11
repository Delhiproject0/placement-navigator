import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyTracking, useRemoveApplication, useSaveApplication, useToggleBookmark } from "@/hooks/queries";
import { APPLICATION_STAGES, type ApplicationStage } from "@/lib/api";
import { STAGE_LABELS } from "@/lib/applications";
import { cn } from "@/lib/utils";

/**
 * Save a company, and record where you are with it.
 *
 * Both are private to the signed-in user; nothing here is visible to anyone
 * else, which is why the card says so.
 */
export function TrackingControls({ companyId }: { companyId: string }) {
  const { data, isPending } = useCompanyTracking(companyId, true);
  const toggleBookmark = useToggleBookmark(companyId);
  const saveApplication = useSaveApplication();
  const removeApplication = useRemoveApplication();

  const bookmarked = data?.bookmarked ?? false;
  const stage = data?.application?.stage ?? "";

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <Button
          variant={bookmarked ? "secondary" : "outline"}
          className="w-full"
          disabled={isPending}
          onClick={() => toggleBookmark.mutate(bookmarked)}
        >
          {bookmarked ? (
            <BookmarkCheck className="mr-2 h-4 w-4" />
          ) : (
            <Bookmark className="mr-2 h-4 w-4" />
          )}
          {bookmarked ? "Saved" : "Save this company"}
        </Button>

        <div className="space-y-1.5">
          <Label htmlFor="application-stage" className="text-2xs uppercase tracking-wider text-muted-foreground">
            Your stage
          </Label>
          <Select
            value={stage}
            disabled={isPending || saveApplication.isPending}
            onValueChange={(value) =>
              saveApplication.mutate({ company_id: companyId, stage: value as ApplicationStage })
            }
          >
            <SelectTrigger id="application-stage" className={cn(!stage && "text-muted-foreground")}>
              <SelectValue placeholder="Not tracking" />
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_STAGES.map((value) => (
                <SelectItem key={value} value={value}>
                  {STAGE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {stage && (
            <button
              type="button"
              onClick={() => removeApplication.mutate(companyId)}
              className="text-2xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Stop tracking this company
            </button>
          )}
        </div>

        <p className="flex items-center gap-1.5 border-t border-border pt-3 text-2xs text-muted-foreground">
          {(toggleBookmark.isPending || saveApplication.isPending) && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          Only you can see this.
        </p>
      </CardContent>
    </Card>
  );
}
