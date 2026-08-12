/**
 * API integration tests against a real local stack.
 *
 * These run against `supabase start` + `supabase functions serve`, not mocks -
 * the things most worth testing here are the boundary between the function and
 * Postgres (grants, composite-null handling, bcrypt) and the authorization
 * checks that replaced row-level security. A mock would assert my assumptions
 * back at me and miss exactly those.
 *
 * Skipped automatically when the stack is not running, so `npm test` still
 * works without Docker.
 */

import { describe, expect, it } from "vitest";

const API = process.env.PLACEMENTS_API_URL ?? "http://127.0.0.1:54321/functions/v1/placements";
const SEED_PASSWORD = "placement123";

/**
 * Probed at module scope, not in beforeAll: `it.runIf(...)` is evaluated while
 * tests are being collected, which happens before any hook runs. Setting this
 * in beforeAll would leave it false and silently skip the entire suite.
 */
const stackUp = await (async () => {
  try {
    const response = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
})();

if (!stackUp) {
  console.warn(
    `\n  Skipping API tests: no stack at ${API}.` +
      `\n  Run: npx supabase start && npx supabase functions serve\n`,
  );
}

async function api(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body: body as Record<string, never> };
}

async function login(email: string, password = SEED_PASSWORD) {
  const { body } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return body as unknown as { access_token: string; refresh_token: string; user: { id: string; role: string } };
}

describe.runIf(!process.env.SKIP_API_TESTS)("auth", () => {
  it.runIf(stackUp)("signs a seeded user in and returns a usable token", async () => {
    const session = await login("admin@iiit.ac.in");
    expect(session.access_token).toBeTruthy();
    expect(session.refresh_token).toBeTruthy();
    expect(session.user.role).toBe("admin");

    const me = await api("/auth/me", {}, session.access_token);
    expect(me.status).toBe(200);
  });

  it.runIf(stackUp)("treats email as case-insensitive", async () => {
    const { status } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ADMIN@IIIT.AC.IN", password: SEED_PASSWORD }),
    });
    expect(status).toBe(200);
  });

  it.runIf(stackUp)("gives the same answer for a wrong password and an unknown account", async () => {
    // Different responses here would make this endpoint an account-enumeration
    // oracle: anyone could discover which addresses are registered.
    const wrongPassword = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@iiit.ac.in", password: "definitely-wrong" }),
    });
    const unknownAccount = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "nobody-here@iiit.ac.in", password: "definitely-wrong" }),
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownAccount.body);
  });

  it.runIf(stackUp)("rejects a weak password at signup", async () => {
    const { status, body } = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: `weak-${Date.now()}@iiit.ac.in`, password: "short" }),
    });
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe("WEAK_PASSWORD");
  });

  it.runIf(stackUp)("rejects a duplicate email regardless of case", async () => {
    const email = `dupe-${Date.now()}@iiit.ac.in`;
    const first = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password: SEED_PASSWORD }),
    });
    expect(first.status).toBe(201);

    const second = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: email.toUpperCase(), password: SEED_PASSWORD }),
    });
    expect(second.status).toBe(409);
  });

  it.runIf(stackUp)("rotates refresh tokens and kills every session on reuse", async () => {
    const email = `rotate-${Date.now()}@iiit.ac.in`;
    const signup = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password: SEED_PASSWORD }),
    });
    const first = (signup.body as unknown as { refresh_token: string }).refresh_token;

    const refreshed = await api("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: first }),
    });
    expect(refreshed.status).toBe(200);
    const second = (refreshed.body as unknown as { refresh_token: string }).refresh_token;
    expect(second).not.toBe(first);

    // Replaying the spent token means it was captured. The correct response is
    // to end every session for that user, not just refuse this one.
    const replay = await api("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: first }),
    });
    expect(replay.status).toBe(401);

    const afterAlarm = await api("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: second }),
    });
    expect(afterAlarm.status).toBe(401);
  });

  it.runIf(stackUp)("rejects a token signed with the wrong secret", async () => {
    const encode = (value: object) =>
      btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const now = Math.floor(Date.now() / 1000);
    const forged = [
      encode({ alg: "HS256", typ: "JWT" }),
      encode({ sub: crypto.randomUUID(), email: "x@x.com", role: "admin", iat: now, exp: now + 3600 }),
      "not-a-real-signature",
    ].join(".");

    const { status } = await api("/admin/users", {}, forged);
    expect(status).toBe(401);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("authorization", () => {
  it.runIf(stackUp)("enforces the role ladder on company writes", async () => {
    const admin = await login("admin@iiit.ac.in");
    const editor = await login("editor@iiit.ac.in");
    const student = await login("student@iiit.ac.in");

    const payload = JSON.stringify({ name: `Test Co ${Date.now()}` });

    expect((await api("/companies", { method: "POST", body: payload })).status).toBe(401);
    expect((await api("/companies", { method: "POST", body: payload }, student.access_token)).status).toBe(403);

    const created = await api("/companies", { method: "POST", body: payload }, editor.access_token);
    expect(created.status).toBe(201);
    const id = (created.body as unknown as { company: { id: string } }).company.id;

    // Delete is admin-only, deliberately: it cascades to every experience and
    // question attached to the company.
    expect((await api(`/companies/${id}`, { method: "DELETE" }, editor.access_token)).status).toBe(403);
    expect((await api(`/companies/${id}`, { method: "DELETE" }, admin.access_token)).status).toBe(200);
  });

  it.runIf(stackUp)("lets a moderator edit a contribution they do not own", async () => {
    const student = await login("student@iiit.ac.in");
    const editor = await login("editor@iiit.ac.in");

    const companies = await api("/companies");
    const companyId = (companies.body as unknown as { companies: Array<{ id: string }> }).companies[0].id;

    const created = await api(
      "/experiences",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          round_name: "Online Assessment",
          experience: "A sufficiently long description of what happened in this round.",
          difficulty: "Medium",
          result: "Pending",
        }),
      },
      student.access_token,
    );
    expect(created.status).toBe(201);
    const id = (created.body as unknown as { item: { id: string } }).item.id;

    // The old UI gated this on ownership alone, so an admin could not remove a
    // spam entry.
    const moderated = await api(
      `/experiences/${id}`,
      { method: "PATCH", body: JSON.stringify({ tips: "Edited by a moderator" }) },
      editor.access_token,
    );
    expect(moderated.status).toBe(200);

    expect((await api(`/experiences/${id}`, { method: "DELETE" }, editor.access_token)).status).toBe(200);
  });

  it.runIf(stackUp)("stops an unrelated user editing someone else's contribution", async () => {
    const student = await login("student@iiit.ac.in");
    const outsiderEmail = `outsider-${Date.now()}@iiit.ac.in`;
    const outsider = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: outsiderEmail, password: SEED_PASSWORD }),
    });
    const outsiderToken = (outsider.body as unknown as { access_token: string }).access_token;

    const companies = await api("/companies");
    const companyId = (companies.body as unknown as { companies: Array<{ id: string }> }).companies[0].id;

    const created = await api(
      "/experiences",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          round_name: "Interview",
          experience: "A sufficiently long description of what happened in this round.",
        }),
      },
      student.access_token,
    );
    const id = (created.body as unknown as { item: { id: string } }).item.id;

    const hijack = await api(
      `/experiences/${id}`,
      { method: "PATCH", body: JSON.stringify({ tips: "hijacked" }) },
      outsiderToken,
    );
    expect(hijack.status).toBe(403);
  });

  it.runIf(stackUp)("refuses to let an admin demote themselves", async () => {
    // Otherwise the last admin can lock everyone out of the panel with no
    // route back in through the UI.
    const admin = await login("admin@iiit.ac.in");
    const { status, body } = await api(
      `/admin/users/${admin.user.id}/role`,
      { method: "PATCH", body: JSON.stringify({ role: "viewer" }) },
      admin.access_token,
    );
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe("CANNOT_DEMOTE_SELF");
  });

  it.runIf(stackUp)("keeps the admin area closed to non-admins", async () => {
    const student = await login("student@iiit.ac.in");
    expect((await api("/admin/users")).status).toBe(401);
    expect((await api("/admin/users", {}, student.access_token)).status).toBe(403);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("validation", () => {
  it.runIf(stackUp)("reports per-field errors rather than a raw database error", async () => {
    const student = await login("student@iiit.ac.in");
    const companies = await api("/companies");
    const companyId = (companies.body as unknown as { companies: Array<{ id: string }> }).companies[0].id;

    const { status, body } = await api(
      "/experiences",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          round_name: "OA",
          experience: "too short",
          result: "Maybe",
        }),
      },
      student.access_token,
    );

    expect(status).toBe(422);
    const details = (body as { error: { details: Record<string, string> } }).error.details;
    expect(details).toHaveProperty("experience");
    expect(details).toHaveProperty("result");
  });

  it.runIf(stackUp)("rejects a CGPA the column cannot hold", async () => {
    // numeric(3,2) overflows above 9.99; this used to surface as a raw
    // Postgres error string in a toast.
    const editor = await login("editor@iiit.ac.in");
    const { status, body } = await api(
      "/companies",
      { method: "POST", body: JSON.stringify({ name: "Overflow Co", cgpa_cutoff: 12.5 }) },
      editor.access_token,
    );
    expect(status).toBe(422);
    expect((body as { error: { details: Record<string, string> } }).error.details).toHaveProperty("cgpa_cutoff");
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("csv import", () => {
  it.runIf(stackUp)("refuses anyone below editor", async () => {
    const student = await login("student@iiit.ac.in");
    const body = JSON.stringify({ rows: [{ Company: "Nope" }] });

    expect((await api("/import/companies", { method: "POST", body })).status).toBe(401);
    expect(
      (await api("/import/companies", { method: "POST", body }, student.access_token)).status,
    ).toBe(403);
  });

  it.runIf(stackUp)("previews without writing anything", async () => {
    const editor = await login("editor@iiit.ac.in");
    const name = `Preview Only ${Date.now()}`;

    const preview = await api(
      "/import/companies",
      { method: "POST", body: JSON.stringify({ rows: [{ Company: name }], dry_run: true }) },
      editor.access_token,
    );
    expect(preview.status).toBe(200);
    expect((preview.body as unknown as { to_create: number }).to_create).toBe(1);

    const companies = await api("/companies");
    const names = (companies.body as unknown as { companies: Array<{ name: string }> }).companies.map(
      (company) => company.name,
    );
    expect(names).not.toContain(name);
  });

  it.runIf(stackUp)("reports bad rows by spreadsheet row number and skips them", async () => {
    const editor = await login("editor@iiit.ac.in");
    const { body } = await api(
      "/import/companies",
      {
        method: "POST",
        body: JSON.stringify({
          rows: [
            { Company: "Fine Co" },
            // numeric(3,2) cannot hold this; it must be caught before the insert.
            { Company: "Bad CGPA", CGPA: "12.5" },
            { Company: "" },
          ],
          dry_run: true,
        }),
      },
      editor.access_token,
    );

    const result = body as unknown as {
      valid: number;
      issues: Array<{ row: number; field?: string }>;
    };
    expect(result.valid).toBe(1);
    // Header is row 1, so the second data row is row 3 in the user's file.
    expect(result.issues.map((issue) => issue.row)).toEqual([3, 4]);
    expect(result.issues[0].field).toBe("cgpa_cutoff");
  });

  it.runIf(stackUp)("updates by name instead of creating a duplicate", async () => {
    const editor = await login("editor@iiit.ac.in");
    const name = `Idempotent Co ${Date.now()}`;
    const rows = [{ Company: name, CTC: "20 LPA" }];

    const first = await api(
      "/import/companies",
      { method: "POST", body: JSON.stringify({ rows, dry_run: false }) },
      editor.access_token,
    );
    expect((first.body as unknown as { created: number }).created).toBe(1);

    const second = await api(
      "/import/companies",
      { method: "POST", body: JSON.stringify({ rows, dry_run: false }) },
      editor.access_token,
    );
    expect((second.body as unknown as { created: number; updated: number }).created).toBe(0);
    expect((second.body as unknown as { updated: number }).updated).toBe(1);

    const companies = await api("/companies");
    const matches = (
      companies.body as unknown as { companies: Array<{ id: string; name: string }> }
    ).companies.filter((company) => company.name === name);
    expect(matches).toHaveLength(1);

    // Cleaned up, or every run leaves another row behind - which makes the
    // local database grow without bound and any count-based assertion drift.
    const admin = await login("admin@iiit.ac.in");
    await api(`/companies/${matches[0].id}`, { method: "DELETE" }, admin.access_token);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("calendar feed", () => {
  it.runIf(stackUp)("serves a valid feed for a token and 404s for anything else", async () => {
    const student = await login("student@iiit.ac.in");

    const issued = await api("/calendar/token", { method: "POST" }, student.access_token);
    expect(issued.status).toBe(200);
    const token = (issued.body as unknown as { token: string }).token;
    expect(token.length).toBeGreaterThan(20);

    // The feed itself carries no Authorization header - the token is the
    // credential, because calendar clients cannot send one.
    const feed = await fetch(`${API}/calendar/${token}.ics`);
    expect(feed.status).toBe(200);
    expect(feed.headers.get("content-type")).toContain("text/calendar");

    const text = await feed.text();
    expect(text.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(text.trimEnd().endsWith("END:VCALENDAR")).toBe(true);

    // Guessing a token must be indistinguishable from any other miss.
    for (const bad of ["notarealtoken1234567890", "short", "%27or%201=1--"]) {
      expect((await fetch(`${API}/calendar/${bad}.ics`)).status).toBe(404);
    }
  });

  it.runIf(stackUp)("stops serving a revoked token", async () => {
    const student = await login("student@iiit.ac.in");
    const issued = await api("/calendar/token", { method: "POST" }, student.access_token);
    const token = (issued.body as unknown as { token: string }).token;

    expect((await fetch(`${API}/calendar/${token}.ics`)).status).toBe(200);

    await api("/calendar/token", { method: "DELETE" }, student.access_token);
    expect((await fetch(`${API}/calendar/${token}.ics`)).status).toBe(404);
  });

  it.runIf(stackUp)("rotating invalidates the previous link", async () => {
    const student = await login("student@iiit.ac.in");
    const first = (
      (await api("/calendar/token", { method: "POST" }, student.access_token))
        .body as unknown as { token: string }
    ).token;
    const second = (
      (await api("/calendar/token", { method: "POST" }, student.access_token))
        .body as unknown as { token: string }
    ).token;

    expect(second).not.toBe(first);
    expect((await fetch(`${API}/calendar/${first}.ics`)).status).toBe(404);
    expect((await fetch(`${API}/calendar/${second}.ics`)).status).toBe(200);
  });

  it.runIf(stackUp)("keeps the token out of reach of the anon key", async () => {
    expect((await api("/calendar/token")).status).toBe(401);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("admin surface", () => {
  it.runIf(stackUp)("keeps every admin route closed to a viewer", async () => {
    const student = await login("student@iiit.ac.in");
    for (const path of ["/admin/audit", "/admin/settings", "/admin/announcements", "/admin/contributions"]) {
      expect((await api(path)).status, `${path} anon`).toBe(401);
      expect((await api(path, {}, student.access_token)).status, `${path} viewer`).toBe(403);
    }
  });

  it.runIf(stackUp)("attributes an audited write to the person who made it", async () => {
    // The triggers fire on a connection that authenticates as the service role
    // for everyone, so without the actor header every entry would read as
    // "outside the app" and the log would be useless.
    const admin = await login("admin@iiit.ac.in");
    const editor = await login("editor@iiit.ac.in");

    const name = `Audit Co ${Date.now()}`;
    const created = await api(
      "/companies",
      { method: "POST", body: JSON.stringify({ name }) },
      editor.access_token,
    );
    expect(created.status).toBe(201);
    const id = (created.body as unknown as { company: { id: string } }).company.id;

    const log = await api("/admin/audit?per_page=10", {}, admin.access_token);
    const entries = (log.body as unknown as { entries: Array<Record<string, unknown>> }).entries;
    const entry = entries.find((row) => row.record_id === id && row.action === "INSERT");

    expect(entry, "the insert was not recorded").toBeTruthy();
    expect(entry!.actor_email).toBe("editor@iiit.ac.in");

    await api(`/companies/${id}`, { method: "DELETE" }, admin.access_token);
  });

  it.runIf(stackUp)("restricts signup to the configured domains", async () => {
    const admin = await login("admin@iiit.ac.in");

    await api(
      "/admin/settings",
      { method: "PATCH", body: JSON.stringify({ signup_allowed_domains: ["iiit.ac.in"] }) },
      admin.access_token,
    );

    const outside = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: `x${Date.now()}@gmail.com`, password: "placement123" }),
    });
    expect(outside.status).toBe(403);
    // A bare "could not create the account" leaves the student with no idea
    // that the domain is the problem.
    expect((outside.body as { error: { code: string } }).error.code).toBe("DOMAIN_NOT_ALLOWED");

    const inside = await api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: `ok${Date.now()}@iiit.ac.in`, password: "placement123" }),
    });
    expect(inside.status).toBe(201);

    // Put it back, or every later signup in the suite depends on ordering.
    await api(
      "/admin/settings",
      { method: "PATCH", body: JSON.stringify({ signup_allowed_domains: [] }) },
      admin.access_token,
    );
  });

  it.runIf(stackUp)("rejects a malformed domain rather than locking everyone out", async () => {
    const admin = await login("admin@iiit.ac.in");
    const { status, body } = await api(
      "/admin/settings",
      { method: "PATCH", body: JSON.stringify({ signup_allowed_domains: ["not a domain"] }) },
      admin.access_token,
    );
    expect(status).toBe(422);
    expect((body as { error: { details: Record<string, string> } }).error.details).toHaveProperty(
      "signup_allowed_domains",
    );
  });

  it.runIf(stackUp)("publishes an announcement that the public endpoint then serves", async () => {
    const admin = await login("admin@iiit.ac.in");
    const title = `Notice ${Date.now()}`;

    const created = await api(
      "/admin/announcements",
      { method: "POST", body: JSON.stringify({ title, severity: "warning" }) },
      admin.access_token,
    );
    expect(created.status).toBe(201);
    const id = (created.body as unknown as { announcement: { id: string } }).announcement.id;

    // The banner endpoint needs no auth at all.
    const live = await api("/announcements");
    expect(live.status).toBe(200);
    const titles = (live.body as unknown as { announcements: Array<{ title: string }> }).announcements.map(
      (a) => a.title,
    );
    expect(titles).toContain(title);

    await api(`/admin/announcements/${id}`, { method: "DELETE" }, admin.access_token);
    const after = await api("/announcements");
    expect(
      (after.body as unknown as { announcements: Array<{ title: string }> }).announcements.map(
        (a) => a.title,
      ),
    ).not.toContain(title);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("discussion", () => {
  async function firstExperienceId(token: string): Promise<string> {
    const companies = await api("/companies");
    const list = (companies.body as unknown as { companies: Array<{ id: string }> }).companies;
    for (const company of list) {
      const items = await api(`/companies/${company.id}/experiences`);
      const found = (items.body as unknown as { items: Array<{ id: string }> }).items[0];
      if (found) return found.id;
    }
    // Nothing seeded on this run - make one so the suite is order-independent.
    const created = await api(
      "/experiences",
      {
        method: "POST",
        body: JSON.stringify({
          company_id: list[0].id,
          round_name: "Seed round",
          experience: "A sufficiently long description for the validator to accept.",
        }),
      },
      token,
    );
    return (created.body as unknown as { item: { id: string } }).item.id;
  }

  it.runIf(stackUp)("requires an account to comment but not to read", async () => {
    const student = await login("student@iiit.ac.in");
    const experienceId = await firstExperienceId(student.access_token);

    expect(
      (
        await api("/comments", {
          method: "POST",
          body: JSON.stringify({ entity_type: "experience", entity_id: experienceId, body: "hi" }),
        })
      ).status,
    ).toBe(401);

    expect((await api(`/comments?entity_type=experience&entity_id=${experienceId}`)).status).toBe(200);
  });

  it.runIf(stackUp)("flattens a reply to a reply onto the same parent", async () => {
    // Unbounded nesting reads badly and has no natural end; the API collapses
    // it rather than letting the client decide.
    const student = await login("student@iiit.ac.in");
    const experienceId = await firstExperienceId(student.access_token);

    const root = await api(
      "/comments",
      {
        method: "POST",
        body: JSON.stringify({ entity_type: "experience", entity_id: experienceId, body: "Root" }),
      },
      student.access_token,
    );
    const rootId = (root.body as unknown as { comment: { id: string } }).comment.id;

    const reply = await api(
      "/comments",
      {
        method: "POST",
        body: JSON.stringify({
          entity_type: "experience",
          entity_id: experienceId,
          parent_id: rootId,
          body: "Reply",
        }),
      },
      student.access_token,
    );
    const replyId = (reply.body as unknown as { comment: { id: string } }).comment.id;

    const nested = await api(
      "/comments",
      {
        method: "POST",
        body: JSON.stringify({
          entity_type: "experience",
          entity_id: experienceId,
          parent_id: replyId,
          body: "Reply to the reply",
        }),
      },
      student.access_token,
    );
    expect((nested.body as unknown as { comment: { parent_id: string } }).comment.parent_id).toBe(rootId);
  });

  it.runIf(stackUp)("lets a moderator remove a comment but never edit one", async () => {
    const student = await login("student@iiit.ac.in");
    const admin = await login("admin@iiit.ac.in");
    const experienceId = await firstExperienceId(student.access_token);

    const created = await api(
      "/comments",
      {
        method: "POST",
        body: JSON.stringify({
          entity_type: "experience",
          entity_id: experienceId,
          body: "Something to moderate",
        }),
      },
      student.access_token,
    );
    const id = (created.body as unknown as { comment: { id: string } }).comment.id;

    // Removing is moderation; rewriting would be putting words in someone's mouth.
    expect(
      (await api(`/comments/${id}`, { method: "PATCH", body: JSON.stringify({ body: "x" }) }, admin.access_token))
        .status,
    ).toBe(403);
    expect((await api(`/comments/${id}`, { method: "DELETE" }, admin.access_token)).status).toBe(200);

    const after = await api(`/comments?entity_type=experience&entity_id=${experienceId}`);
    const removed = (
      after.body as unknown as { comments: Array<{ id: string; is_deleted: boolean; body: string | null }> }
    ).comments.find((comment) => comment.id === id);

    // The row survives so replies keep their context, but the text does not
    // travel to the client at all.
    expect(removed?.is_deleted).toBe(true);
    expect(removed?.body).toBeNull();
  });

  it.runIf(stackUp)("counts one vote per person and lets it be taken back", async () => {
    const student = await login("student@iiit.ac.in");
    const editor = await login("editor@iiit.ac.in");
    const experienceId = await firstExperienceId(student.access_token);

    const cast = (token: string, value: number) =>
      api(
        "/votes",
        {
          method: "POST",
          body: JSON.stringify({ entity_type: "experience", entity_id: experienceId, value }),
        },
        token,
      );

    // Clear any earlier state so the arithmetic is about this test only.
    await cast(student.access_token, 0);
    await cast(editor.access_token, 0);

    const first = await cast(student.access_token, 1);
    expect((first.body as unknown as { score: number }).score).toBe(1);

    const again = await cast(student.access_token, 1);
    expect((again.body as unknown as { score: number }).score).toBe(1);

    const second = await cast(editor.access_token, 1);
    expect((second.body as unknown as { score: number }).score).toBe(2);

    const cleared = await cast(student.access_token, 0);
    expect((cleared.body as unknown as { score: number }).score).toBe(1);

    await cast(editor.access_token, 0);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("tags", () => {
  it.runIf(stackUp)("needs editor access and folds case variants into one tag", async () => {
    const student = await login("student@iiit.ac.in");
    const editor = await login("editor@iiit.ac.in");

    const companies = await api("/companies");
    const companyId = (companies.body as unknown as { companies: Array<{ id: string }> }).companies[0].id;

    expect(
      (
        await api(
          `/companies/${companyId}/tags`,
          { method: "PUT", body: JSON.stringify({ tags: ["Fintech"] }) },
          student.access_token,
        )
      ).status,
    ).toBe(403);

    // "Fintech" and "FINTECH" must not become two tags.
    const set = await api(
      `/companies/${companyId}/tags`,
      { method: "PUT", body: JSON.stringify({ tags: ["Fintech", "FINTECH", "Intern + PPO"] }) },
      editor.access_token,
    );
    expect(set.status).toBe(200);
    expect((set.body as unknown as { tags: string[] }).tags).toEqual(["fintech", "intern-ppo"]);

    const read = await api(`/companies/${companyId}/tags`);
    const slugs = (read.body as unknown as { tags: Array<{ slug: string }> }).tags.map((t) => t.slug);
    expect(slugs.sort()).toEqual(["fintech", "intern-ppo"]);
  });
});
