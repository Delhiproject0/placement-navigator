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

The anon key is public by design. Anyone can read it out of the deployed bundle.
Row-level security is the only thing protecting data - never treat the anon key
as a secret, and never rely on a client-side role check for authorization.

### Server-side (`.env`, no `VITE_` prefix - never bundled)

| Variable | Where it comes from | Needed for |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens | `link`, `db push`, `functions deploy`, `secrets set`, `gen types` |
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
npm run gen:types      # always, immediately after
git add src/integrations/supabase/types.ts && git commit
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
