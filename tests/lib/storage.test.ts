import { describe, expect, it } from "vitest";
import {
  fileKindLabel,
  formatBytes,
  isAcceptedType,
  isPreviewable,
  storageFileName,
  validateFile,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

/**
 * The storage server validates uploads against exactly this pattern and does no
 * sanitizing of its own beyond it. A name that fails here is rejected by the
 * box; a name containing a slash would escape its category directory.
 */
const SERVER_SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;

function fakeFile(name: string, type = "application/pdf", size = 1024): File {
  const file = new File(["x".repeat(Math.min(size, 1024))], name, { type });
  // File size is read-only; the constructor content is capped for speed, so
  // the size under test is defined explicitly.
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("storageFileName", () => {
  const entityId = "11111111-2222-3333-4444-555555555555";

  it("produces a name the storage server will accept", () => {
    const name = storageFileName(fakeFile("Offer Letter.pdf"), "company", entityId);
    expect(name).toMatch(SERVER_SAFE_FILENAME);
  });

  it("strips characters that would break out of the directory", () => {
    const hostile = fakeFile("../../etc/passwd");
    const name = storageFileName(hostile, "company", entityId);
    expect(name).toMatch(SERVER_SAFE_FILENAME);
    expect(name).not.toContain("/");
    expect(name.includes("..")).toBe(false);
  });

  it("survives unicode, spaces and punctuation", () => {
    for (const original of [
      "résumé final (v2).pdf",
      "问题集.pdf",
      "OA paper — 2026.docx",
      "a b\tc\nd.txt",
      "100% offer!.pdf",
    ]) {
      const name = storageFileName(fakeFile(original), "experience", entityId);
      expect(name, `failed for ${original}`).toMatch(SERVER_SAFE_FILENAME);
    }
  });

  it("keeps the scope prefix so a flat namespace stays attributable", () => {
    const name = storageFileName(fakeFile("jd.pdf"), "company", entityId);
    expect(name.startsWith(`company-${entityId}-`)).toBe(true);
  });

  it("is unique per call, so two uploads of the same file do not collide", () => {
    const file = fakeFile("jd.pdf");
    expect(storageFileName(file, "company", entityId)).not.toBe(
      storageFileName(file, "company", entityId),
    );
  });

  it("caps a very long original name", () => {
    const name = storageFileName(fakeFile(`${"a".repeat(400)}.pdf`), "company", entityId);
    expect(name.length).toBeLessThan(200);
    expect(name).toMatch(SERVER_SAFE_FILENAME);
  });
});

describe("validateFile", () => {
  it("accepts an ordinary PDF", () => {
    expect(validateFile(fakeFile("jd.pdf", "application/pdf", 500_000))).toBeNull();
  });

  it("rejects an empty file", () => {
    expect(validateFile(fakeFile("empty.pdf", "application/pdf", 0))).toMatch(/empty/i);
  });

  it("rejects a file over the limit the server also enforces", () => {
    expect(validateFile(fakeFile("big.pdf", "application/pdf", MAX_UPLOAD_BYTES + 1))).toMatch(/10MB/);
    expect(validateFile(fakeFile("edge.pdf", "application/pdf", MAX_UPLOAD_BYTES))).toBeNull();
  });

  it("rejects executable and unknown types", () => {
    expect(validateFile(fakeFile("payload.exe", "application/x-msdownload", 100))).toBeTruthy();
    expect(validateFile(fakeFile("script.sh", "application/x-sh", 100))).toBeTruthy();
  });
});

describe("type helpers", () => {
  it("accepts the documented image and document types", () => {
    expect(isAcceptedType("image/png")).toBe(true);
    expect(isAcceptedType("application/pdf")).toBe(true);
    expect(isAcceptedType("text/csv")).toBe(true);
    expect(isAcceptedType("application/zip")).toBe(false);
  });

  it("only claims to preview what the browser can actually render", () => {
    expect(isPreviewable("image/png")).toBe(true);
    expect(isPreviewable("application/pdf")).toBe(true);
    expect(isPreviewable("application/msword")).toBe(false);
    expect(isPreviewable(null)).toBe(false);
  });

  it("labels kinds readably", () => {
    expect(fileKindLabel("image/jpeg")).toBe("Image");
    expect(fileKindLabel("application/pdf")).toBe("PDF");
    expect(fileKindLabel(null)).toBe("File");
  });
});

describe("formatBytes", () => {
  it("scales the unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("returns nothing for an absent size rather than '0 B'", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(undefined)).toBe("");
  });
});
