/**
 * Narrowing helpers for caught values.
 *
 * `catch (e)` gives you `unknown`, and the codebase previously worked around
 * that by annotating every catch as `any` and reading `.message` off it. That
 * silently produces "undefined" in a toast whenever something non-Error is
 * thrown - which Supabase does, since PostgrestError is a plain object.
 */

/** Supabase returns plain objects, not Error instances, for API failures. */
interface MessageLike {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

function hasMessage(value: unknown): value is MessageLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/** A human-readable message for any caught value, with a sane fallback. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof Error) return error.message || fallback;
  if (hasMessage(error)) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

/**
 * PostgREST error code, when there is one. Useful for distinguishing an RLS
 * refusal (42501) or a missing column (PGRST204) from a network blip.
 */
export function errorCode(error: unknown): string | null {
  if (hasMessage(error) && typeof error.code === "string") return error.code;
  return null;
}

/** True for the auth failures that should not be retried. */
export function isAuthError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "42501" || code === "PGRST301" || code === "401";
}
