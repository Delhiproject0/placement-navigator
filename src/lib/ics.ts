/**
 * ICS generation.
 *
 * The implementation is shared with the edge function rather than duplicated:
 * the calendar subscription feed is served by the API and the download button
 * is built in the browser, and two copies of RFC 5545 escaping would drift.
 * The canonical module lives beside the function because Deno cannot import
 * from `src/`, while Vite can import from anywhere under the project root.
 */
export * from "../../supabase/functions/placements/ics.ts";

export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
