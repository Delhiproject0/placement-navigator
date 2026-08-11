/**
 * Bookmarks and application tracking.
 *
 * Every query here is scoped to `caller.id`. That scoping is the only thing
 * separating one student's application list from another's - the service-role
 * client bypasses RLS - so a missing `.eq("user_id", caller.id)` is a data
 * leak, not a performance issue.
 */

import { db, type Caller } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

const STAGES = new Set([
  "interested",
  "applied",
  "shortlisted",
  "oa",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
  "accepted",
]);

// --- bookmarks -------------------------------------------------------------

export async function listBookmarks(caller: Caller): Promise<Response> {
  const { data, error } = await db
    .from("bookmarks")
    .select("id, created_at, companies(*)")
    .eq("user_id", caller.id)
    .order("created_at", { ascending: false });

  if (error) return fail(500, "QUERY_FAILED", "Could not load your saved companies");
  return json({ bookmarks: data ?? [] });
}

/** Ids only, so a list page can mark rows without fetching each company twice. */
export async function listBookmarkIds(caller: Caller): Promise<Response> {
  const { data, error } = await db.from("bookmarks").select("company_id").eq("user_id", caller.id);
  if (error) return fail(500, "QUERY_FAILED", "Could not load your saved companies");
  return json({ company_ids: (data ?? []).map((row) => row.company_id) });
}

export async function addBookmark(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<{ company_id?: string }>(req);
  const companyId = str(body?.company_id);
  if (!companyId) return fail(400, "MISSING_COMPANY", "A company is required");

  const { data: company } = await db.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return fail(404, "NOT_FOUND", "That company does not exist");

  // Upsert, so double-clicking the save button is not an error.
  const { error } = await db
    .from("bookmarks")
    .upsert({ user_id: caller.id, company_id: companyId }, { onConflict: "user_id,company_id" });

  if (error) return fail(500, "INSERT_FAILED", "Could not save that company");
  return json({ success: true }, 201);
}

export async function removeBookmark(companyId: string, caller: Caller): Promise<Response> {
  const { error } = await db
    .from("bookmarks")
    .delete()
    .eq("user_id", caller.id)
    .eq("company_id", companyId);

  if (error) return fail(500, "DELETE_FAILED", "Could not remove that company");
  return json({ success: true });
}

// --- applications ----------------------------------------------------------

export async function listApplications(caller: Caller): Promise<Response> {
  const { data, error } = await db
    .from("applications")
    .select("*, companies(*)")
    .eq("user_id", caller.id)
    .order("updated_at", { ascending: false });

  if (error) return fail(500, "QUERY_FAILED", "Could not load your applications");
  return json({ applications: data ?? [] });
}

export async function upsertApplication(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<{ company_id?: string; stage?: string; notes?: string | null }>(req);
  const companyId = str(body?.company_id);
  const stage = str(body?.stage);

  if (!companyId) return fail(400, "MISSING_COMPANY", "A company is required");
  if (stage && !STAGES.has(stage)) return fail(400, "INVALID_STAGE", "Unknown stage");

  const { data: company } = await db.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return fail(404, "NOT_FOUND", "That company does not exist");

  const values: Record<string, unknown> = { user_id: caller.id, company_id: companyId };
  if (stage) values.stage = stage;
  if ("notes" in (body ?? {})) values.notes = str(body?.notes);

  const { data, error } = await db
    .from("applications")
    .upsert(values, { onConflict: "user_id,company_id" })
    .select("*, companies(*)")
    .single();

  if (error) return fail(500, "UPSERT_FAILED", "Could not update your application");
  return json({ application: data });
}

export async function removeApplication(companyId: string, caller: Caller): Promise<Response> {
  const { error } = await db
    .from("applications")
    .delete()
    .eq("user_id", caller.id)
    .eq("company_id", companyId);

  if (error) return fail(500, "DELETE_FAILED", "Could not remove that application");
  return json({ success: true });
}

/** Bookmark and application state for one company, for the detail page. */
export async function trackingForCompany(companyId: string, caller: Caller): Promise<Response> {
  const [bookmark, application] = await Promise.all([
    db
      .from("bookmarks")
      .select("id")
      .eq("user_id", caller.id)
      .eq("company_id", companyId)
      .maybeSingle(),
    db
      .from("applications")
      .select("*")
      .eq("user_id", caller.id)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  return json({
    bookmarked: Boolean(bookmark.data),
    application: application.data ?? null,
  });
}
