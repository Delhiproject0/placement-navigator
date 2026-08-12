/**
 * Placement seasons.
 *
 * A season scopes essentially everything the site shows, so resolving "which
 * season" happens once, here, and every other route takes the resolved id.
 */

import { db, dbAs, type Caller } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

export interface Season {
  id: string;
  slug: string;
  label: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
}

/**
 * Turns a `?season=` parameter into a season id.
 *
 * Returns the current season when the parameter is absent, and `undefined`
 * when it names a season that does not exist - callers treat that as "no
 * results" rather than silently falling back to the current season, because
 * quietly showing 2025 data under a 2019 URL is worse than showing nothing.
 */
export async function resolveSeasonId(url: URL): Promise<string | undefined> {
  const requested = str(url.searchParams.get("season"));

  if (requested && requested !== "all") {
    const { data } = await db.from("seasons").select("id").eq("slug", requested).maybeSingle();
    return data?.id;
  }
  if (requested === "all") return undefined;

  const { data } = await db.from("seasons").select("id").eq("is_current", true).maybeSingle();
  return data?.id;
}

/** True when the caller explicitly asked for every season at once. */
export function wantsAllSeasons(url: URL): boolean {
  return str(url.searchParams.get("season")) === "all";
}

export async function listSeasons(): Promise<Response> {
  const { data, error } = await db
    .from("seasons")
    .select("*, companies(count)")
    .order("slug", { ascending: false });

  if (error) return fail(500, "QUERY_FAILED", "Could not load seasons");

  return json({
    seasons: (data ?? []).map((season) => ({
      ...season,
      // PostgREST returns the aggregate as a one-element array.
      company_count: Array.isArray(season.companies) ? (season.companies[0]?.count ?? 0) : 0,
      companies: undefined,
    })),
  });
}

export async function createSeason(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<{ slug?: string; label?: string; make_current?: boolean }>(req);
  const slug = str(body?.slug);

  if (!slug || !/^\d{4}-\d{2}$/.test(slug)) {
    return fail(422, "VALIDATION_FAILED", "Check the form", {
      slug: "Use the form 2025-26",
    });
  }

  // The second half must follow the first, or the label is a lie.
  const startYear = Number(slug.slice(0, 4));
  const endYear = Number(slug.slice(5));
  if ((startYear + 1) % 100 !== endYear) {
    return fail(422, "VALIDATION_FAILED", "Check the form", {
      slug: `${slug} is not consecutive - did you mean ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}?`,
    });
  }

  const { data: id, error } = await db.rpc("ensure_season", { _slug: slug });
  if (error || !id) return fail(500, "CREATE_FAILED", "Could not create the season");

  const label = str(body?.label);
  if (label) await dbAs(caller).from("seasons").update({ label }).eq("id", id);
  if (body?.make_current === true) await setCurrentSeasonById(id, caller);

  const { data: season } = await db.from("seasons").select("*").eq("id", id).maybeSingle();
  return json({ season }, 201);
}

async function setCurrentSeasonById(id: string, caller: Caller): Promise<string | null> {
  // A partial unique index enforces exactly one current season, so the old one
  // has to be cleared first - doing it the other way round trips the index.
  const { error: clearError } = await dbAs(caller)
    .from("seasons")
    .update({ is_current: false })
    .eq("is_current", true);
  if (clearError) return clearError.message;

  const { error } = await dbAs(caller).from("seasons").update({ is_current: true }).eq("id", id);
  return error?.message ?? null;
}

export async function setCurrentSeason(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<{ slug?: string }>(req);
  const slug = str(body?.slug);
  if (!slug) return fail(400, "MISSING_SLUG", "Which season?");

  const { data: season } = await db.from("seasons").select("id").eq("slug", slug).maybeSingle();
  if (!season) return fail(404, "NOT_FOUND", "That season does not exist");

  const problem = await setCurrentSeasonById(season.id, caller);
  if (problem) return fail(500, "UPDATE_FAILED", "Could not change the current season");

  console.log(`[audit] ${caller.email} made ${slug} the current season`);
  return json({ success: true, slug });
}

export async function deleteSeason(slug: string, caller: Caller): Promise<Response> {
  const { data: season } = await db
    .from("seasons")
    .select("id, is_current")
    .eq("slug", slug)
    .maybeSingle();

  if (!season) return fail(404, "NOT_FOUND", "That season does not exist");
  if (season.is_current) {
    return fail(400, "CANNOT_DELETE_CURRENT", "Make another season current first");
  }

  // The FK is ON DELETE RESTRICT, so this would fail anyway - but a counted
  // message is more use than a foreign key violation.
  const { count } = await db
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("season_id", season.id);

  if ((count ?? 0) > 0) {
    return fail(
      400,
      "SEASON_NOT_EMPTY",
      `${count} compan${count === 1 ? "y is" : "ies are"} still in this season`,
    );
  }

  const { error } = await dbAs(caller).from("seasons").delete().eq("id", season.id);
  if (error) return fail(500, "DELETE_FAILED", "Could not delete the season");
  return json({ success: true });
}

/**
 * Every season a given organisation has appeared in.
 *
 * Matched on `org_slug` rather than on the exact name, so "Acme Pvt Ltd" in one
 * year and "Acme" in another are recognised as the same company.
 */
export async function companyHistory(companyId: string): Promise<Response> {
  const { data: company } = await db
    .from("companies")
    .select("org_slug")
    .eq("id", companyId)
    .maybeSingle();

  if (!company) return fail(404, "NOT_FOUND", "That company does not exist");

  const { data, error } = await db
    .from("companies")
    .select(
      "id, name, offered_ctc, cgpa_cutoff, people_selected, roles, job_location, status, registration_deadline, oa_datetime, interview_datetime, seasons(slug, label)",
    )
    .eq("org_slug", company.org_slug);

  if (error) return fail(500, "QUERY_FAILED", "Could not load the history");

  const rows = (data ?? []).map((row) => ({
    ...row,
    season: Array.isArray(row.seasons) ? row.seasons[0] : row.seasons,
    seasons: undefined,
  }));

  // Newest season first, which is the order the panel reads in.
  rows.sort((a, b) => (b.season?.slug ?? "").localeCompare(a.season?.slug ?? ""));

  return json({ org_slug: company.org_slug, history: rows });
}
