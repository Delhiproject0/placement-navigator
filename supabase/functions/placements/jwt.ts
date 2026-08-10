/**
 * Minimal HS256 JWT sign/verify on Web Crypto.
 *
 * These tokens are ours, not Supabase's: PostgREST never sees them, so they
 * are signed with PLACEMENTS_JWT_SECRET rather than the project's JWT secret.
 * That is deliberate - the project secret can mint a `service_role` token, and
 * nothing that only needs to identify a student should be able to do that.
 */

const encoder = new TextEncoder();

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  iat: number;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Backed by an explicitly allocated ArrayBuffer. `Uint8Array.from` yields
// Uint8Array<ArrayBufferLike>, which crypto.subtle.verify rejects because
// ArrayBufferLike also admits SharedArrayBuffer.
function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), encoder.encode(data));
  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Returns the claims, or null for anything wrong: bad shape, bad signature,
 * expired. Callers must not distinguish between those cases to the client.
 */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<AccessTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, ["verify"]),
      base64UrlDecode(signature),
      encoder.encode(`${header}.${body}`),
    );
  } catch {
    return null;
  }
  // Signature is checked before the payload is parsed, so an attacker-supplied
  // body is never interpreted.
  if (!valid) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as AccessTokenClaims;
    if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;
    if (typeof claims.sub !== "string" || !claims.sub) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Opaque refresh token. 32 random bytes, stored only as a SHA-256 digest. */
export function generateRefreshToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
