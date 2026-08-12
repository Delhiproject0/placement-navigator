/**
 * The subscribable calendar feed.
 *
 * This is the one authenticated route that cannot use the Authorization
 * header: calendar clients poll a bare URL on their own schedule. The token in
 * the path is therefore the credential, which is why it is 32 random bytes,
 * rotatable, and grants nothing but a read of the placement schedule.
 */

import { db, type Caller } from "../context.ts";
import { CORS_HEADERS, fail, json } from "../http.ts";
import { buildIcs, companyEvents, type CalendarCompany } from "../ics.ts";

const SITE_URL = Deno.env.get("PLACEMENTS_SITE_URL") ?? "https://placements.dileepadari.dev";

/**
 * Issues or rotates the caller's token.
 *
 * Only the token is returned, not a URL. Behind Kong, `req.url` is the
 * runtime's *internal* address (http://127.0.0.1:8081/...), so composing the
 * subscribe link here produced one no calendar client could resolve. The
 * browser already knows the public API base, so it composes the link instead.
 */
export async function issueCalendarToken(caller: Caller): Promise<Response> {
  const { data, error } = await db.rpc("issue_calendar_token", { _user_id: caller.id });
  if (error || !data) return fail(500, "TOKEN_FAILED", "Could not create a calendar link");
  return json({ token: data });
}

export async function getCalendarToken(caller: Caller): Promise<Response> {
  const { data } = await db
    .from("profiles")
    .select("calendar_token")
    .eq("user_id", caller.id)
    .maybeSingle();

  return json({ token: data?.calendar_token ?? null });
}

export async function revokeCalendarToken(caller: Caller): Promise<Response> {
  const { error } = await db
    .from("profiles")
    .update({ calendar_token: null })
    .eq("user_id", caller.id);
  if (error) return fail(500, "REVOKE_FAILED", "Could not revoke the calendar link");
  return json({ success: true });
}

/**
 * Serves the feed. Unauthenticated by design - the token is the credential.
 *
 * A wrong token gets a flat 404 with no detail: distinguishing "no such token"
 * from "token exists but something else went wrong" would let someone probe
 * for valid ones.
 */
export async function serveCalendar(token: string): Promise<Response> {
  const clean = token.replace(/\.ics$/, "");
  // Match the shape the issuer produces before touching the database.
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(clean)) {
    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  }

  const { data: profile } = await db
    .from("profiles")
    .select("user_id")
    .eq("calendar_token", clean)
    .maybeSingle();

  if (!profile) return new Response("Not found", { status: 404, headers: CORS_HEADERS });

  // The feed covers the whole placement calendar, which is public information
  // anyway; the token identifies whose subscription it is, not what they may
  // see. Bookmarked companies are listed first in the description so a
  // subscriber can tell theirs apart.
  //
  // Always the *current* season, never a selected one: a subscription is a
  // standing thing, and the point of it is upcoming dates. It follows the
  // rollover on its own, so nobody has to resubscribe each August.
  const { data: season } = await db
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  const { data: companies } = await db
    .from("companies")
    .select(
      "id, name, job_location, registration_deadline, ppt_datetime, oa_datetime, interview_datetime, offered_ctc",
    )
    .eq("season_id", season?.id ?? "00000000-0000-0000-0000-000000000000");

  const ics = buildIcs(
    companyEvents((companies ?? []) as CalendarCompany[], SITE_URL),
    "PlaceTrack - IIITH",
  );

  return new Response(ics, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="placetrack.ics"',
      // Calendar clients poll aggressively; an hour is a reasonable floor.
      "Cache-Control": "public, max-age=3600",
    },
  });
}
