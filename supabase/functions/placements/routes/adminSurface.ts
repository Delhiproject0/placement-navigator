/**
 * Announcements, site settings, the audit log, and central moderation.
 *
 * These are the routes that make "admin" a role rather than a label.
 */

import { db, dbAs, type Caller } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

const SEVERITIES = new Set(["info", "warning", "critical"]);

// --- announcements ---------------------------------------------------------

/** Live announcements only. Public - this is a noticeboard. */
export async function listLiveAnnouncements(): Promise<Response> {
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("announcements")
    .select("*")
    .lte("publish_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("pinned", { ascending: false })
    .order("publish_at", { ascending: false });

  if (error) return fail(500, "QUERY_FAILED", "Could not load announcements");
  return json({ announcements: data ?? [] });
}

/** Everything, including scheduled and expired. Admin only. */
export async function listAllAnnouncements(): Promise<Response> {
  const { data, error } = await db
    .from("announcements")
    .select("*")
    .order("publish_at", { ascending: false });

  if (error) return fail(500, "QUERY_FAILED", "Could not load announcements");
  return json({ announcements: data ?? [] });
}

export async function createAnnouncement(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  const title = str(body?.title);
  const severity = str(body?.severity) ?? "info";

  if (!title) return fail(422, "VALIDATION_FAILED", "Check the form", { title: "A title is required" });
  if (title.length > 200) {
    return fail(422, "VALIDATION_FAILED", "Check the form", { title: "Keep the title under 200 characters" });
  }
  if (!SEVERITIES.has(severity)) return fail(400, "INVALID_SEVERITY", "Unknown severity");

  const expiresAt = str(body?.expires_at);
  const publishAt = str(body?.publish_at);
  if (expiresAt && publishAt && new Date(expiresAt) <= new Date(publishAt)) {
    return fail(422, "VALIDATION_FAILED", "Check the form", {
      expires_at: "Must be after the publish time",
    });
  }

  const { data, error } = await dbAs(caller)
    .from("announcements")
    .insert({
      title,
      body: str(body?.body),
      severity,
      pinned: body?.pinned === true,
      publish_at: publishAt ?? new Date().toISOString(),
      expires_at: expiresAt,
      author_id: caller.id,
    })
    .select()
    .single();

  if (error) return fail(500, "INSERT_FAILED", "Could not publish the announcement");
  return json({ announcement: data }, 201);
}

export async function deleteAnnouncement(id: string, caller: Caller): Promise<Response> {
  const { error } = await dbAs(caller).from("announcements").delete().eq("id", id);
  if (error) return fail(500, "DELETE_FAILED", "Could not remove the announcement");
  return json({ success: true });
}

// --- settings --------------------------------------------------------------

export async function getSettings(): Promise<Response> {
  const { data, error } = await db.from("app_settings").select("*").eq("id", true).maybeSingle();
  if (error) return fail(500, "QUERY_FAILED", "Could not load settings");
  return json({ settings: data });
}

export async function updateSettings(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<{ signup_allowed_domains?: unknown; signup_enabled?: unknown }>(req);
  const values: Record<string, unknown> = {};

  if ("signup_allowed_domains" in (body ?? {})) {
    const raw = body?.signup_allowed_domains;
    const list = Array.isArray(raw)
      ? raw
      : typeof raw === "string"
        ? raw.split(",")
        : null;
    if (list === null) return fail(400, "INVALID_BODY", "Domains must be a list");

    const domains = list
      .map((entry) => String(entry).trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean);

    // A malformed domain would silently lock everyone out of signup, so it is
    // rejected rather than stored.
    const bad = domains.find((domain) => !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain));
    if (bad) {
      return fail(422, "VALIDATION_FAILED", "Check the form", {
        signup_allowed_domains: `"${bad}" is not a valid domain`,
      });
    }
    values.signup_allowed_domains = domains;
  }

  if ("signup_enabled" in (body ?? {})) {
    if (typeof body?.signup_enabled !== "boolean") {
      return fail(400, "INVALID_BODY", "signup_enabled must be true or false");
    }
    values.signup_enabled = body.signup_enabled;
  }

  if (!Object.keys(values).length) return fail(400, "NOTHING_TO_UPDATE", "No changes were supplied");

  const { data, error } = await db
    .from("app_settings")
    .update(values)
    .eq("id", true)
    .select()
    .single();

  if (error) return fail(500, "UPDATE_FAILED", "Could not save the settings");

  console.log(`[audit] ${caller.email} updated settings: ${JSON.stringify(values)}`);
  return json({ settings: data });
}

// --- audit log -------------------------------------------------------------

export async function listAuditLog(url: URL): Promise<Response> {
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const perPage = Math.min(Number(url.searchParams.get("per_page")) || 50, 100);
  const from = (page - 1) * perPage;

  const { data, error, count } = await db
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);

  if (error) return fail(500, "QUERY_FAILED", "Could not load the audit log");

  // Attach actor emails in one query rather than per row.
  const actorIds = [...new Set((data ?? []).map((row) => row.actor_id).filter(Boolean))] as string[];
  const actors = new Map<string, string>();
  if (actorIds.length) {
    const { data: users } = await db.from("app_users").select("id, email").in("id", actorIds);
    for (const user of users ?? []) actors.set(user.id, user.email);
  }

  return json({
    entries: (data ?? []).map((row) => ({
      ...row,
      actor_email: row.actor_id ? (actors.get(row.actor_id) ?? null) : null,
    })),
    total: count ?? 0,
    page,
    per_page: perPage,
  });
}

// --- moderation ------------------------------------------------------------

/**
 * Every contribution across all companies, newest first.
 *
 * Without this, moderating means knowing which company a bad entry is on and
 * navigating there - so in practice spam only gets removed if somebody
 * stumbles across it.
 */
export async function listAllContributions(url: URL): Promise<Response> {
  const perPage = Math.min(Number(url.searchParams.get("per_page")) || 50, 100);

  const [experiences, questions] = await Promise.all([
    db
      .from("interview_experiences")
      .select("*, companies(id, name)")
      .order("created_at", { ascending: false })
      .limit(perPage),
    db
      .from("interview_questions")
      .select("*, companies(id, name)")
      .order("created_at", { ascending: false })
      .limit(perPage),
  ]);

  const authorIds = [
    ...new Set(
      [...(experiences.data ?? []), ...(questions.data ?? [])]
        .map((row) => row.user_id)
        .filter(Boolean),
    ),
  ] as string[];

  const authors = new Map<string, { full_name: string | null; email: string }>();
  if (authorIds.length) {
    const { data: users } = await db
      .from("app_users")
      .select("id, email, full_name")
      .in("id", authorIds);
    for (const user of users ?? []) {
      authors.set(user.id, { full_name: user.full_name, email: user.email });
    }
  }

  const withAuthor = <T extends { user_id: string | null }>(row: T) => ({
    ...row,
    author: row.user_id ? (authors.get(row.user_id) ?? null) : null,
  });

  return json({
    experiences: (experiences.data ?? []).map(withAuthor),
    questions: (questions.data ?? []).map(withAuthor),
  });
}
