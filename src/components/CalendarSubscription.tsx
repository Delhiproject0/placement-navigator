import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

/**
 * The personal calendar feed URL.
 *
 * The URL contains a bearer token, so the copy affordance is deliberate and
 * the copy explains what sharing it means. Rotating issues a new token and
 * invalidates the old URL, which is the only revocation a subscribed calendar
 * client will notice.
 */
export function CalendarSubscription() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["calendar", "token"],
    queryFn: () => api.calendar.getToken(),
  });

  const feedUrl = data?.token ? api.calendar.feedUrl(data.token) : null;

  const issue = useMutation({
    mutationFn: () => api.calendar.issueToken(),
    onSuccess: (result) => {
      queryClient.setQueryData(["calendar", "token"], result);
      toast.success("Calendar link ready");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not create the link"),
  });

  const revoke = useMutation({
    mutationFn: () => api.calendar.revokeToken(),
    onSuccess: () => {
      queryClient.setQueryData(["calendar", "token"], { token: null });
      toast.success("Calendar link revoked");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not revoke the link"),
  });

  const copy = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused in some contexts; the input is selectable
      // so there is still a way through.
      toast.error("Could not copy - select the URL and copy it manually");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <CalendarDays className="h-4 w-4" />
          Calendar subscription
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Subscribe in Google Calendar, Apple Calendar or Outlook and every deadline, test and
          interview appears alongside your own events - and keeps updating as dates change.
        </p>

        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : feedUrl ? (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={feedUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
                aria-label="Your calendar feed URL"
              />
              <Button variant="outline" size="icon" onClick={copy} aria-label="Copy the URL">
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <p className="text-2xs text-muted-foreground">
              Anyone with this URL can read the placement calendar. It identifies your
              subscription, so treat it as private and rotate it if you paste it anywhere shared.
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => issue.mutate()}
                disabled={issue.isPending}
              >
                {issue.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Rotate
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending}
                className="text-destructive hover:text-destructive"
              >
                Revoke
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={() => issue.mutate()} disabled={issue.isPending}>
            {issue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create my calendar link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
