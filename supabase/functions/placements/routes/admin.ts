/** User administration, access approval and site statistics. Admin only. */

import { db, dbAs, type Caller, type Role } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

const ROLES = new Set<Role>(["admin", "editor", "viewer"]);

export async function listUsers(url: URL): Promise<Response> {
  const search = str(url.searchParams.get("q"));
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const perPage = Math.min(Number(url.searchParams.get("per_page")) || 25, 100);
  const from = (page - 1) * perPage;

  let query = db
    .from("app_users")
    .select(
      "id, email, full_name, is_active, access_granted, access_granted_at, email_verified, last_login_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);

  // The approval queue: accounts nobody has let in yet.
  if (url.searchParams.get("access") === "pending") query = query.eq("access_granted", false);

  if (search) {
    const escaped = search.replace(/[%_]/g, (char) => `\\${char}`);
    query = query.or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) return fail(500, "QUERY_FAILED", "Could not load users");

  const ids = (data ?? []).map((user) => user.id);
  const roles = new Map<string, Role>();
  if (ids.length) {
    const { data: roleRows } = await db.from("user_roles").select("user_id, role").in("user_id", ids);
    for (const row of roleRows ?? []) roles.set(row.user_id, row.role as Role);
  }

  return json({
    users: (data ?? []).map((user) => ({ ...user, role: roles.get(user.id) ?? "viewer" })),
    total: count ?? 0,
    page,
    per_page: perPage,
  });
}

export async function setUserRole(req: Request, userId: string, caller: Caller): Promise<Response> {
  const body = await readJson<{ role?: string }>(req);
  const role = str(body?.role) as Role | null;

  if (!role || !ROLES.has(role)) return fail(400, "INVALID_ROLE", "Unknown role");

  // Without this an admin can demote themselves and lock the last admin out of
  // the panel with no way back in through the UI.
  if (userId === caller.id && role !== "admin") {
    return fail(400, "CANNOT_DEMOTE_SELF", "You cannot change your own role");
  }

  const { data: user } = await db.from("app_users").select("id").eq("id", userId).maybeSingle();
  if (!user) return fail(404, "NOT_FOUND", "That user does not exist");

  // upsert, not update: a user with no user_roles row previously produced a
  // successful response that had changed nothing at all.
  const { error } = await dbAs(caller)
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });

  if (error) return fail(500, "UPDATE_FAILED", "Could not change the role");

  // Promoting someone is vouching for them. Without this an editor could be
  // appointed and still be locked out, waiting on a second, separate approval
  // from the same admin who just promoted them. Demotion leaves it alone:
  // losing a role is not the same decision as being shown the door.
  if (role !== "viewer") {
    await db
      .from("app_users")
      .update({
        access_granted: true,
        access_granted_at: new Date().toISOString(),
        access_granted_by: caller.id,
      })
      .eq("id", userId)
      .eq("access_granted", false);
  }

  console.log(`[audit] ${caller.email} set role of ${userId} to ${role}`);
  return json({ success: true, role });
}

export async function setUserActive(req: Request, userId: string, caller: Caller): Promise<Response> {
  const body = await readJson<{ is_active?: boolean }>(req);
  if (typeof body?.is_active !== "boolean") {
    return fail(400, "INVALID_BODY", "is_active must be true or false");
  }
  if (userId === caller.id) return fail(400, "CANNOT_DISABLE_SELF", "You cannot disable your own account");

  const { error } = await db
    .from("app_users")
    .update({ is_active: body.is_active })
    .eq("id", userId);
  if (error) return fail(500, "UPDATE_FAILED", "Could not update the account");

  // Disabling must take effect at once, not whenever the access token expires.
  if (!body.is_active) {
    await db
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("revoked_at", null);
  }

  console.log(`[audit] ${caller.email} set is_active=${body.is_active} on ${userId}`);
  return json({ success: true });
}

/**
 * Grants or withdraws access to the site.
 *
 * This is the switch the whole site hangs off: until it is on, an account can
 * sign in and see nothing. Withdrawing needs no session revocation, unlike
 * disabling - `getCaller` re-reads the flag on every request, so the very next
 * call that account makes is refused.
 */
export async function setUserAccess(req: Request, userId: string, caller: Caller): Promise<Response> {
  const body = await readJson<{ access_granted?: boolean }>(req);
  if (typeof body?.access_granted !== "boolean") {
    return fail(400, "INVALID_BODY", "access_granted must be true or false");
  }
  const granted = body.access_granted;

  const { data: user } = await db
    .from("app_users")
    .select("id, access_granted")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return fail(404, "NOT_FOUND", "That user does not exist");

  // An admin is let in by their role, not by this flag, so switching it off
  // would report success and change nothing. Say so instead.
  if (!granted) {
    const { data: roleRow } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (roleRow?.role === "admin") {
      return fail(
        400,
        "ADMIN_ALWAYS_HAS_ACCESS",
        "Admins always have access. Change their role first.",
      );
    }
  }

  if (user.access_granted === granted) return json({ success: true, access_granted: granted });

  const { error } = await db
    .from("app_users")
    .update({
      access_granted: granted,
      access_granted_at: granted ? new Date().toISOString() : null,
      access_granted_by: granted ? caller.id : null,
    })
    .eq("id", userId);
  if (error) return fail(500, "UPDATE_FAILED", "Could not update access");

  // Written by hand rather than by the audit trigger: the trigger records the
  // whole row, and the whole row of app_users includes the password hash.
  const { error: auditError } = await db.from("audit_log").insert({
    table_name: "app_users",
    record_id: userId,
    action: "UPDATE",
    actor_id: caller.id,
    before: { access_granted: user.access_granted },
    after: { access_granted: granted },
  });
  if (auditError) console.error("[audit] could not record an access change:", auditError.message);

  console.log(`[audit] ${caller.email} set access_granted=${granted} on ${userId}`);
  return json({ success: true, access_granted: granted });
}

/**
 * Fully deletes an account.
 *
 * The old client-side version deleted the profile and the role row but could
 * not touch auth.users, so the person could sign straight back in and get a
 * fresh profile from the signup trigger. Deleting the app_users row cascades
 * to profiles, user_roles and sessions, which is the whole account.
 */
export async function deleteUser(userId: string, caller: Caller): Promise<Response> {
  if (userId === caller.id) return fail(400, "CANNOT_DELETE_SELF", "You cannot delete your own account");

  const { data: user } = await db.from("app_users").select("email").eq("id", userId).maybeSingle();
  if (!user) return fail(404, "NOT_FOUND", "That user does not exist");

  // Contributions are kept and orphaned rather than deleted: removing a
  // spammer should not silently delete a hundred useful interview writeups.
  // They render as "Anonymous" once the author is gone.
  await Promise.all([
    db.from("interview_experiences").update({ user_id: null }).eq("user_id", userId),
    db.from("interview_questions").update({ user_id: null }).eq("user_id", userId),
  ]);

  const { error } = await db.from("app_users").delete().eq("id", userId);
  if (error) return fail(500, "DELETE_FAILED", "Could not delete the account");

  console.log(`[audit] ${caller.email} deleted user ${userId} (${user.email})`);
  return json({ success: true });
}

/**
 * Dashboard counts.
 *
 * These stay all-time on purpose - an admin looking at the dashboard wants to
 * know how big the archive is, not how this August is going. The one
 * season-scoped number is the company count for the season being viewed,
 * returned alongside rather than instead of the total.
 */
export async function stats(seasonId: string | undefined): Promise<Response> {
  // head: true means only the count comes back. The old version selected every
  // id just to call .length on it.
  const [companies, experiences, questions, users, pending, seasons, seasonCompanies] = await Promise.all([
    db.from("companies").select("id", { count: "exact", head: true }),
    db.from("interview_experiences").select("id", { count: "exact", head: true }),
    db.from("interview_questions").select("id", { count: "exact", head: true }),
    db.from("app_users").select("id", { count: "exact", head: true }),
    db.from("app_users").select("id", { count: "exact", head: true }).eq("access_granted", false),
    db.from("seasons").select("id", { count: "exact", head: true }),
    seasonId
      ? db.from("companies").select("id", { count: "exact", head: true }).eq("season_id", seasonId)
      : Promise.resolve({ count: null }),
  ]);

  return json({
    companies: companies.count ?? 0,
    experiences: experiences.count ?? 0,
    questions: questions.count ?? 0,
    users: users.count ?? 0,
    pending_access: pending.count ?? 0,
    seasons: seasons.count ?? 0,
    season_companies: seasonCompanies.count,
  });
}
