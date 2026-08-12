# PlaceTrack - developer documentation

Architecture, operational runbooks, and the things that are non-obvious from
reading the code. For setup and scripts, see [README.md](./README.md).

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
| `SELFHOST_JWT_SECRET` | `JWT_SECRET` from `~/supabase-prod/docker/.env` on the storage box |
| `ORACLE_UPLOAD_BASE_URL` | `https://supabase.dileepadari.dev` |
| `ORACLE_UPLOAD_PATH` | `/functions/v1/upload` |
| `ORACLE_PUBLIC_BASE_URL` | `https://mystorage.dileepadari.dev` |
| `ORACLE_APP_NAME` | `placements` |
| `REMINDER_CRON_SECRET` | `openssl rand -hex 32` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected into edge functions
automatically - do not set them yourself.

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

Three roles in the `app_role` enum: `admin`, `editor`, `viewer`. A user's role is
a row in `user_roles`; there is no email-domain rule.

| | viewer | editor | admin |
|---|---|---|---|
| Read companies, experiences, questions | yes (so can anonymous) | yes | yes |
| Contribute an experience or question | yes | yes | yes |
| Edit/delete **own** contribution | yes | yes | yes |
| Edit/delete **anyone's** contribution | no | yes | yes |
| Create/edit a company | no | yes | yes |
| Delete a company | no | no | yes |
| Manage users and roles | no | no | yes |

`useAuth()` exposes `isAdmin` / `isEditor` / `canEdit` for **UI affordances only**.
Hiding a button is not authorization - the check that matters is the one in the
edge function route.

---

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

## Known operational gaps

- **No SMTP is configured.** Supabase's built-in mailer is limited to project
  members at 2 emails/hour, so password reset and email confirmation will not
  deliver to students until a real provider (Resend, Brevo, SES) is wired into
  Auth → SMTP Settings. The UI is built and will start working the moment it is.
- **Signup is open to any email address.** Restricting to IIIT-H domains is
  controlled by `app_settings.signup_allowed_domains`, enforced by a trigger.
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
