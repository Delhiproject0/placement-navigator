/**
 * Per-request identity and the service-role database client.
 *
 * With the API in front of the database, RLS is no longer what stops one
 * student reading another's data - the service-role key bypasses it entirely.
 * Authorization is therefore an explicit check on every route, and this module
 * is where the caller's identity comes from. Treat `requireUser` /
 * `requireEditor` / `requireAdmin` as mandatory, not optional.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verifyJwt, type AccessTokenClaims } from "./jwt.ts";
import { fail } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const JWT_SECRET = Deno.env.get("PLACEMENTS_JWT_SECRET") ?? "";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_DAYS = 30;

/**
 * Service-role client. Bypasses RLS by design - it is the only database
 * access in the system, and it must never be constructed from a value that
 * reached the browser.
 */
export const db: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Role = "admin" | "editor" | "viewer";

export interface Caller {
  id: string;
  email: string;
  role: Role;
}

/** The caller, or null when unauthenticated. Never throws. */
export async function getCaller(req: Request): Promise<Caller | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const claims: AccessTokenClaims | null = await verifyJwt(header.slice(7), JWT_SECRET);
  if (!claims) return null;

  // The role is re-read from the database rather than trusted from the token.
  // An access token lives an hour; without this, demoting an admin would not
  // take effect until their token expired.
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", claims.sub)
    .maybeSingle();
  if (error) return null;

  // An account disabled mid-session must stop working immediately.
  const { data: user } = await db
    .from("app_users")
    .select("is_active")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!user?.is_active) return null;

  return {
    id: claims.sub,
    email: claims.email,
    role: (data?.role as Role | undefined) ?? "viewer",
  };
}

export function requireUser(caller: Caller | null): Response | null {
  if (!caller) return fail(401, "UNAUTHENTICATED", "Sign in to continue");
  return null;
}

export function requireEditor(caller: Caller | null): Response | null {
  const unauth = requireUser(caller);
  if (unauth) return unauth;
  if (caller!.role !== "admin" && caller!.role !== "editor") {
    return fail(403, "FORBIDDEN", "You need editor access to do that");
  }
  return null;
}

export function requireAdmin(caller: Caller | null): Response | null {
  const unauth = requireUser(caller);
  if (unauth) return unauth;
  if (caller!.role !== "admin") {
    return fail(403, "FORBIDDEN", "You need admin access to do that");
  }
  return null;
}

/** Owner-or-moderator, the rule for editing an experience or a question. */
export function canMutateOwned(caller: Caller, ownerId: string | null): boolean {
  return caller.id === ownerId || caller.role === "admin" || caller.role === "editor";
}
