/**
 * Upload authorization.
 *
 * This is the branch that decides whether one student can attach files to
 * another student's writeup, and nothing covered it before - the only upload
 * tests were client-side filename and MIME checks, which a caller with a
 * scripted request never runs.
 *
 * Every assertion here is a *rejection*. That is deliberate rather than a gap:
 * in `handleUpload` all the validation and authorization returns happen before
 * the outbound request to the storage box, so these run without writing a
 * single byte to a server shared with the other projects. The success path is
 * verified by hand against production, because doing it here would litter that
 * box on every `npm test`.
 *
 * Skipped automatically when the stack is not running.
 */

import { describe, expect, it } from "vitest";

const API = process.env.PLACEMENTS_API_URL ?? "http://127.0.0.1:54321/functions/v1/placements";
const SEED_PASSWORD = "placement123";

const stackUp = await (async () => {
  try {
    const response = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
})();

if (!stackUp) console.warn(`\n  Skipping upload tests: no stack at ${API}.\n`);

/**
 * The body is deliberately empty.
 *
 * Every assertion below is on a check that runs before `req.arrayBuffer()`, so
 * an empty body changes none of them. What it does change is the blast radius
 * when one of these checks regresses: with real bytes the request would sail
 * past the broken check and write a file to the storage box shared with the
 * other projects, which is a poor thing for a test suite to do on the way to
 * reporting a failure. Empty, it stops at `EMPTY_FILE` instead - still a loud
 * failure, but a local one. (Verified by disabling the ownership check: with
 * bytes the request returned 201 and left a file behind; empty it returns 400.)
 */
async function upload(
  headers: Record<string, string>,
  token?: string,
  body: BodyInit = new Uint8Array(),
) {
  const h = new Headers({ "content-type": "application/pdf", ...headers });
  if (token) h.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${API}/upload`, { method: "POST", headers: h, body });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed as { error?: { code: string } } };
}

async function login(email: string, password = SEED_PASSWORD): Promise<string> {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/** An experience written by the seeded student, plus its company. */
async function seededExperience(): Promise<{ id: string }> {
  const list = await fetch(`${API}/companies?season=all`).then(
    (r) => r.json() as Promise<{ companies: Array<{ id: string; name: string }> }>,
  );
  for (const company of list.companies) {
    const { items } = (await fetch(`${API}/companies/${company.id}/experiences`).then((r) =>
      r.json(),
    )) as { items: Array<{ id: string }> };
    if (items?.length) return items[0];
  }
  throw new Error("no seeded experience found");
}

const COMPANY_HEADERS = {
  "x-file-name": "test.pdf",
  "x-entity-type": "company",
  "x-entity-id": "00000000-0000-0000-0000-000000000000",
};

describe.runIf(!process.env.SKIP_API_TESTS)("upload authorization", () => {
  it.runIf(stackUp)("refuses an anonymous upload", async () => {
    const { status } = await upload(COMPANY_HEADERS);
    expect(status).toBe(401);
  });

  it.runIf(stackUp)("refuses a viewer attaching a file to a company", async () => {
    // Company documents are official-looking; only a moderator may post them.
    const token = await login("student@iiit.ac.in");
    const { status, body } = await upload(COMPANY_HEADERS, token);
    expect(status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it.runIf(stackUp)("refuses a viewer attaching to someone else's experience", async () => {
    // The whole point of the ownership branch: a second student must not be
    // able to bolt a file onto a writeup they did not author.
    const experience = await seededExperience();

    const email = `upload-probe-${Date.now()}@iiit.ac.in`;
    const signup = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: SEED_PASSWORD }),
    });
    expect(signup.status).toBe(201);
    const { access_token } = (await signup.json()) as { access_token: string };

    const { status, body } = await upload(
      {
        "x-file-name": "test.pdf",
        "x-entity-type": "experience",
        "x-entity-id": experience.id,
      },
      access_token,
    );

    expect(status).toBe(403);
    expect(body.error?.code).toBe("FORBIDDEN");
  });

  it.runIf(stackUp)("404s for an experience that does not exist", async () => {
    const token = await login("student@iiit.ac.in");
    const { status, body } = await upload(
      {
        "x-file-name": "test.pdf",
        "x-entity-type": "experience",
        "x-entity-id": "00000000-0000-0000-0000-000000000000",
      },
      token,
    );
    expect(status).toBe(404);
    expect(body.error?.code).toBe("NOT_FOUND");
  });

  it.runIf(stackUp)("rejects a filename that would escape the category directory", async () => {
    // The storage box writes with `dir + "/" + fileName` and sanitises nothing
    // beyond its own regex, so a slash or a `..` here is a path traversal.
    const token = await login("editor@iiit.ac.in");
    for (const name of ["../escape.pdf", "nested/path.pdf", "..", "with space.pdf"]) {
      const { status, body } = await upload({ ...COMPANY_HEADERS, "x-file-name": name }, token);
      expect(status, `${name} should be rejected`).toBe(400);
      expect(body.error?.code).toBe("INVALID_FILENAME");
    }
  });

  it.runIf(stackUp)("rejects an unknown entity type", async () => {
    const token = await login("editor@iiit.ac.in");
    const { status, body } = await upload(
      { ...COMPANY_HEADERS, "x-entity-type": "invoice" },
      token,
    );
    expect(status).toBe(400);
    expect(body.error?.code).toBe("INVALID_ENTITY");
  });

  it.runIf(stackUp)("rejects a content type that is neither an image nor a document", async () => {
    const token = await login("editor@iiit.ac.in");
    const { status, body } = await upload(
      { ...COMPANY_HEADERS, "content-type": "application/x-msdownload" },
      token,
    );
    expect(status).toBe(415);
    expect(body.error?.code).toBe("UNSUPPORTED_TYPE");
  });
});
