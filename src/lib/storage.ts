/**
 * File uploads.
 *
 * The browser sends raw bytes to our own API, which forwards them to the
 * storage host. It never talks to the storage host directly - the credential
 * for that must not exist in a JS bundle.
 */

import { API_BASE, ApiError, tokens } from "@/lib/api";

const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
export const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "text/markdown",
];

export type EntityType = "company" | "experience" | "question" | "profile";

/**
 * The storage server writes with `dir + "/" + fileName` and validates only
 * against `^[a-zA-Z0-9._-]+$`. A name containing a slash would escape its
 * directory, so scope is folded into a flat name rather than a path, and every
 * other character is replaced.
 */
export function storageFileName(file: File, entityType: EntityType, entityId: string): string {
  const safeOriginal = file.name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    // Collapse dot runs. Replacing separators alone turns "../../etc/passwd"
    // into ".._.._etc_passwd", which still carries "..". It cannot traverse
    // without a separator, and the scope prefix below means the name never
    // starts with a dot - but the storage server's upload branch checks only
    // the character class (its delete branch does check for ".."), so not
    // emitting the sequence at all is the cheaper side of that asymmetry.
    .replace(/\.{2,}/g, ".")
    .slice(-80);
  return `${entityType}-${entityId}-${crypto.randomUUID()}-${safeOriginal}`;
}

export function isAcceptedType(type: string): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(type) || ACCEPTED_DOCUMENT_TYPES.includes(type);
}

/** A local check before spending the upload; the API enforces the same rules. */
export function validateFile(file: File): string | null {
  if (file.size === 0) return "That file is empty";
  if (file.size > MAX_UPLOAD_BYTES) return "Files must be 10MB or smaller";
  if (!isAcceptedType(file.type)) {
    return "Only images, PDFs, Office documents and plain text are accepted";
  }
  return null;
}

export interface UploadedAttachment {
  id: string;
  url: string;
  storage_file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
}

/**
 * Uploads one file, reporting progress 0..1.
 *
 * XMLHttpRequest rather than fetch: fetch still has no upload progress event,
 * and a 10MB PDF over campus wifi without a progress bar looks like a hang.
 */
export function uploadFile(
  file: File,
  entityType: EntityType,
  entityId: string,
  onProgress?: (fraction: number) => void,
): Promise<UploadedAttachment> {
  const fileName = storageFileName(file, entityType, entityId);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_BASE}/upload`);

    request.setRequestHeader("apikey", ANON_KEY);
    const token = tokens.access();
    if (token) request.setRequestHeader("authorization", `Bearer ${token}`);
    request.setRequestHeader("content-type", file.type || "application/octet-stream");
    request.setRequestHeader("x-file-name", fileName);
    request.setRequestHeader("x-entity-type", entityType);
    request.setRequestHeader("x-entity-id", entityId);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };

    request.onload = () => {
      let body: { attachment?: UploadedAttachment; error?: { code: string; message: string } } = {};
      try {
        body = JSON.parse(request.responseText);
      } catch {
        // Fall through to the generic error below.
      }

      if (request.status >= 200 && request.status < 300 && body.attachment) {
        onProgress?.(1);
        resolve(body.attachment);
        return;
      }

      reject(
        new ApiError(
          request.status,
          body.error?.code ?? "UPLOAD_FAILED",
          body.error?.message ?? "The upload failed",
        ),
      );
    };

    request.onerror = () =>
      reject(new ApiError(0, "NETWORK", "Could not reach the server. Check your connection."));
    request.onabort = () => reject(new ApiError(0, "ABORTED", "Upload cancelled"));

    request.send(file);
  });
}

// --- display helpers -------------------------------------------------------

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImage(mimeType: string | null | undefined): boolean {
  return Boolean(mimeType && mimeType.startsWith("image/"));
}

export function isPdf(mimeType: string | null | undefined): boolean {
  return mimeType === "application/pdf";
}

/** Renderable in the browser without downloading. */
export function isPreviewable(mimeType: string | null | undefined): boolean {
  return isImage(mimeType) || isPdf(mimeType);
}

export function fileKindLabel(mimeType: string | null | undefined): string {
  if (!mimeType) return "File";
  if (isImage(mimeType)) return "Image";
  if (isPdf(mimeType)) return "PDF";
  if (mimeType.includes("word")) return "Word";
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return "Sheet";
  if (mimeType.startsWith("text/")) return "Text";
  return "File";
}
