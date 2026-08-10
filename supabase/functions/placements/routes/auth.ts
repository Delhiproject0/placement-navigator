/**
 * Signup, signin, session refresh and password management.
 *
 * Password hashing and verification happen inside Postgres (pgcrypto bcrypt,
 * see the custom_auth migration). This layer never sees or stores a hash - it
 * calls app_signup / app_login and turns the result into tokens.
 */

import {
  ACCESS_TOKEN_TTL_SECONDS,
  JWT_SECRET,
  REFRESH_TOKEN_TTL_DAYS,
  db,
  getCaller,
  requireUser,
  type Caller,
  type Role,
} from "../context.ts";
import { generateRefreshToken, sha256, signJwt } from "../jwt.ts";
import { fail, isEmail, json, readJson, str } from "../http.ts";

interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
  created_at: string;
}

/** Everything the client is allowed to know about an account. */
function publicUser(user: AppUser, role: Role) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    email_verified: user.email_verified,
    created_at: user.created_at,
    role,
  };
}

async function roleFor(userId: string): Promise<Role> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return (data?.role as Role | undefined) ?? "viewer";
}

/** Issues an access/refresh pair and records the session. */
async function issueSession(user: AppUser, role: Role, req: Request) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signJwt(
    {
      sub: user.id,
      email: user.email,
      role,
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
    },
    JWT_SECRET,
  );

  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);

  const { error } = await db.from("auth_sessions").insert({
    user_id: user.id,
    refresh_token_hash: await sha256(refreshToken),
    expires_at: expiresAt.toISOString(),
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });
  if (error) throw error;

  return {
    user: publicUser(user, role),
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Postgres errors raised by the auth functions carry a stable marker in the
 * message. Anything unrecognised is reported as a generic failure rather than
 * echoed back, so internal detail never reaches the client.
 */
function mapPgError(message: string): Response | null {
  if (message.includes("EMAIL_TAKEN")) {
    return fail(409, "EMAIL_TAKEN", "An account with that email already exists");
  }
  if (message.includes("PASSWORD_TOO_SHORT")) {
    return fail(400, "WEAK_PASSWORD", "Password must be at least 8 characters");
  }
  if (message.includes("ACCOUNT_DISABLED")) {
    return fail(403, "ACCOUNT_DISABLED", "This account has been disabled");
  }
  if (message.includes("ACCOUNT_LOCKED")) {
    return fail(429, "ACCOUNT_LOCKED", "Too many failed attempts. Try again in 15 minutes.");
  }
  return null;
}

export async function handleSignup(req: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string; full_name?: string }>(req);
  const email = str(body?.email)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password : null;
  const fullName = str(body?.full_name);

  if (!email || !isEmail(email)) return fail(400, "INVALID_EMAIL", "Enter a valid email address");
  if (!password || password.length < 8) {
    return fail(400, "WEAK_PASSWORD", "Password must be at least 8 characters");
  }

  const { data, error } = await db.rpc("app_signup", {
    _email: email,
    _password: password,
    _full_name: fullName,
  });

  if (error) return mapPgError(error.message) ?? fail(500, "SIGNUP_FAILED", "Could not create the account");

  const user = data as AppUser | null;
  if (!user?.id) return fail(500, "SIGNUP_FAILED", "Could not create the account");
  return json(await issueSession(user, await roleFor(user.id), req), 201);
}

export async function handleLogin(req: Request): Promise<Response> {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = str(body?.email)?.toLowerCase();
  const password = typeof body?.password === "string" ? body.password : null;

  if (!email || !password) {
    return fail(400, "MISSING_CREDENTIALS", "Email and password are required");
  }

  const { data, error } = await db.rpc("app_login", { _email: email, _password: password });
  if (error) return mapPgError(error.message) ?? fail(500, "LOGIN_FAILED", "Could not sign you in");

  // A plpgsql function returning a composite type does not come back as null
  // when it returns NULL - PostgREST renders it as an object with every column
  // null, which is truthy. So the id is what has to be tested, or a failed
  // login proceeds to issue a session for user_id = null.
  //
  // One message for both "no such account" and "wrong password". Telling them
  // apart turns this endpoint into an account-enumeration oracle.
  const user = data as AppUser | null;
  if (!user?.id) return fail(401, "INVALID_CREDENTIALS", "Incorrect email or password");
  return json(await issueSession(user, await roleFor(user.id), req));
}

export async function handleRefresh(req: Request): Promise<Response> {
  const body = await readJson<{ refresh_token?: string }>(req);
  const refreshToken = str(body?.refresh_token);
  if (!refreshToken) return fail(400, "MISSING_TOKEN", "A refresh token is required");

  const hash = await sha256(refreshToken);
  const { data: session } = await db
    .from("auth_sessions")
    .select("id, user_id, expires_at, revoked_at")
    .eq("refresh_token_hash", hash)
    .maybeSingle();

  if (!session) return fail(401, "INVALID_TOKEN", "Session not found. Sign in again.");

  if (session.revoked_at) {
    // A revoked token being presented means it was captured, or the client
    // replayed a rotated one. Either way, end every session for that user.
    await db
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", session.user_id)
      .is("revoked_at", null);
    return fail(401, "TOKEN_REUSED", "Session expired. Sign in again.");
  }

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    return fail(401, "TOKEN_EXPIRED", "Session expired. Sign in again.");
  }

  const { data: user } = await db
    .from("app_users")
    .select("id, email, full_name, email_verified, created_at, is_active")
    .eq("id", session.user_id)
    .maybeSingle();

  if (!user?.is_active) return fail(403, "ACCOUNT_DISABLED", "This account has been disabled");

  const issued = await issueSession(user as AppUser, await roleFor(user.id), req);

  // Rotate: the presented token is spent, and points at its replacement so a
  // later replay is identifiable.
  const { data: replacement } = await db
    .from("auth_sessions")
    .select("id")
    .eq("refresh_token_hash", await sha256(issued.refresh_token))
    .maybeSingle();

  await db
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString(), replaced_by: replacement?.id ?? null })
    .eq("id", session.id);

  return json(issued);
}

export async function handleLogout(req: Request): Promise<Response> {
  const body = await readJson<{ refresh_token?: string; all?: boolean }>(req);
  const caller = await getCaller(req);

  if (body?.all && caller) {
    await db
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", caller.id)
      .is("revoked_at", null);
    return json({ success: true });
  }

  const refreshToken = str(body?.refresh_token);
  if (refreshToken) {
    await db
      .from("auth_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("refresh_token_hash", await sha256(refreshToken))
      .is("revoked_at", null);
  }

  // Always succeeds: signing out must never leave the client stuck holding a
  // token it thinks is still live.
  return json({ success: true });
}

export async function handleMe(caller: Caller): Promise<Response> {
  const [{ data: user }, { data: profile }] = await Promise.all([
    db
      .from("app_users")
      .select("id, email, full_name, email_verified, created_at")
      .eq("id", caller.id)
      .maybeSingle(),
    db.from("profiles").select("*").eq("user_id", caller.id).maybeSingle(),
  ]);

  if (!user) return fail(404, "NOT_FOUND", "Account not found");

  return json({ user: publicUser(user as AppUser, caller.role), profile: profile ?? null });
}

export async function handleChangePassword(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<{ current_password?: string; new_password?: string }>(req);
  const current = typeof body?.current_password === "string" ? body.current_password : null;
  const next = typeof body?.new_password === "string" ? body.new_password : null;

  if (!current || !next) return fail(400, "MISSING_FIELDS", "Both passwords are required");

  const { data, error } = await db.rpc("app_change_password", {
    _user_id: caller.id,
    _current_password: current,
    _new_password: next,
  });

  if (error) return mapPgError(error.message) ?? fail(500, "CHANGE_FAILED", "Could not change the password");
  if (!data) return fail(400, "INVALID_CREDENTIALS", "Your current password is incorrect");

  // Every session was revoked, including this one, so the client must sign in
  // again - which is the point.
  return json({ success: true, reauth_required: true });
}

export async function handleRequestReset(req: Request): Promise<Response> {
  const body = await readJson<{ email?: string }>(req);
  const email = str(body?.email)?.toLowerCase();
  if (!email || !isEmail(email)) return fail(400, "INVALID_EMAIL", "Enter a valid email address");

  const { data: user } = await db.from("app_users").select("id").eq("email", email).maybeSingle();

  // Always the same answer, whether or not the address exists - otherwise this
  // endpoint reveals who has an account.
  const genericResponse = json({
    success: true,
    message: "If that address has an account, a reset link is on its way.",
  });

  if (!user) return genericResponse;

  const token = generateRefreshToken();
  await db.from("password_resets").insert({
    user_id: user.id,
    token_hash: await sha256(token),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(), // 1 hour
  });

  // No SMTP is configured on this project yet, so there is nothing to send the
  // link with. Rather than pretend, the token is logged for an operator to
  // deliver by hand, and the response stays generic either way. Wire an email
  // provider and this becomes a real send - see DEVDOC.md.
  console.warn(`[password-reset] token for ${email}: ${token}`);

  return genericResponse;
}

export async function handleResetPassword(req: Request): Promise<Response> {
  const body = await readJson<{ token?: string; new_password?: string }>(req);
  const token = str(body?.token);
  const next = typeof body?.new_password === "string" ? body.new_password : null;

  if (!token || !next) return fail(400, "MISSING_FIELDS", "A token and a new password are required");

  const { data, error } = await db.rpc("app_reset_password", {
    _token_hash: await sha256(token),
    _new_password: next,
  });

  if (error) return mapPgError(error.message) ?? fail(500, "RESET_FAILED", "Could not reset the password");
  if (!data) return fail(400, "INVALID_TOKEN", "That reset link is invalid or has expired");

  return json({ success: true });
}

export { requireUser };
