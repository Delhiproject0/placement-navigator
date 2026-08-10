/** User administration and site statistics. Admin only. */

import { db, type Caller, type Role } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

const ROLES = new Set<Role>(["admin", "editor", "viewer"]);

export async function listUsers(url: URL): Promise<Response> {
  const search = str(url.searchParams.get("q"));
  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
  const perPage = Math.min(Number(url.searchParams.get("per_page")) || 25, 100);
  const from = (page - 1) * perPage;

  let query = db
    .from("app_users")
    .select("id, email, full_name, is_active, email_verified, last_login_at, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);

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
  const { error } = await db
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id" });

  if (error) return fail(500, "UPDATE_FAILED", "Could not change the role");

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

export async function stats(): Promise<Response> {
  // head: true means only the count comes back. The old version selected every
  // id just to call .length on it.
  const [companies, experiences, questions, users] = await Promise.all([
    db.from("companies").select("id", { count: "exact", head: true }),
    db.from("interview_experiences").select("id", { count: "exact", head: true }),
    db.from("interview_questions").select("id", { count: "exact", head: true }),
    db.from("app_users").select("id", { count: "exact", head: true }),
  ]);

  return json({
    companies: companies.count ?? 0,
    experiences: experiences.count ?? 0,
    questions: questions.count ?? 0,
    users: users.count ?? 0,
  });
}
