import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, TriangleAlert, X } from "lucide-react";
import { api, type Announcement } from "@/lib/api";
import { cn } from "@/lib/utils";

const DISMISSED_KEY = "placetrack.dismissed-announcements";

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

const TONE = {
  info: { className: "border-info/30 bg-info/10 text-info", Icon: Info },
  warning: { className: "border-warning/35 bg-warning/12 text-warning", Icon: TriangleAlert },
  critical: {
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    Icon: AlertTriangle,
  },
} as const;

/**
 * Site-wide notices from the admins.
 *
 * Dismissal is remembered per announcement id in localStorage, so a banner
 * someone has read does not follow them around the site - but a *new* one
 * still appears. Critical notices cannot be dismissed.
 */
export function AnnouncementBanner() {
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.announcements.live(),
    // Nothing here is urgent enough to refetch aggressively.
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
    } catch {
      // Private browsing can refuse writes; the banner simply reappears.
    }
  }, [dismissed]);

  const visible = announcements.filter(
    (announcement: Announcement) =>
      announcement.severity === "critical" || !dismissed.includes(announcement.id),
  );

  if (visible.length === 0) return null;

  return (
    <div className="border-b border-border">
      {visible.map((announcement) => {
        const tone = TONE[announcement.severity] ?? TONE.info;
        const canDismiss = announcement.severity !== "critical";

        return (
          <div key={announcement.id} className={cn("border-b last:border-b-0", tone.className)}>
            <div className="container flex items-start gap-3 py-2.5">
              <tone.Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{announcement.title}</p>
                {announcement.body && (
                  <p className="mt-0.5 text-sm opacity-90">{announcement.body}</p>
                )}
              </div>
              {canDismiss && (
                <button
                  type="button"
                  onClick={() => setDismissed((current) => [...current, announcement.id])}
                  aria-label="Dismiss this notice"
                  className="shrink-0 rounded-xs p-0.5 opacity-70 transition-opacity hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
