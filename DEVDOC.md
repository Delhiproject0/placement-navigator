# PlaceTrack - developer documentation

Architecture, operational runbooks, and the things that are non-obvious from
reading the code. For setup and scripts, see [README.md](./README.md).

---

## Contents

- [Architecture](#architecture)
- [Frontend structure](#frontend-structure)
- [Data model](#data-model)
- [Authentication](#authentication)
- [Environment](#environment)
- [File storage](#file-storage)
- [Authorization model](#authorization-model)
- [Theming](#theming)
- [Seed data](#seed-data)
- [Audit trail](#audit-trail)
- [Seasons](#seasons)
- [Discussion and votes](#discussion-and-votes)
- [Continuous integration](#continuous-integration)
- [Documentation and screenshots](#documentation-and-screenshots)
- [Known operational gaps](#known-operational-gaps)
- [Runbooks](#runbooks)
- [Contributors](#contributors)

---

## Architecture

```
Browser (Vite/React SPA on Vercel)
  │  Authorization: Bearer <our own HS256 JWT>
  ▼
Edge Function  /functions/v1/placements      <-- the entire API
  │              holds SUPABASE_SERVICE_ROLE_KEY
  │              holds PLACEMENTS_JWT_SECRET
  │
  ├──► Postgres (hosted project jwaqisnpxkavkkjzvutl)
  │      app_users / auth_sessions  - bcrypt via pgcrypto
  │      companies / experiences / questions / profiles / attachments
  │
  └──► https://supabase.dileepadari.dev/functions/v1/upload
         (self-hosted stack on an Oracle VM; 60s {is_admin} JWT)
         │
         └──► /mnt/storage/public-cdn, served by Caddy at
              https://mystorage.dileepadari.dev/{images,documents}/placements/*
```

Data lives in the hosted Supabase project. Files live on a self-hosted box. The
two are deliberately separate: file bytes are large, cheap to serve from a VM
already paid for, and would otherwise burn the project's free-tier storage quota.

## Frontend structure

```
src/
  main.tsx            fonts, then mounts App
  App.tsx             providers (query, theme, auth, season) and the router
  pages/              one file per route, 12 of them
  components/
    layout/           shell, header, sidebar, footer
    companies/        cards, filters, the phase pill
    discussion/       comments, votes, tags
    attachments/      upload widget and file list
    forms/            react-hook-form + zod bindings
    charts/           recharts wrappers that read theme tokens
    admin/            user table, season manager, settings
    skeletons/        loading placeholders, one per list shape
    ui/               shadcn primitives, mostly untouched
  hooks/
    queries.ts        every server call, as a react-query hook
    useAuth.tsx       token, current user, role predicates
    useSeason.tsx     the selected season, persisted per browser
    useChartColors.ts reads CSS variables so charts follow the theme
  lib/
    api.ts            the only module that talks to the edge function
    schemas.ts        zod schemas shared by forms and parsers
    phase.ts, ctc.ts, csv.ts, ics.ts   domain helpers
  types/database.ts   hand-written row types
```

Two rules hold the shape together:

1. **`lib/api.ts` is the only place a URL appears.** Components never fetch.
   Everything goes through a react-query hook in `hooks/queries.ts`, which calls
   `api.ts`, which attaches the bearer token and unwraps the envelope.
2. **`types/database.ts` is written by hand.** There are no generated Supabase
   types here, because the browser never touches PostgREST - the edge function's
   response shape is the contract, not the table shape. When a migration adds a
   column, update the type and `api.ts` together or the column simply will not
   arrive.

## Data model

Nineteen tables. The ones worth knowing:

| Table | Holds | Notes |
| --- | --- | --- |
| `app_users` | accounts | bcrypt hash via pgcrypto, `is_active` flag, `access_granted` flag |
| `auth_sessions` | issued sessions | one row per login, revoked on logout |
| `password_resets` | reset tokens | single use, expiring |
| `user_roles` | role per user | `admin` / `editor` / `viewer` |
| `profiles` | display name, batch, branch | 1:1 with `app_users` |
| `companies` | the central record | phase, CTC breakdown, dates, season |
| `interview_experiences` | write-ups | authored, editable by author or admin |
| `interview_questions` | questions per company | round, difficulty, topic |
| `attachments` | file metadata | bytes live on the storage box, not here |
| `bookmarks` / `applications` | per-user tracking | applications carry a status |
| `comments` / `votes` | discussion | votes are unique per (user, target) |
| `tags` / `company_tags` | free tagging | many-to-many |
| `seasons` | placement cycles | exactly one `is_current` |
| `announcements` | the banner | scheduled by window |
| `app_settings` | single-row config | signup domain allowlist lives here |
| `audit_log` | who changed what | append only |

Nothing cascades to `audit_log`, deliberately: deleting a company must not erase
the record that it was deleted.

## Authentication

**Supabase Auth (GoTrue) is not used.** Accounts are ordinary rows in
`public.app_users`, passwords are bcrypt hashes produced by pgcrypto inside
Postgres, and the edge function issues its own HS256 JWTs signed with
`PLACEMENTS_JWT_SECRET`. This matches the pattern in moneyos and portfolio.

- `app_signup()` / `app_login()` are `security definer` Postgres functions.
  The plaintext password is an argument and is never stored or logged; the
  comparison happens in the database via `crypt()`.
- Access tokens last 1 hour. Refresh tokens last 30 days, are stored only as a
  SHA-256 digest, and **rotate on every use**. Presenting a spent refresh token
  is treated as theft and revokes every session for that user.
- Failed logins return an identical 401 whether the account exists or not.
  Making those distinguishable would turn login into an account-enumeration
  oracle. Ten consecutive failures lock the account for fifteen minutes.
- The role in a token is **not trusted**. `getCaller()` re-reads `user_roles`
  and `app_users.is_active` on every request, so demoting or disabling someone
  takes effect immediately rather than whenever their token happens to expire.

### The thing to be careful about

Because the API fronts the database with the service-role key, **row-level
security is no longer what separates one student's data from another's** - the
service-role client bypasses RLS entirely. Authorization is the explicit
`requireUser` / `requireEditor` / `requireAdmin` call at the top of each route
in `supabase/functions/placements/index.ts`.

A missing check there is a data leak, not a policy misconfiguration. RLS is
still enabled on every table as a backstop for the anon key, and `app_users`,
`auth_sessions` and `password_resets` have RLS on with **no policies at all**
plus explicit `revoke` from `anon` and `authenticated`, so the browser key can
never reach a password hash whatever else changes.

Two grant subtleties that will bite anyone editing the migrations:

- `revoke all on function ... from public` also strips `service_role`, because
  it holds execute *through* PUBLIC. Every such revoke is followed by an
  explicit `grant execute ... to service_role`.
- Table grants are written out explicitly rather than inherited from Supabase's
  default privileges, which differ between a local stack and a hosted project.

---

## Environment

### Browser (`.env`, `VITE_` prefixed - these ship in the bundle)

| Variable | Where it comes from |
|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Project ref, e.g. `jwaqisnpxkavkkjzvutl` |
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon/public |
| `VITE_API_URL` | Optional. Overrides the API base so a dev server can point at a local stack. |

The anon key is public by design and is now only used as the `apikey` header
the Supabase gateway expects in front of the edge function. The browser no
longer holds `@supabase/supabase-js` at all and cannot reach PostgREST - all
access goes through the API, authenticated with a token this project issued.

### Server-side (`.env`, no `VITE_` prefix - never bundled)

| Variable | Where it comes from | Needed for |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens | `link`, `db push`, `functions deploy`, `secrets set` |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database | `db push`, direct `psql` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role | Admin user deletion, test teardown |

### Edge Function secrets (set with `npx supabase secrets set`, never in `.env`)

| Variable | Value |
|---|---|
| `PLACEMENTS_JWT_SECRET` | `openssl rand -hex 32`. Signs the access tokens this API issues. **Required**: the function now refuses to boot without it, because an empty value used to reach Web Crypto as a zero-length HMAC key and turn every login into an unexplained 500. Rotating it signs everyone out, which is the intended emergency response. |
| `SELFHOST_JWT_SECRET` | `JWT_SECRET` from `~/supabase-prod/docker/.env` on the storage box. 64 characters; the same value the portfolio project calls `ADMIN_JWT_SECRET`. A wrong one fails silently until an upload: the box answers `401 Unauthorized: Invalid signature` and the API turns that into a 502. Check it without printing it: `printf %s "$SELFHOST_JWT_SECRET" \| sha256sum` should match the box's. |
| `ORACLE_UPLOAD_BASE_URL` | `https://supabase.dileepadari.dev` |
| `ORACLE_UPLOAD_PATH` | `/functions/v1/upload` |
| `ORACLE_PUBLIC_BASE_URL` | `https://mystorage.dileepadari.dev` |
| `ORACLE_APP_NAME` | `placements` |
| `REMINDER_CRON_SECRET` | `openssl rand -hex 32` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into edge functions
automatically - do not set them yourself.

Serving locally reads none of the above. `supabase functions serve` takes its
environment from `supabase/functions/.env`, which is gitignored, so a fresh
checkout needs at least:

```sh
{
  echo "PLACEMENTS_JWT_SECRET=$(openssl rand -hex 32)"
  echo "SELFHOST_JWT_SECRET=$(openssl rand -hex 32)"
} > supabase/functions/.env
```

Without `PLACEMENTS_JWT_SECRET` the function will not start at all, and
`tests/api` will skip itself because nothing answers `/health`. Without
`SELFHOST_JWT_SECRET`, `handleUpload` returns `STORAGE_NOT_CONFIGURED` before any
other check, so every upload path 500s. Neither local value needs to be real:
uploads that would actually reach the storage box are verified by hand against
production, not from a laptop. CI writes throwaways for both.

### GitHub Actions secrets

`SUPABASE_URL` and `SUPABASE_ANON_KEY`, used only by the keep-alive ping.

---

## File storage

This follows the same contract as the `workos` and `portfolio` projects, which
share the storage box. The rules below are not stylistic - breaking any of them
breaks uploads.

**The upload host and the read host are different.**
`supabase.dileepadari.dev` accepts uploads. `mystorage.dileepadari.dev` serves
them. You never POST to `mystorage`.

**Raw bytes, never multipart.** The body is the file. Metadata goes in headers:

| Header | Value |
|---|---|
| `Authorization` | `Bearer <60s JWT with {is_admin: true}, HS256, signed with SELFHOST_JWT_SECRET>` |
| `x-app-name` | `placements` - must be in the box's `ALLOWED_CATEGORIES` allowlist |
| `x-file-name` | Must match `^[a-zA-Z0-9._-]+$` - **no slashes** |
| `x-file-type` | `images` or `documents` |

**Filenames are flat.** The storage box has no folder or tenancy concept and does
no sanitizing of its own beyond that regex, so scope is folded into the name:
`${entityType}-${entityId}-${uuid}-${sanitizedOriginal}`.

**Never trust the response's `url`.** The upload endpoint returns a URL whose host
is wrong. Take the path, rebuild the host from `ORACLE_PUBLIC_BASE_URL`.

**There is no list endpoint.** The `attachments` table is the source of truth for
what exists. If you write bytes without writing a row, the file is orphaned
forever - so on a metadata-insert failure, delete the blob.

**The CDN sends no CORS headers.** `<img>` and `<iframe>` load fine; `fetch()` is
blocked. Reading file *contents* in JS goes through the `/file-text` proxy route.

**The upload secret must never reach the browser.** That is the entire reason the
edge function exists as a middleman rather than the client calling the box
directly.

### Deploying a change to the storage box

The box runs a single edge-runtime entrypoint shared by **every** app on it -
moneyos, portfolio, and placements all live in one `index.ts`. Changes must be
additive, and a mistake takes down the other apps.

```sh
ssh ubuntu@mystorage.dileepadari.dev

# 1. Always back up first
cp /mnt/storage/supabase/functions/index.ts \
   /mnt/storage/supabase/functions/index.ts.bak-$(date +%s)

# 2. Edit, then restart
cd ~/supabase-prod/docker && docker compose restart edge-runtime

# 3. Smoke-test the OTHER apps before you call it done
curl -s https://supabase.dileepadari.dev/functions/v1/hello
```

---

## Authorization model

### The access gate

The site is internal to IIIT Hyderabad. **Nothing is public, and an account is
not enough**: an admin grants access per account, stored as
`app_users.access_granted`. A new signup has it off.

| Caller | What they reach |
|---|---|
| No session | `/health`, the `/auth/*` endpoints, and nothing else (401) |
| Signed in, not approved | additionally `/auth/me` and `/auth/change-password`; everything else is 403 `ACCESS_PENDING` |
| Signed in and approved | the role table below |

The pieces, and why each is the way it is:

- **One gate, not one per route.** `index.ts` calls `requireAccess` once, after
  the handful of open routes and before everything else. A route added later is
  closed unless someone deliberately puts it above that line. The per-route
  `requireUser` calls further down are now redundant and left in place.
- **Read per request.** `getCaller` re-reads the flag from the database every
  time, like the role, so withdrawing access bites on the next request rather
  than when the hour-long token expires. No session revocation is needed.
- **403, not 401.** The client discards its tokens on any 401. A waiting student
  would be signed out on every page load and never see why.
- **Admins are let in by their role.** The first admin is made by hand in SQL;
  a flag they forgot to set on themselves would lock out the only person who
  can grant it. The API refuses to "withdraw" an admin's access for the same
  reason. Promoting someone to editor or admin grants access too.
- **`is_active` is a different thing.** Off means the account cannot sign in at
  all. `access_granted` off means it can sign in and is told it is waiting.
- **The calendar feed is checked too.** Its URL is a bearer credential living in
  a calendar app, so `serveCalendar` looks up the token's owner on every poll
  and 404s once they are disabled or unapproved.
- **The anon key reaches no table.** It ships in the bundle, and the baseline
  had granted it `select` on companies, experiences, questions, comments, tags,
  seasons, announcements and attachments. The gate in the function meant nothing
  while `/rest/v1/companies` answered that key, so the access-gate migration
  drops those policies and revokes every table grant from `anon` and
  `authenticated`. The one thing left to the anon key is `keepalive()`, which
  returns `true` for the scheduled ping.
- **Grants are audited by hand.** `setUserAccess` writes its own `audit_log`
  row holding only the flag. The generic trigger records the whole row, and the
  whole row of `app_users` includes the password hash.

In the browser, every route except `/auth` and `/no-access` is wrapped in
`ProtectedRoute`: no session goes to `/auth`, a session without access goes to
`/no-access`. Those two pages use `GateShell` rather than `Layout`, because the
real shell links to and fetches things the visitor may not have. That is the
polite half; the gate above is the half that counts.

**What the gate does not cover: uploaded files.** Attachments are served by
Caddy from `mystorage.dileepadari.dev` at plain public URLs, with no check of
any kind. The API no longer hands those URLs to anyone unapproved, and the
filenames carry a random UUID, but a URL that has been copied out works for
anyone who has it. Closing that needs a change on the storage box (signed URLs,
or serving through an authenticated proxy), not in this repository.

### Roles

Three roles in the `app_role` enum: `admin`, `editor`, `viewer`. A user's role is
a row in `user_roles`; there is no email-domain rule. Every row below assumes
the account has been granted access.

| | viewer | editor | admin |
|---|---|---|---|
| Read companies, experiences, questions | yes | yes | yes |
| Contribute an experience or question | yes | yes | yes |
| Edit/delete **own** contribution | yes | yes | yes |
| Edit/delete **anyone's** contribution | no | yes | yes |
| Create/edit a company | no | yes | yes |
| Delete a company | no | no | yes |
| Manage users and roles | no | no | yes |
| Grant or withdraw access | no | no | yes |

`useAuth()` exposes `hasAccess` / `isAdmin` / `isEditor` / `canEdit` for **UI affordances only**.
Hiding a button is not authorization - the check that matters is the one in the
edge function route.

Which is why `tests/api` matters more than its line count suggests. Those 73 tests
exercise the function's authorization directly - one student cannot attach a file
to another's write-up, a viewer cannot edit someone else's contribution - and they
run against a real Postgres, not a mock, because the interesting failures are at
the boundary (grants, composite nulls, bcrypt). They skip themselves when no local
stack is listening, which is right for `npm test` on a laptop with no Docker and
was wrong for CI: **until the `api` job existed, none of them had ever run there.**

---

## Theming

Tokens are HSL triples in `src/index.css`: a `:root` block for light, a `.dark`
block for dark, and Tailwind reads them through `hsl(var(--token))` in
`tailwind.config.ts`. The palette is warm paper and oxide rather than shadcn's
default slate, because the app is read mostly as dense tables and a cool
near-black ground makes them look like an untouched scaffold.

Three token families beyond the shadcn set:

- `--phase-*`, one colour per placement phase, so the pill on a company card and
  the segment in a chart cannot drift apart.
- `--chart-1` through `--chart-6`, read at runtime by `useChartColors()` because
  Recharts wants real colour strings and cannot resolve a CSS variable.
- `--sidebar-*`, so the shell can differ from the page ground in dark mode.

`ThemeProvider` is `next-themes` in class mode, keyed `placetrack-theme`, default
`system`, with `disableTransitionOnChange` so the flip does not animate every
colour-transitioned element on the page at once (which reads as a rendering fault
rather than a deliberate change). The dark palette is written and validated
separately, not derived by inverting the light one.

A `prefers-reduced-motion` block collapses every duration to 0.01ms rather than
removing animations, which keeps layout that depends on a transition ending
intact.

## Seed data

`supabase/seed.sql` runs on every `supabase db reset` and is what the local stack,
the API tests, and the screenshots all share. It creates four accounts through
`app_signup()` (admin, editor, student and pending, all with the password
`placement123`, so the hashes are real bcrypt output rather than pasted
literals; the first three are granted access and `pending` is left waiting, so
the `/no-access` page is reachable locally), three seasons with
`2025-26` current, one company per phase so every branch of `resolvePhase()` has a
row, and a handful of experiences and questions.

Two shapes in it are deliberate and should survive any edit:

- **CTC is messy free text.** `11 LPA` sits next to `INR 34,05,000` because both
  forms occur live, and `lib/ctc.ts` has to parse both.
- **Several companies have no dates at all**, because 22 of the 59 live rows are
  in that state and code that only ever sees fully-populated rows breaks the first
  time it meets one.

It must never be applied to the hosted project.

## Audit trail

Writes to `companies`, `user_roles` and `announcements` are recorded by database
triggers, not by the API - so an action cannot happen without being logged,
including one taken through psql or the Supabase dashboard.

Attribution needs care. Every connection authenticates as the same service role,
so a trigger cannot tell who is behind a write. PostgREST exposes the request's
headers to SQL, and `dbAs(caller)` in `context.ts` returns a client that attaches
`x-actor-id`; the trigger reads it from `current_setting('request.headers')`.
**Any new write to an audited table must use `dbAs(caller)`, not `db`** - using
the plain client is not an error, it just silently records the change as
"outside the app".

## Seasons

The site is a dictionary of past placement cycles as well as a noticeboard for
the current one. A season is a year of hiring, running **August to July** (the
Indian academic year), keyed by a slug like `2024-25`.

**A `companies` row is one company's drive in one season, not a company.** The
same employer across three years is three rows. That was the whole decision:
splitting into `organisations` + `drives` reads better on a whiteboard, but all
six existing foreign keys - experiences, questions, comments, bookmarks,
applications, attachments - point at `companies`, so with this shape they all
become season-scoped for free and nothing had to be re-pointed.

Rows are linked across years by `org_slug`, derived by `org_slug_for(name)`,
which lowercases and strips repeated corporate suffixes so `Acme`,
`Acme Pvt. Ltd.` and `Acme India Private Limited` all reduce to `acme`. It is a
heuristic and it is stated as one in the UI - a company that genuinely renames
itself will not link up, and inventing a manual override for a rare case is
worse than the sentence under the panel.

Resolving "which season" happens once, in `resolveSeasonId(url)`:

| `?season=` | Result |
|---|---|
| absent | the current season |
| a known slug | that season |
| `all` | every season |
| an unknown slug | **nothing** |

That last row is deliberate. Answering a `?season=2019-20` URL with this year's
companies is how an archive stops being trustworthy - showing nothing is the
honest answer.

Things that are **not** scoped to the selected season, each for a reason:

- **The calendar feed** (`/calendar/{token}.ics`) always follows the *current*
  season. A subscription is a standing thing about upcoming dates; scoping it
  to a selection would mean resubscribing every August.
- **Bookmarks and applications** span every season, because a company saved
  last year should stay saved. Each row carries its season so the same name
  appearing three times is legible.
- **Admin dashboard counts** are all-time, with the selected season's company
  count shown underneath.

Writes take the season from the selector, never from the dates: creating a
company while viewing 2023-24 files it under 2023-24, and a CSV import matches
existing rows by name **within the target season only**. A database trigger
does infer a season from the deadline, but only as a fallback for rows that
arrive without one.

`is_current` is enforced single by a partial unique index, so
`setCurrentSeasonById` must clear the old flag before setting the new one -
the other order trips the index.

## Discussion and votes

Comments are one level deep by design: a reply to a reply is attached to the
same parent by the API, not by the client. Deeper threads read badly on a phone
and have no natural end.

Deleting a comment is a **soft** delete - the row survives so that replies keep
their context, but the body is blanked in the database and never sent to the
client. The `comments_body_length` check is deliberately conditional on
`is_deleted` for exactly this reason; an unconditional non-empty check makes
the blanking impossible and deletes fail with a constraint violation.

Editing is the author's alone, including for admins. A moderator removing a
comment is moderation; a moderator rewriting one is putting words in somebody's
mouth.

Vote scores are summed on read rather than kept in a counter column. A counter
drifts the first time a delete or a rollback misses it, and there is no point
at which a wrong count announces itself.

## Continuous integration

`.github/workflows/ci.yml`, three jobs:

- **web** - lint, typecheck, unit tests, the production build, and a check that
  `README-light.md` still matches `README.md`.
- **functions** - `deno check` over the edge function, with `--config` pointing at
  `supabase/functions/deno.json` (without it Deno finds the frontend's
  `package.json` and dies on supabase-js's transitive npm dependencies).
- **api** - `supabase start`, serve the function, poll `/health`, then run
  `tests/api`. Every job is time-bounded.

`ping.yaml` is separate: a scheduled request that keeps the free-tier Supabase
project from pausing.

## Documentation and screenshots

`README.md` is the dark-mode page and `README-light.md` its light twin, generated
by `scripts/build-light-readme.mjs` and checked by CI.

Screenshots live under `docs/screenshots/{dark,light}` and
`docs/screenshots/responsive/{dark,light}`, one file per screen with the same name
in both themes. They are real viewport renders against a **local** Supabase stack
seeded from `supabase/seed.sql` - never the live project - signed in through the
app's own login form as the seeded student account.

---

## Known operational gaps

- **No SMTP is configured.** Supabase's built-in mailer is limited to project
  members at 2 emails/hour, so password reset and email confirmation will not
  deliver to students until a real provider (Resend, Brevo, SES) is wired into
  Auth → SMTP Settings. The UI is built and will start working the moment it is.
- **Signup is open to any email address**, though an account now opens nothing
  until an admin approves it. Restricting who can even create one to IIIT-H
  domains is controlled by `app_settings.signup_allowed_domains`.
- **Nobody is told when an account is waiting.** With no SMTP there is no email
  to admins on signup or to the student on approval; admins find the queue
  under Admin, Users, "Waiting only".
- **Uploaded files are not behind the access gate.** See the note at the end of
  [the access gate](#the-access-gate).
- **The project ref changed.** `supabase/config.toml` previously pointed at
  `faynpnofvegarourkykh`, which no longer exists (NXDOMAIN). The live ref is
  `jwaqisnpxkavkkjzvutl`. If something references the old ref, it is stale.

---

## Runbooks

### Apply a migration

```sh
npm run db:push
# No generated types to refresh - update src/types/database.ts and
# src/lib/api.ts by hand if the change adds or renames a column.
```

Before any migration that is not purely additive, take a backup:

```sh
pg_dump "$DATABASE_URL" --data-only --schema=public > supabase/backups/$(date +%Y%m%d-%H%M%S).sql
```

Then verify the row count survived - the companies table is the canary:

```sh
curl -s "$VITE_SUPABASE_URL/rest/v1/companies?select=id" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Prefer: count=exact" -H "Range: 0-0" -I \
  | grep -i content-range
```

### Deploy the edge function

```sh
npm run fn:deploy
npx supabase secrets list      # confirm the storage secrets are present
```

### Rotate the storage box's JWT secret

Changing `JWT_SECRET` on the box invalidates PostgREST tokens for **every** app on
it. If you must: update `~/supabase-prod/docker/.env`, restart the whole stack,
then `npx supabase secrets set SELFHOST_JWT_SECRET=...` in every project that
uploads (placements, workos, portfolio).

---

## Contributors

| | | |
| --- | --- | --- |
| [Dileep Adari](https://github.com/Dileepadari) | author and maintainer | the application, the API, the schema |
| [Delhiproject0](https://github.com/Delhiproject0) | upstream owner | holds the upstream repository and merges releases |
