# Database

```
migrations/   applied in filename order, timestamp-prefixed
backups/      data exports taken before schema changes
functions/    edge functions
```

## Adding a migration

```sh
npx supabase migration new short_description
# edit the generated file
npm run db:push
```

The filename prefix must be a full 14-digit timestamp
(`YYYYMMDDHHMMSS_name.sql`). The CLI rejects short prefixes on `db push` - an
earlier migration in this repo had `20251204_` and could never be applied.

## Rules

**Every migration must be re-runnable.** Use `create table if not exists`,
`add column if not exists`, and `drop policy if exists` before `create policy`.
Migrations get replayed against fresh databases by `db reset` and by CI.

**Every new table needs RLS in the same migration that creates it.**

```sql
alter table public.thing enable row level security;

create policy "thing_select" on public.thing
  for select using (true);

create policy "thing_write" on public.thing
  for all using (public.can_edit(auth.uid())) with check (public.can_edit(auth.uid()));
```

RLS off means world-writable through the public anon key. RLS on with no policy
means nobody can read it. Neither is what you want by accident.

**Back up before anything non-additive.** There is live student-contributed data
here. `companies` is the canary - check its row count before and after.

**Don't extend `placement_status`.** Adding a value to a Postgres enum cannot be
rolled back in a transaction. The seven-value display vocabulary is a separate
type computed by `public.company_phase()`; the stored column stays as the
four-value lifecycle override.
