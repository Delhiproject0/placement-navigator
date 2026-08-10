/** Request/response helpers shared by every route. */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-file-name, x-file-type, x-entity-type, x-entity-id, apikey",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

/**
 * An error shape the client can branch on. `code` is stable and machine
 * readable; `message` is for humans and may change.
 */
export function fail(status: number, code: string, message: string, details?: unknown) {
  return json({ error: { code, message, details } }, status);
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Trimmed string, or null for absent/blank. */
export function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function isEmail(value: string): boolean {
  // Deliberately permissive: the only authoritative test of an address is
  // sending mail to it, and over-strict patterns reject valid addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}
