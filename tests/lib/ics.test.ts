import { describe, expect, it } from "vitest";
import { buildIcs, companyEvents, type CalendarCompany } from "@/lib/ics";

const START = new Date("2026-09-15T09:30:00Z");

function lines(ics: string): string[] {
  return ics.split("\r\n");
}

describe("buildIcs", () => {
  it("produces a well-formed VCALENDAR", () => {
    const ics = buildIcs([{ uid: "a@x", start: START, summary: "Test" }]);
    const rows = lines(ics);

    expect(rows[0]).toBe("BEGIN:VCALENDAR");
    expect(rows).toContain("VERSION:2.0");
    expect(rows).toContain("END:VCALENDAR");
    expect(rows).toContain("BEGIN:VEVENT");
    expect(rows).toContain("END:VEVENT");
    // Every line must be CRLF-terminated, including the last.
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.includes("\n\n")).toBe(false);
  });

  it("writes timestamps as UTC", () => {
    // A TZID reference would need a matching VTIMEZONE block; without one, a
    // client that does not know the identifier shows the wrong hour.
    const ics = buildIcs([{ uid: "a@x", start: START, summary: "Test" }]);
    expect(ics).toContain("DTSTART:20260915T093000Z");
    // Default duration is one hour.
    expect(ics).toContain("DTEND:20260915T103000Z");
  });

  it("honours an explicit end", () => {
    const ics = buildIcs([
      { uid: "a@x", start: START, end: new Date("2026-09-15T11:00:00Z"), summary: "Test" },
    ]);
    expect(ics).toContain("DTEND:20260915T110000Z");
  });

  it("escapes the characters that would otherwise break parsing", () => {
    const ics = buildIcs([
      {
        uid: "a@x",
        start: START,
        summary: "Acme, Inc; round 1",
        description: "Line one\nLine two \\ backslash",
      },
    ]);
    expect(ics).toContain("SUMMARY:Acme\\, Inc\\; round 1");
    // The backslash is escaped first, so it is not double-escaped by the
    // replacements that follow.
    expect(ics).toContain("Line one\\nLine two \\\\ backslash");
  });

  it("folds long lines at 75 octets with a leading space", () => {
    const ics = buildIcs([{ uid: "a@x", start: START, summary: "x".repeat(200) }]);
    for (const row of lines(ics)) {
      expect(new TextEncoder().encode(row).length).toBeLessThanOrEqual(75);
    }
    // Continuation lines are marked by the leading space.
    expect(ics).toMatch(/\r\n /);
  });

  it("counts folding in octets, not characters", () => {
    // A multi-byte summary that is short in characters but long in bytes must
    // still fold - strict parsers reject overlong encoded lines.
    const ics = buildIcs([{ uid: "a@x", start: START, summary: "अ".repeat(40) }]);
    for (const row of lines(ics)) {
      expect(new TextEncoder().encode(row).length).toBeLessThanOrEqual(75);
    }
  });

  it("emits an alarm per lead time", () => {
    const ics = buildIcs([
      { uid: "a@x", start: START, summary: "Test", alarmsMinutesBefore: [1440, 60] },
    ]);
    expect(ics).toContain("TRIGGER:-PT1440M");
    expect(ics).toContain("TRIGGER:-PT60M");
    expect(lines(ics).filter((row) => row === "BEGIN:VALARM")).toHaveLength(2);
  });

  it("emits a valid empty calendar", () => {
    const ics = buildIcs([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).not.toContain("BEGIN:VEVENT");
  });
});

describe("companyEvents", () => {
  const company: CalendarCompany = {
    id: "abc-123",
    name: "Wavelength Systems",
    job_location: "Bengaluru",
    offered_ctc: "INR 34,05,000",
    registration_deadline: "2026-09-10T18:30:00Z",
    ppt_datetime: "2026-09-14T04:30:00Z",
    oa_datetime: "2026-09-20T09:00:00Z",
    interview_datetime: "2026-09-26T04:00:00Z",
  };

  it("emits one event per scheduled stage", () => {
    const events = companyEvents([company]);
    expect(events).toHaveLength(4);
    expect(events.map((event) => event.summary)).toEqual([
      "Wavelength Systems - registration closes",
      "Wavelength Systems - pre-placement talk",
      "Wavelength Systems - online assessment",
      "Wavelength Systems - interviews",
    ]);
  });

  it("skips stages with no date, rather than inventing one", () => {
    const events = companyEvents([{ id: "x", name: "Sparse", oa_datetime: "2026-09-20T09:00:00Z" }]);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toContain("online assessment");
  });

  it("produces nothing for a company with no dates at all", () => {
    expect(companyEvents([{ id: "x", name: "Announced only" }])).toEqual([]);
  });

  it("ignores an unparseable date instead of emitting Invalid Date", () => {
    const events = companyEvents([{ id: "x", name: "Broken", oa_datetime: "not a date" }]);
    expect(events).toEqual([]);
  });

  it("keeps UIDs stable across regenerations so re-subscribing does not duplicate", () => {
    const first = companyEvents([company]).map((event) => event.uid);
    const second = companyEvents([company]).map((event) => event.uid);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
    expect(first[0]).toBe("abc-123-registration_deadline@placetrack");
  });

  it("treats a deadline as an instant, not an hour-long meeting", () => {
    const [deadline, ppt] = companyEvents([company]);
    expect(deadline.end!.getTime() - deadline.start.getTime()).toBe(900_000);
    expect(ppt.end).toBeUndefined();
  });

  it("sorts chronologically across companies", () => {
    const events = companyEvents([
      { id: "late", name: "Late", oa_datetime: "2026-12-01T09:00:00Z" },
      { id: "early", name: "Early", oa_datetime: "2026-01-01T09:00:00Z" },
    ]);
    expect(events.map((event) => event.uid)).toEqual([
      "early-oa_datetime@placetrack",
      "late-oa_datetime@placetrack",
    ]);
  });

  it("links back to the company and survives the full build", () => {
    const ics = buildIcs(companyEvents([company]));
    expect(ics).toContain("URL:https://placements.dileepadari.dev/companies/abc-123");
    expect(ics).toContain("LOCATION:Bengaluru");
    for (const row of ics.split("\r\n")) {
      expect(new TextEncoder().encode(row).length).toBeLessThanOrEqual(75);
    }
  });
});
