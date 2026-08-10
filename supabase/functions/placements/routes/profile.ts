/** The signed-in user's own profile. */

import { db, type Caller } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

export async function getProfile(caller: Caller): Promise<Response> {
  const { data, error } = await db
    .from("profiles")
    .select("*")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (error) return fail(500, "QUERY_FAILED", "Could not load your profile");

  // The signup path creates this row, but an account migrated from an older
  // schema may predate it - so create it on demand rather than 404ing a user
  // out of their own profile page.
  if (!data) {
    const { data: created, error: insertError } = await db
      .from("profiles")
      .insert({ user_id: caller.id, email: caller.email })
      .select()
      .single();
    if (insertError) return fail(500, "CREATE_FAILED", "Could not create your profile");
    return json({ profile: created });
  }

  return json({ profile: data });
}

export async function updateProfile(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON body");

  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  if ("full_name" in body) {
    const fullName = str(body.full_name);
    if (fullName && fullName.length > 120) errors.full_name = "Keep your name under 120 characters";
    else values.full_name = fullName;
  }

  if ("avatar_url" in body) {
    const avatarUrl = str(body.avatar_url);
    if (avatarUrl) {
      try {
        const parsed = new URL(avatarUrl);
        if (parsed.protocol !== "https:") errors.avatar_url = "Avatar URLs must be https";
        else values.avatar_url = avatarUrl;
      } catch {
        errors.avatar_url = "That is not a valid URL";
      }
    } else {
      values.avatar_url = null;
    }
  }

  // email is intentionally not writable here: changing the address that
  // identifies the account belongs with a verification flow, not a profile
  // form. The column is a display copy of app_users.email.

  if (Object.keys(errors).length) return fail(422, "VALIDATION_FAILED", "Check the form", errors);
  if (!Object.keys(values).length) return fail(400, "NOTHING_TO_UPDATE", "No changes were supplied");

  const { data, error } = await db
    .from("profiles")
    .update(values)
    .eq("user_id", caller.id)
    .select()
    .maybeSingle();

  if (error) return fail(500, "UPDATE_FAILED", "Could not save your profile");

  // Keep the display name on the account in step with the profile.
  if ("full_name" in values) {
    await db.from("app_users").update({ full_name: values.full_name }).eq("id", caller.id);
  }

  return json({ profile: data });
}
