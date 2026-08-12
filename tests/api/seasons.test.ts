/**
 * Season scoping, against the real local stack.
 *
 * The archive is the one feature where being quietly wrong is worse than
 * failing: showing 2023's deadlines as if they were live, or writing an import
 * into the wrong year, both look like working software. So the assertions here
 * are mostly about what does *not* leak between seasons.
 *
 * Skipped automatically when the stack is not running, so `npm test` still
 * works without Docker.
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

if (!stackUp) {
  console.warn(`\n  Skipping season API tests: no stack at ${API}.\n`);
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

async function login(email: string) {
  const { body } = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: SEED_PASSWORD }),
  });
  return (body as unknown as { access_token: string }).access_token;
}

interface SeasonRow {
  id: string;
  slug: string;
  label: string;
  is_current: boolean;
  company_count: number;
}

interface CompanyRow {
  id: string;
  name: string;
  season_id: string;
  org_slug: string | null;
  season?: { slug: string; label: string } | null;
}

async function seasons(): Promise<SeasonRow[]> {
  const { body } = await api("/seasons");
  return (body as unknown as { seasons: SeasonRow[] }).seasons;
}

async function companies(query = ""): Promise<CompanyRow[]> {
  const { body } = await api(`/companies${query}`);
  return (body as unknown as { companies: CompanyRow[] }).companies;
}

describe.runIf(!process.env.SKIP_API_TESTS)("seasons", () => {
  it.runIf(stackUp)("lists seasons newest first with a company count", async () => {
    const list = await seasons();
    expect(list.length).toBeGreaterThanOrEqual(3);

    const slugs = list.map((season) => season.slug);
    expect(slugs).toEqual([...slugs].sort().reverse());

    for (const season of list) expect(typeof season.company_count).toBe("number");
    expect(list.filter((season) => season.is_current)).toHaveLength(1);
  });

  it.runIf(stackUp)("defaults to the current season when none is asked for", async () => {
    const list = await seasons();
    const current = list.find((season) => season.is_current)!;

    const defaulted = await companies();
    expect(defaulted).toHaveLength(current.company_count);
    for (const company of defaulted) expect(company.season_id).toBe(current.id);
  });

  it.runIf(stackUp)("returns only that season's companies for an explicit slug", async () => {
    const list = await seasons();

    for (const season of list) {
      const rows = await companies(`?season=${season.slug}`);
      expect(rows).toHaveLength(season.company_count);
      for (const company of rows) {
        expect(company.season_id).toBe(season.id);
        expect(company.season?.slug).toBe(season.slug);
      }
    }
  });

  it.runIf(stackUp)("returns every season's companies for season=all", async () => {
    const list = await seasons();
    const total = list.reduce((sum, season) => sum + season.company_count, 0);

    const all = await companies("?season=all");
    expect(all).toHaveLength(total);
    expect(new Set(all.map((company) => company.season_id)).size).toBeGreaterThan(1);
  });

  it.runIf(stackUp)("shows nothing for a season that does not exist", async () => {
    // Deliberately not a fallback to the current season: answering a 2019 URL
    // with 2026 data is the failure mode that makes an archive untrustworthy.
    const rows = await companies("?season=2019-20");
    expect(rows).toHaveLength(0);
  });

  it.runIf(stackUp)("creates a company in the season being viewed", async () => {
    // Not the season the dates fall in: someone filling a gap in the 2023
    // archive today is not adding to this year's drives, and a database
    // trigger inferring from the deadline would put it there.
    const token = await login("admin@iiit.ac.in");
    const archive = (await seasons()).find((season) => !season.is_current)!;

    const { status, body } = await api(
      `/companies?season=${archive.slug}`,
      { method: "POST", body: JSON.stringify({ name: `Backfill ${Date.now()}` }) },
      token,
    );
    expect(status).toBe(201);
    const company = (body as unknown as { company: CompanyRow }).company;

    try {
      expect(company.season_id).toBe(archive.id);
      // And it must not show up in the live season's list.
      const live = await companies();
      expect(live.some((row) => row.id === company.id)).toBe(false);
    } finally {
      await api(`/companies/${company.id}`, { method: "DELETE" }, token);
    }
  });

  it.runIf(stackUp)("keeps a search inside the selected season", async () => {
    const archive = (await seasons()).find((season) => !season.is_current && season.company_count)!;
    const rows = await companies(`?season=${archive.slug}&q=a`);
    for (const company of rows) expect(company.season_id).toBe(archive.id);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("company history", () => {
  it.runIf(stackUp)("links the same organisation across seasons", async () => {
    // Solstice Labs is seeded into all three seasons on purpose.
    const [company] = (await companies("?season=all")).filter(
      (row) => row.name === "Solstice Labs",
    );
    expect(company).toBeTruthy();

    const { status, body } = await api(`/companies/${company.id}/history`);
    expect(status).toBe(200);

    const { history, org_slug } = body as unknown as {
      history: Array<{ id: string; season: { slug: string } | null; offered_ctc: string | null }>;
      org_slug: string;
    };

    expect(org_slug).toBe("solstice");
    expect(history).toHaveLength(3);

    const slugs = history.map((entry) => entry.season?.slug);
    expect(slugs).toEqual(["2025-26", "2024-25", "2023-24"]);

    // The row that was asked about must be in its own history, or the panel
    // has no anchor to mark as "viewing".
    expect(history.some((entry) => entry.id === company.id)).toBe(true);
  });

  it.runIf(stackUp)("returns a single entry for a one-season company", async () => {
    const [company] = (await companies("?season=all")).filter(
      (row) => row.name === "Ferrous Motors",
    );
    const { body } = await api(`/companies/${company.id}/history`);
    expect((body as unknown as { history: unknown[] }).history).toHaveLength(1);
  });

  it.runIf(stackUp)("404s for an unknown company", async () => {
    const { status } = await api("/companies/00000000-0000-0000-0000-000000000000/history");
    expect(status).toBe(404);
  });

  it.runIf(stackUp)("matches through corporate suffixes and punctuation", async () => {
    // `org_slug_for` strips repeated suffixes so the same employer written
    // three different ways across three years still links up. Exercised
    // through the API rather than against the SQL function directly, because
    // the trigger firing on insert is as much a part of this as the regex.
    const token = await login("admin@iiit.ac.in");
    const stamp = Date.now();
    const base = `Zephyr Dynamics ${stamp}`;

    const variants = [
      { name: `${base}`, season: "2025-26" },
      { name: `${base} Pvt. Ltd.`, season: "2024-25" },
      { name: `${base} India Private Limited`, season: "2023-24" },
    ];

    const created: string[] = [];
    for (const variant of variants) {
      const { status, body } = await api(
        `/companies?season=${variant.season}`,
        { method: "POST", body: JSON.stringify({ name: variant.name }) },
        token,
      );
      expect(status).toBe(201);
      created.push((body as unknown as { company: CompanyRow }).company.id);
    }

    try {
      const { body } = await api(`/companies/${created[0]}/history`);
      const { history } = body as unknown as { history: Array<{ id: string }> };

      expect(history).toHaveLength(3);
      expect(new Set(history.map((entry) => entry.id))).toEqual(new Set(created));
    } finally {
      for (const id of created) await api(`/companies/${id}`, { method: "DELETE" }, token);
    }
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("season administration", () => {
  it.runIf(stackUp)("refuses season management to a non-admin", async () => {
    const token = await login("student@iiit.ac.in");
    const { status } = await api(
      "/admin/seasons",
      { method: "POST", body: JSON.stringify({ slug: "2030-31" }) },
      token,
    );
    expect(status).toBe(403);
  });

  it.runIf(stackUp)("rejects a slug whose years are not consecutive", async () => {
    const token = await login("admin@iiit.ac.in");
    const { status, body } = await api(
      "/admin/seasons",
      { method: "POST", body: JSON.stringify({ slug: "2030-35" }) },
      token,
    );
    expect(status).toBe(422);
    // The correction is returned as a field error so the form can put it next
    // to the input rather than in a toast.
    expect((body as { error: { details: { slug: string } } }).error.details.slug).toContain(
      "2030-31",
    );
  });

  it.runIf(stackUp)("rejects a slug in the wrong shape", async () => {
    const token = await login("admin@iiit.ac.in");
    const { status } = await api(
      "/admin/seasons",
      { method: "POST", body: JSON.stringify({ slug: "2030" }) },
      token,
    );
    expect(status).toBe(422);
  });

  it.runIf(stackUp)("creates and deletes an empty season", async () => {
    const token = await login("admin@iiit.ac.in");
    // Far enough out that it cannot collide with a seeded or inferred season.
    const slug = "2044-45";

    const created = await api(
      "/admin/seasons",
      { method: "POST", body: JSON.stringify({ slug }) },
      token,
    );
    expect(created.status).toBe(201);

    // Creating is idempotent - `ensure_season` is what the date trigger calls,
    // so a second create must not raise a unique violation.
    const again = await api(
      "/admin/seasons",
      { method: "POST", body: JSON.stringify({ slug }) },
      token,
    );
    expect(again.status).toBe(201);

    expect((await seasons()).filter((season) => season.slug === slug)).toHaveLength(1);

    const deleted = await api(`/admin/seasons/${slug}`, { method: "DELETE" }, token);
    expect(deleted.status).toBe(200);
    expect((await seasons()).some((season) => season.slug === slug)).toBe(false);
  });

  it.runIf(stackUp)("refuses to delete a season that still has companies", async () => {
    const token = await login("admin@iiit.ac.in");
    const populated = (await seasons()).find(
      (season) => !season.is_current && season.company_count > 0,
    )!;

    const { status, body } = await api(
      `/admin/seasons/${populated.slug}`,
      { method: "DELETE" },
      token,
    );
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe("SEASON_NOT_EMPTY");
  });

  it.runIf(stackUp)("refuses to delete the current season", async () => {
    const token = await login("admin@iiit.ac.in");
    const current = (await seasons()).find((season) => season.is_current)!;
    const { status, body } = await api(
      `/admin/seasons/${current.slug}`,
      { method: "DELETE" },
      token,
    );
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe("CANNOT_DELETE_CURRENT");
  });

  it.runIf(stackUp)("moves the current season and puts it back", async () => {
    const token = await login("admin@iiit.ac.in");
    const before = await seasons();
    const original = before.find((season) => season.is_current)!;
    const target = before.find((season) => !season.is_current)!;

    const moved = await api(
      "/admin/seasons",
      { method: "PATCH", body: JSON.stringify({ slug: target.slug }) },
      token,
    );
    expect(moved.status).toBe(200);

    const during = await seasons();
    // Exactly one, always: a partial unique index enforces it, and clearing
    // the old flag before setting the new one is the only order that works.
    expect(during.filter((season) => season.is_current)).toHaveLength(1);
    expect(during.find((season) => season.is_current)!.slug).toBe(target.slug);

    // The unqualified company list must follow, since that is what a visitor
    // with no `?season=` sees.
    const defaulted = await companies();
    expect(defaulted).toHaveLength(target.company_count);

    await api(
      "/admin/seasons",
      { method: "PATCH", body: JSON.stringify({ slug: original.slug }) },
      token,
    );
    expect((await seasons()).find((season) => season.is_current)!.slug).toBe(original.slug);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("season-scoped import", () => {
  it.runIf(stackUp)("refuses an import that names no season", async () => {
    const token = await login("admin@iiit.ac.in");
    const { status, body } = await api(
      "/import/companies?season=2019-20",
      { method: "POST", body: JSON.stringify({ rows: [{ Company: "Nowhere Ltd" }] }) },
      token,
    );
    expect(status).toBe(400);
    expect((body as { error: { code: string } }).error.code).toBe("NO_SEASON");
  });

  it.runIf(stackUp)("matches existing rows within the target season only", async () => {
    const token = await login("admin@iiit.ac.in");
    // Solstice Labs exists in every seeded season. A dry run against one of
    // them must plan a single update, not three - and must not plan a create,
    // which would mean it failed to see the row that is already there.
    const { status, body } = await api(
      "/import/companies?season=2024-25",
      {
        method: "POST",
        body: JSON.stringify({ rows: [{ Company: "Solstice Labs", CTC: "50 LPA" }] }),
      },
      token,
    );

    expect(status).toBe(200);
    const summary = body as unknown as { to_create: number; to_update: number };
    expect(summary.to_update).toBe(1);
    expect(summary.to_create).toBe(0);
  });

  it.runIf(stackUp)("treats a name absent from the target season as new", async () => {
    const token = await login("admin@iiit.ac.in");
    // Ferrous Motors is seeded into 2023-24 only, so against 2025-26 it is a
    // new drive rather than an edit of the old one.
    const { body } = await api(
      "/import/companies?season=2025-26",
      { method: "POST", body: JSON.stringify({ rows: [{ Company: "Ferrous Motors" }] }) },
      token,
    );

    const summary = body as unknown as { to_create: number; to_update: number };
    expect(summary.to_create).toBe(1);
    expect(summary.to_update).toBe(0);
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("saved companies across seasons", () => {
  it.runIf(stackUp)("labels each saved company with its season", async () => {
    // Bookmarks are deliberately not season-scoped - a saved company from last
    // year should stay saved - so each row has to say which year it is from,
    // or the same name appears three times with nothing to tell them apart.
    const token = await login("student@iiit.ac.in");
    const all = await companies("?season=all");
    const solstice = all.filter((row) => row.name === "Solstice Labs");
    expect(solstice.length).toBeGreaterThan(1);

    for (const row of solstice) {
      await api(
        "/me/bookmarks",
        { method: "POST", body: JSON.stringify({ company_id: row.id }) },
        token,
      );
    }

    try {
      const { body } = await api("/me/bookmarks", {}, token);
      const { bookmarks } = body as unknown as {
        bookmarks: Array<{ companies: CompanyRow | null }>;
      };

      const saved = bookmarks
        .map((entry) => entry.companies)
        .filter((company): company is CompanyRow => company?.name === "Solstice Labs");

      expect(saved.length).toBe(solstice.length);
      for (const company of saved) expect(company.season?.slug).toMatch(/^\d{4}-\d{2}$/);
      // Distinct seasons, so the badges actually disambiguate.
      expect(new Set(saved.map((company) => company.season?.slug)).size).toBe(solstice.length);
    } finally {
      for (const row of solstice) {
        await api(`/me/bookmarks/${row.id}`, { method: "DELETE" }, token);
      }
    }
  });
});

describe.runIf(!process.env.SKIP_API_TESTS)("calendar feed", () => {
  it.runIf(stackUp)("covers the current season and nothing else", async () => {
    const token = await login("student@iiit.ac.in");
    const issued = await api("/calendar/token", { method: "POST" }, token);
    const { token: feedToken } = issued.body as unknown as { token: string };

    const response = await fetch(`${API}/calendar/${feedToken}.ics`);
    expect(response.status).toBe(200);
    const ics = await response.text();

    // A subscription is a standing thing about upcoming dates, so it must not
    // pick up companies that only ever existed in an archived season.
    expect(ics).toContain("Wavelength Systems");
    expect(ics).not.toContain("Ferrous Motors");
    expect(ics).not.toContain("Harbour Analytics");
  });
});
