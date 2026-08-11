/**
 * iCalendar (RFC 5545) generation for placement events.
 *
 * Written by hand because the format's awkward parts are few and specific:
 * line folding at 75 octets, escaping in TEXT values, and UIDs that stay
 * stable so a re-subscribe updates events instead of duplicating them.
 *
 * All timestamps are emitted as UTC (the `Z` form) rather than with a TZID.
 * A TZID reference obliges the file to carry a matching VTIMEZONE definition,
 * and a calendar client that does not recognise the identifier will place the
 * event at the wrong hour. UTC is unambiguous everywhere and every client
 * renders it in the reader's own zone.
 */

export interface CalendarEvent {
  /** Stable across regenerations - the same event must keep the same UID. */
  uid: string;
  start: Date;
  /** Omit for a point-in-time event; defaults to one hour after the start. */
  end?: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  /** Minutes before the start to alarm. Empty for no alarm. */
  alarmsMinutesBefore?: number[];
}

/** YYYYMMDDTHHMMSSZ */
function toIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Escapes a TEXT value. Backslash first, or it would double-escape the
 * backslashes introduced by the later replacements.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a line to 75 octets, continuing with a leading space.
 *
 * Counted in octets, not characters: a description containing non-ASCII would
 * otherwise produce lines that are legal by length but overlong once encoded,
 * which strict parsers reject.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // 74 leaves room for the leading space on the continuation line.
    if (currentBytes + size > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current) parts.push(current);

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

export function buildIcs(events: CalendarEvent[], calendarName = "PlaceTrack"): string {
  const now = toIcsDate(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PlaceTrack//Placement Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];

  for (const event of events) {
    const end = event.end ?? new Date(event.start.getTime() + 3_600_000);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${toIcsDate(event.start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );

    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${event.url}`);

    for (const minutes of event.alarmsMinutesBefore ?? []) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `TRIGGER:-PT${minutes}M`,
        `DESCRIPTION:${escapeText(event.summary)}`,
        "END:VALARM",
      );
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  // CRLF throughout, and a trailing one - some parsers need the final line
  // terminated.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

// --- placement events ------------------------------------------------------

export interface CalendarCompany {
  id: string;
  name: string;
  job_location?: string | null;
  registration_deadline?: string | null;
  ppt_datetime?: string | null;
  oa_datetime?: string | null;
  interview_datetime?: string | null;
  offered_ctc?: string | null;
}

const STAGES = [
  { key: "registration_deadline", label: "registration closes", alarms: [4320, 1440, 180] },
  { key: "ppt_datetime", label: "pre-placement talk", alarms: [1440, 60] },
  { key: "oa_datetime", label: "online assessment", alarms: [1440, 60] },
  { key: "interview_datetime", label: "interviews", alarms: [1440, 60] },
] as const;

/**
 * One VEVENT per scheduled stage.
 *
 * The UID is derived from the company id and the stage, so regenerating the
 * feed updates the existing entry rather than adding a second copy - the
 * usual reason a subscribed calendar fills with duplicates.
 */
export function companyEvents(
  companies: CalendarCompany[],
  siteUrl = "https://placements.dileepadari.dev",
): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const company of companies) {
    for (const stage of STAGES) {
      const raw = company[stage.key];
      if (!raw) continue;

      const start = new Date(raw);
      if (Number.isNaN(start.getTime())) continue;

      const isDeadline = stage.key === "registration_deadline";

      events.push({
        uid: `${company.id}-${stage.key}@placetrack`,
        start,
        // A deadline is an instant, not an hour-long meeting.
        end: isDeadline ? new Date(start.getTime() + 900_000) : undefined,
        summary: `${company.name} - ${stage.label}`,
        description: [
          company.offered_ctc ? `CTC: ${company.offered_ctc}` : null,
          `${siteUrl}/companies/${company.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
        location: company.job_location ?? undefined,
        url: `${siteUrl}/companies/${company.id}`,
        alarmsMinutesBefore: [...stage.alarms],
      });
    }
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
