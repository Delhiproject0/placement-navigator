/**
 * Per-request identity and the service-role database client.
 *
 * With the API in front of the database, RLS is no longer what stops one
 * student reading another's data - the service-role key bypasses it entirely.
 * Authorization is therefore an explicit check on every route, and this module
 * is where the caller's identity comes from. Treat `requireUser` /
 * `requireEditor` / `requireAdmin` as mandatory, not optional.
 *
 * Being signed in is not enough to read anything. The site is internal to the
 * institute, so an admin grants access per account (`app_users.access_granted`)
 * and `requireAccess` is what every content route sits behind.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verifyJwt, type AccessTokenClaims } from "./jwt.ts";
import { fail } from "./http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const JWT_SECRET = Deno.env.get("PLACEMENTS_JWT_SECRET") ?? "";

// Fail at boot, not at the first login.
//
// An unset secret used to reach Web Crypto as a zero-length HMAC key, which
// throws `DataError: Key length is zero` deep inside signJwt and surfaces as a
// bare 500 on /auth/login. Every account looks broken and nothing in the
// response says why. This says why, once, at startup.
if (!JWT_SECRET) {
  throw new Error(
    "PLACEMENTS_JWT_SECRET is not set. Set it with `supabase secrets set` for a " +
      "deployed function, or in supabase/functions/.env when serving locally.",
  );
}
if (JWT_SECRET.length < 32) {
  console.warn(
    `PLACEMENTS_JWT_SECRET is ${JWT_SECRET.length} characters. HS256 keys should be at least 32.`,
  );
}

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

/**
 * A client that tags its requests with the acting user.
 *
 * Every connection authenticates as the same service role, so the audit
 * triggers cannot tell who is behind a write. PostgREST surfaces the request
 * headers to SQL, so the actor rides along in one - which keeps attribution
 * working without the routes having to remember to write audit rows.
 */
export function dbAs(caller: Caller): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-actor-id": caller.id } },
  });
}

export type Role = "admin" | "editor" | "viewer";

export interface Caller {
  id: string;
  email: string;
  role: Role;
  /**
   * Whether an admin has let this account in. Admins always count as granted:
   * the first admin is made by hand in SQL, and a flag they forgot to set on
   * themselves would lock the only person able to grant it out of the site.
   */
  hasAccess: boolean;
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
    .select("is_active, access_granted")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!user?.is_active) return null;

  const role = (data?.role as Role | undefined) ?? "viewer";

  return {
    id: claims.sub,
    email: claims.email,
    role,
    // Read here, per request, for the same reason as the role: revoking access
    // has to bite on the next request, not when the token expires.
    hasAccess: role === "admin" || user.access_granted === true,
  };
}

export function requireUser(caller: Caller | null): Response | null {
  if (!caller) return fail(401, "UNAUTHENTICATED", "Sign in to continue");
  return null;
}

/**
 * Signed in *and* let in by an admin.
 *
 * 403 rather than 401 on purpose: the client treats a 401 as a dead session
 * and throws the tokens away, which would sign a waiting student out every
 * time they loaded a page and hide the explanation they need to see.
 */
export function requireAccess(caller: Caller | null): Response | null {
  const unauth = requireUser(caller);
  if (unauth) return unauth;
  if (!caller!.hasAccess) {
    return fail(
      403,
      "ACCESS_PENDING",
      "Your account has not been given access yet. An admin has to approve it.",
    );
  }
  return null;
}

export function requireEditor(caller: Caller | null): Response | null {
  const unauth = requireAccess(caller);
  if (unauth) return unauth;
  if (caller!.role !== "admin" && caller!.role !== "editor") {
    return fail(403, "FORBIDDEN", "You need editor access to do that");
  }
  return null;
}

export function requireAdmin(caller: Caller | null): Response | null {
  const unauth = requireAccess(caller);
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
