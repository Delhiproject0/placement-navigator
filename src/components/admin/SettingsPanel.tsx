import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Megaphone, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TagInput } from "@/components/forms/TagInput";
import { api, ApiError, type Announcement } from "@/lib/api";
import { formatInISTHuman } from "@/lib/utils";

export function SettingsPanel() {
  return (
    <div className="space-y-6">
      <SignupSettings />
      <Announcements />
    </div>
  );
}

function SignupSettings() {
  const queryClient = useQueryClient();
  const [domains, setDomains] = useState<string[]>([]);
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const { data: settings, isPending } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: () => api.settings.get(),
  });

  // Seeded once the request lands, not from defaults - the values are unknown
  // on the first render.
  useEffect(() => {
    if (settings) {
      setDomains(settings.signup_allowed_domains ?? []);
      setSignupEnabled(settings.signup_enabled);
    }
  }, [settings]);

  const save = useMutation({
    mutationFn: () =>
      api.settings.update({ signup_allowed_domains: domains, signup_enabled: signupEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
      setFieldError(null);
      toast.success("Settings saved");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.details?.signup_allowed_domains) {
        setFieldError(error.details.signup_allowed_domains);
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "Could not save the settings");
    },
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="font-display text-base">Registration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Allow new accounts</p>
            <p className="text-xs text-muted-foreground">
              Turning this off stops registration entirely. Existing accounts are unaffected.
            </p>
          </div>
          <Switch
            checked={signupEnabled}
            onCheckedChange={setSignupEnabled}
            disabled={isPending}
            aria-label="Allow new accounts"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="domains">Allowed email domains</Label>
          <TagInput
            id="domains"
            value={domains}
            onChange={(next) => {
              setDomains(next);
              setFieldError(null);
            }}
            placeholder="iiit.ac.in, then Enter"
          />
          <p className="text-xs text-muted-foreground">
            {domains.length === 0
              ? "Empty means anyone may register with any email address."
              : `Only addresses at ${domains.join(", ")} may register.`}
          </p>
          {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending || isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const SEVERITIES = ["info", "warning", "critical"] as const;

function Announcements() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<Announcement["severity"]>("info");
  const [pinned, setPinned] = useState(false);

  const { data: announcements = [] } = useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: () => api.announcements.listAll(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "announcements"] });
    // The public banner reads a different key.
    queryClient.invalidateQueries({ queryKey: ["announcements"] });
  };

  const create = useMutation({
    mutationFn: () => api.announcements.create({ title, body: body || null, severity, pinned }),
    onSuccess: () => {
      invalidate();
      setTitle("");
      setBody("");
      setPinned(false);
      setSeverity("info");
      toast.success("Announcement published");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not publish that"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.announcements.remove(id),
    onSuccess: () => {
      invalidate();
      toast.success("Announcement removed");
    },
  });

  const isLive = (announcement: Announcement) => {
    const now = Date.now();
    return (
      new Date(announcement.publish_at).getTime() <= now &&
      (!announcement.expires_at || new Date(announcement.expires_at).getTime() > now)
    );
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Megaphone className="h-4 w-4" />
          Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Placement week starts Monday"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="announcement-body">Detail (optional)</Label>
            <Textarea
              id="announcement-body"
              rows={2}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="announcement-severity">Severity</Label>
              <Select
                value={severity}
                onValueChange={(value) => setSeverity(value as Announcement["severity"])}
              >
                <SelectTrigger id="announcement-severity" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pb-2">
              <Switch id="announcement-pinned" checked={pinned} onCheckedChange={setPinned} />
              <Label htmlFor="announcement-pinned" className="text-sm font-normal">
                Pin to the top
              </Label>
            </div>

            <Button
              className="ml-auto"
              onClick={() => create.mutate()}
              disabled={!title.trim() || create.isPending}
            >
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publish
            </Button>
          </div>

          {severity === "critical" && (
            <p className="text-xs text-warning">
              Critical notices cannot be dismissed by readers - use them sparingly.
            </p>
          )}
        </div>

        {announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {announcements.map((announcement) => (
              <li key={announcement.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{announcement.title}</p>
                    <Badge variant="outline" className="text-2xs capitalize">
                      {announcement.severity}
                    </Badge>
                    {announcement.pinned && (
                      <Badge variant="outline" className="text-2xs">
                        pinned
                      </Badge>
                    )}
                    {!isLive(announcement) && (
                      <Badge variant="outline" className="text-2xs text-muted-foreground">
                        not live
                      </Badge>
                    )}
                  </div>
                  {announcement.body && (
                    <p className="mt-0.5 text-sm text-muted-foreground">{announcement.body}</p>
                  )}
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {formatInISTHuman(announcement.publish_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(announcement.id)}
                  aria-label={`Remove ${announcement.title}`}
                >
                  <Trash className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
