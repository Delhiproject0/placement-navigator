/**
 * File storage proxy to the self-hosted CDN.
 *
 * Same contract as workos and portfolio: raw bytes, metadata in headers, and a
 * short-lived admin JWT minted here. The storage secret must never reach the
 * browser, which is the entire reason this hop exists rather than the client
 * uploading directly.
 *
 * Upload host and read host are different:
 *   supabase.dileepadari.dev  accepts uploads
 *   mystorage.dileepadari.dev serves them
 */

import { db, type Caller } from "../context.ts";
import { signJwt } from "../jwt.ts";
import { fail, json, str } from "../http.ts";

const UPLOAD_BASE_URL = Deno.env.get("ORACLE_UPLOAD_BASE_URL") ?? "https://supabase.dileepadari.dev";
const UPLOAD_PATH = Deno.env.get("ORACLE_UPLOAD_PATH") ?? "/functions/v1/upload";
const PUBLIC_BASE_URL = Deno.env.get("ORACLE_PUBLIC_BASE_URL") ?? "https://mystorage.dileepadari.dev";
const APP_NAME = Deno.env.get("ORACLE_APP_NAME") ?? "placements";
const SELFHOST_JWT_SECRET = Deno.env.get("SELFHOST_JWT_SECRET") ?? "";

/**
 * Matches the storage server's own validation exactly. It writes with
 * `Deno.writeFile(dir + "/" + fileName)` and does no sanitising beyond this,
 * so a name containing a slash would escape the category directory.
 */
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

const MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

const ENTITY_TYPES = new Set(["company", "experience", "question", "profile"]);

/** 60-second admin token for one call. Short because it crosses a host. */
async function storageAuthHeader(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return `Bearer ${await signJwt({ is_admin: true, iat: now, exp: now + 60 }, SELFHOST_JWT_SECRET)}`;
}

/**
 * The upload endpoint returns a URL whose host is wrong, so only its path is
 * used and the host always comes from ORACLE_PUBLIC_BASE_URL.
 */
function publicUrlFor(fileName: string, folder: string, returned: unknown): string {
  let path = `/${folder}/${APP_NAME}/${fileName}`;
  if (typeof returned === "string" && returned) {
    try {
      path = new URL(returned).pathname;
    } catch {
      if (returned.startsWith("/")) path = returned;
    }
  }
  return `${PUBLIC_BASE_URL.replace(/\/+$/, "")}${path}`;
}

export async function handleUpload(req: Request, caller: Caller): Promise<Response> {
  if (!SELFHOST_JWT_SECRET) {
    return fail(500, "STORAGE_NOT_CONFIGURED", "SELFHOST_JWT_SECRET is not set on this function");
  }

  const fileName = req.headers.get("x-file-name");
  const entityType = req.headers.get("x-entity-type") ?? "";
  const entityId = req.headers.get("x-entity-id") ?? "";
  const contentType = req.headers.get("content-type") ?? "application/octet-stream";

  if (!fileName || !SAFE_FILENAME.test(fileName) || fileName.includes("..")) {
    return fail(400, "INVALID_FILENAME", "Invalid file name");
  }
  if (!ENTITY_TYPES.has(entityType)) {
    return fail(400, "INVALID_ENTITY", `x-entity-type must be one of: ${[...ENTITY_TYPES].join(", ")}`);
  }

  const isImage = IMAGE_TYPES.has(contentType);
  const isDocument = DOCUMENT_TYPES.has(contentType);
  if (!isImage && !isDocument) {
    return fail(415, "UNSUPPORTED_TYPE", `${contentType} is not an accepted file type`);
  }
  const folder = isImage ? "images" : "documents";

  // Only a moderator may attach files to a company; anyone signed in may
  // attach to their own profile or their own contribution.
  if (entityType === "company" && caller.role !== "admin" && caller.role !== "editor") {
    return fail(403, "FORBIDDEN", "You need editor access to attach files to a company");
  }
  if (entityType === "experience" || entityType === "question") {
    const table = entityType === "experience" ? "interview_experiences" : "interview_questions";
    const { data: owner } = await db.from(table).select("user_id").eq("id", entityId).maybeSingle();
    if (!owner) return fail(404, "NOT_FOUND", "That entry does not exist");
    if (owner.user_id !== caller.id && caller.role !== "admin" && caller.role !== "editor") {
      return fail(403, "FORBIDDEN", "You can only attach files to your own contributions");
    }
  }

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) return fail(400, "EMPTY_FILE", "The file is empty");
  if (bytes.byteLength > MAX_BYTES) return fail(413, "FILE_TOO_LARGE", "Files must be 10MB or smaller");

  const uploadResponse = await fetch(`${UPLOAD_BASE_URL.replace(/\/+$/, "")}${UPLOAD_PATH}`, {
    method: "POST",
    headers: {
      Authorization: await storageAuthHeader(),
      "x-app-name": APP_NAME,
      "x-file-name": fileName,
      "x-file-type": folder,
    },
    body: bytes,
  });

  const result = await uploadResponse.json().catch(() => ({}));
  if (!uploadResponse.ok || !result.success) {
    return fail(502, "UPLOAD_FAILED", result.error ?? "The storage server rejected the upload");
  }

  const url = publicUrlFor(fileName, folder, result.url);

  const { data: attachment, error } = await db
    .from("attachments")
    .insert({
      entity_type: entityType,
      entity_id: entityId || null,
      url,
      storage_file_name: fileName,
      mime_type: contentType,
      size_bytes: bytes.byteLength,
      uploaded_by: caller.id,
    })
    .select()
    .single();

  if (error) {
    // The bytes are already on disk. Without this the file would be orphaned
    // there with nothing in the database pointing at it, and no list endpoint
    // to ever find it again.
    await deleteFromStorage(fileName, folder).catch(() => {});
    return fail(500, "METADATA_FAILED", "Upload succeeded but could not be recorded, so it was rolled back");
  }

  return json({ attachment }, 201);
}

async function deleteFromStorage(fileName: string, folder: string): Promise<boolean> {
  const response = await fetch(`${UPLOAD_BASE_URL.replace(/\/+$/, "")}${UPLOAD_PATH}`, {
    method: "DELETE",
    headers: {
      Authorization: await storageAuthHeader(),
      "x-app-name": APP_NAME,
      "x-file-name": fileName,
      "x-file-type": folder,
    },
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result.success === true;
}

export async function handleDeleteFile(url: URL, caller: Caller): Promise<Response> {
  const id = str(url.searchParams.get("id"));
  if (!id) return fail(400, "MISSING_ID", "An attachment id is required");

  const { data: attachment } = await db
    .from("attachments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!attachment) return fail(404, "NOT_FOUND", "That attachment does not exist");

  if (
    attachment.uploaded_by !== caller.id &&
    caller.role !== "admin" &&
    caller.role !== "editor"
  ) {
    return fail(403, "FORBIDDEN", "You can only delete your own uploads");
  }

  // Origin comparison, not startsWith - "mystorage.dileepadari.dev.evil.com"
  // passes a prefix test.
  let folder = "images";
  try {
    const parsed = new URL(attachment.url);
    if (parsed.origin !== new URL(PUBLIC_BASE_URL).origin) {
      return fail(400, "FOREIGN_URL", "That file is not on the storage host");
    }
    folder = parsed.pathname.split("/").filter(Boolean)[0] ?? "images";
  } catch {
    return fail(400, "INVALID_URL", "The stored URL is malformed");
  }

  // Blob first, then the row. The other order can lose the only pointer to a
  // file that still exists.
  await deleteFromStorage(attachment.storage_file_name, folder);
  const { error } = await db.from("attachments").delete().eq("id", id);
  if (error) return fail(500, "DELETE_FAILED", "Could not remove the attachment record");

  return json({ success: true });
}

export async function listAttachments(url: URL): Promise<Response> {
  const entityType = str(url.searchParams.get("entity_type"));
  const entityId = str(url.searchParams.get("entity_id"));
  if (!entityType || !entityId) return fail(400, "MISSING_PARAMS", "entity_type and entity_id are required");

  const { data, error } = await db
    .from("attachments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (error) return fail(500, "QUERY_FAILED", "Could not load attachments");
  return json({ attachments: data ?? [] });
}

/**
 * Read-through proxy for text content.
 *
 * The CDN sends no CORS headers, so a browser can render a file in an <img> or
 * an <iframe> but cannot fetch() its contents. Anything that needs the text -
 * a CSV preview, a plain-text viewer - has to come through here.
 */
export async function handleFileText(url: URL): Promise<Response> {
  const target = str(url.searchParams.get("url"));
  if (!target) return fail(400, "MISSING_URL", "A url is required");

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return fail(400, "INVALID_URL", "That is not a valid URL");
  }
  if (parsed.origin !== new URL(PUBLIC_BASE_URL).origin) {
    return fail(403, "FOREIGN_URL", "Refusing to fetch a URL outside the storage host");
  }

  const response = await fetch(parsed.toString());
  if (!response.ok) return fail(502, "FETCH_FAILED", `The storage host returned ${response.status}`);

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > 2 * 1024 * 1024) return fail(413, "TOO_LARGE", "That file is too large to preview");

  const text = await response.text();
  return json({ text: text.slice(0, 2 * 1024 * 1024) });
}
