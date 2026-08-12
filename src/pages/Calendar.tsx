import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Seo } from "@/components/Seo";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanies } from "@/hooks/queries";
import { useSeason } from "@/hooks/useSeason";
import { buildIcs, companyEvents, downloadIcs, type CalendarEvent } from "@/lib/ics";
import { formatInISTHuman } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** IST, because every drive is scheduled in it regardless of who is reading. */
const IST = "Asia/Kolkata";

/** The calendar grid must be built in IST, not the reader's local zone. */
function istParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") map[part.type] = part.value;
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function istDayKey(date: Date): string {
  const { year, month, day } = istParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CalendarPage = () => {
  const { data: companies = [], isPending } = useCompanies();
  const { season, isArchive } = useSeason();
  const [cursor, setCursor] = useState(() => {
    const { year, month } = istParts(new Date());
    return { year, month };
  });

  const events = useMemo(() => companyEvents(companies), [companies]);

  /**
   * On an archive year, open on the first month that actually has something in
   * it. Today's month is two years past the end of the 2023 season, so the
   * default view is an empty grid and the archive looks broken until you work
   * out you have to page backwards eleven times.
   */
  const landedOn = useRef<string | null>(null);
  useEffect(() => {
    if (!season || events.length === 0) return;
    if (landedOn.current === season) return;
    landedOn.current = season;

    if (!isArchive) {
      const { year, month } = istParts(new Date());
      setCursor({ year, month });
      return;
    }

    const earliest = events.reduce((min, event) => (event.start < min ? event.start : min), events[0].start);
    const { year, month } = istParts(earliest);
    setCursor({ year, month });
  }, [season, isArchive, events]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = istDayKey(event.start);
      const list = map.get(key);
      if (list) list.push(event);
      else map.set(key, [event]);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1));
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
    // Monday-first: JS getUTCDay() is Sunday-based, so Sunday (0) becomes 6.
    const leading = (first.getUTCDay() + 6) % 7;

    const cells: Array<{ key: string; day: number | null }> = [];
    for (let index = 0; index < leading; index += 1) cells.push({ key: `pad-${index}`, day: null });
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({
        key: `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day,
      });
    }
    // Pad to whole weeks so the grid does not have a ragged last row.
    while (cells.length % 7 !== 0) cells.push({ key: `tail-${cells.length}`, day: null });
    return cells;
  }, [cursor]);

  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const todayKey = istDayKey(new Date());

  const step = (delta: number) => {
    setCursor((current) => {
      const month = current.month + delta;
      if (month < 1) return { year: current.year - 1, month: 12 };
      if (month > 12) return { year: current.year + 1, month: 1 };
      return { ...current, month };
    });
  };

  // On the live season this is what is coming; on an archive year nothing is
  // ahead by definition, so the same panel shows how that season began.
  const upcoming = useMemo(
    () =>
      isArchive
        ? [...events].sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 8)
        : events.filter((event) => event.start.getTime() >= Date.now()).slice(0, 8),
    [events, isArchive],
  );

  return (
    <Layout>
      <Seo
        title="Calendar"
        description="Every placement deadline, test and interview on one calendar, in IST."
      />
      <div className="container py-8 md:py-10">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Calendar</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Every scheduled deadline, test and interview. All times are IST.
            </p>
          </div>

          <Button
            variant="outline"
            disabled={events.length === 0}
            onClick={() =>
              downloadIcs(
                `placetrack-${season ?? "calendar"}.ics`,
                buildIcs(events, `PlaceTrack - IIITH ${season ?? ""}`.trim()),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" />
            Download .ics
          </Button>
        </div>

        {isPending ? (
          <Shimmer className="h-[32rem] w-full rounded-lg" />
        ) : events.length === 0 ? (
          <EmptyState
            variant="companies"
            title="Nothing scheduled yet"
            description="Once companies have dates against them, they appear here."
            action={
              <Button asChild>
                <Link to="/companies">Browse companies</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="font-display text-base font-semibold">{monthLabel}</h2>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label="Previous month">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {/* "Today" is not a place worth going in an archive year -
                      it is months past the end of that season. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (isArchive && events.length) {
                        const earliest = events.reduce(
                          (min, event) => (event.start < min ? event.start : min),
                          events[0].start,
                        );
                        setCursor(istParts(earliest));
                        return;
                      }
                      const { year, month } = istParts(new Date());
                      setCursor({ year, month });
                    }}
                  >
                    {isArchive ? "Season start" : "Today"}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label="Next month">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-7 border-b border-border bg-muted/30">
                {WEEKDAYS.map((weekday) => (
                  <div
                    key={weekday}
                    className="px-2 py-1.5 text-center text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {grid.map((cell) => {
                  const dayEvents = cell.day ? (byDay.get(cell.key) ?? []) : [];
                  const isToday = cell.key === todayKey;

                  return (
                    <div
                      key={cell.key}
                      className={cn(
                        "min-h-[5.5rem] border-b border-r border-border p-1.5 last:border-r-0",
                        !cell.day && "bg-muted/20",
                        isToday && "bg-primary/6",
                      )}
                    >
                      {cell.day && (
                        <>
                          <span
                            className={cn(
                              "inline-grid h-5 min-w-5 place-items-center rounded-[999px] px-1 font-mono text-2xs tabular",
                              isToday
                                ? "bg-primary font-semibold text-primary-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {cell.day}
                          </span>

                          <div className="mt-1 space-y-0.5">
                            {dayEvents.slice(0, 3).map((event) => (
                              <p
                                key={event.uid}
                                title={`${event.summary} - ${formatInISTHuman(event.start.toISOString())}`}
                                className="truncate rounded-xs bg-muted px-1 py-0.5 text-2xs"
                              >
                                {event.summary}
                              </p>
                            ))}
                            {dayEvents.length > 3 && (
                              <p className="px-1 text-2xs text-muted-foreground">
                                +{dayEvents.length - 3} more
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardContent className="pt-5">
                  <h2 className="mb-3 font-display text-base font-semibold">
                    {isArchive ? `How ${season} started` : "Next up"}
                  </h2>
                  {upcoming.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing ahead on the calendar.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {upcoming.map((event) => (
                        <li key={event.uid} className="text-sm">
                          <Link
                            to={new URL(event.url ?? "/", window.location.origin).pathname}
                            className="font-medium hover:text-primary"
                          >
                            {event.summary}
                          </Link>
                          <p className="font-mono text-2xs tabular text-muted-foreground">
                            {formatInISTHuman(event.start.toISOString())}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-5">
                  <h2 className="mb-2 flex items-center gap-2 font-display text-base font-semibold">
                    <CalendarDays className="h-4 w-4" />
                    Subscribe
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Downloading the .ics imports a snapshot of {season}. A subscription that keeps
                    updating needs a personal feed URL - see your{" "}
                    <Link to="/me" className="text-primary underline-offset-4 hover:underline">
                      profile
                    </Link>
                    .
                    {/* The feed deliberately follows the live season rather
                        than whatever is selected, so nobody has to resubscribe
                        each August - worth saying while looking at an old one. */}
                    {isArchive && " A subscription always tracks the live season, not this one."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CalendarPage;
