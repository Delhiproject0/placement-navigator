-- Placement seasons: make the whole site an archive, not just a snapshot.
--
-- MODELLING NOTE (the important part of this file)
--
-- A company row is a company's drive *in one season*, not the company itself.
-- The same organisation visiting in 2024-25 and 2025-26 is two rows, linked by
-- `org_slug`.
--
-- The alternative - splitting into `organisations` + `drives` - was considered
-- and rejected. Every existing foreign key points at `companies`
-- (interview_experiences, interview_questions, attachments, bookmarks,
-- applications, company_tags), and under this shape they all become correctly
-- season-scoped for free: an interview experience written in 2023 hangs off the
-- 2023 row and can never surface under 2025. Splitting the table would have
-- required repointing all six and rewriting every join, for the same result.
--
-- The cost is that org-level fields (logo, website) repeat per season. That is
-- acceptable, and often right: packages, roles and even branding change year to
-- year, and an archive should show what was true *then*.

-- ============================================================================
-- Seasons
-- ============================================================================

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  -- "2025-26". Sorts chronologically as text, which is why it leads with the year.
  slug text not null unique check (slug ~ '^\d{4}-\d{2}$'),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  /**
   * Exactly one season is current - it is what a first-time visitor sees.
   * Enforced by the partial unique index below rather than by convention,
   * because "two current seasons" is a state nothing else in the app can
   * sensibly resolve.
   */
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on)
);

create unique index if not exists idx_seasons_single_current
  on public.seasons (is_current)
  where is_current;

create index if not exists idx_seasons_slug on public.seasons (slug desc);

/**
 * The Indian placement season runs August to July, so a drive in March 2026
 * belongs to 2025-26 rather than to 2026-27.
 */
create or replace function public.season_slug_for(_at timestamptz)
returns text
language sql
immutable
as $$
  select case
    when extract(month from _at) >= 8
      then to_char(_at, 'YYYY') || '-' || to_char(_at + interval '1 year', 'YY')
    else to_char(_at - interval '1 year', 'YYYY') || '-' || to_char(_at, 'YY')
  end;
$$;

/** Creates a season if it does not exist, and returns its id. */
create or replace function public.ensure_season(_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
  _start_year integer;
begin
  select id into _id from public.seasons where slug = _slug;
  if _id is not null then return _id; end if;

  _start_year := split_part(_slug, '-', 1)::integer;

  insert into public.seasons (slug, label, starts_on, ends_on)
  values (
    _slug,
    _slug,
    make_date(_start_year, 8, 1),
    make_date(_start_year + 1, 7, 31)
  )
  returning id into _id;

  return _id;
end;
$$;

-- ============================================================================
-- Companies gain a season and a stable cross-season identity
-- ============================================================================

alter table public.companies
  add column if not exists season_id uuid references public.seasons (id) on delete restrict,
  add column if not exists org_slug text;

/**
 * Normalised company name, used to follow one organisation across seasons.
 *
 * Strips punctuation and the usual suffixes so "Acme Inc." and "Acme" are the
 * same organisation. Deliberately not a foreign key to an organisations table:
 * a typo in one year should not silently attach that year's drive to the wrong
 * company, and this is trivially correctable by editing the name.
 */
create or replace function public.org_slug_for(_name text)
returns text
language sql
immutable
as $$
  select nullif(
    -- 3. Trim the dashes left behind at either end by the replacements above.
    trim(both '-' from
      -- 2. Everything that is not a letter or digit becomes a separator.
      regexp_replace(
        -- 1. Strip *any run* of trailing corporate suffixes, so
        --    "Acme Technologies Pvt. Ltd." and "Acme" are one organisation.
        --    The outer + is what makes it a run rather than a single word.
        regexp_replace(
          lower(trim(_name)),
          '([[:space:],.]+(pvt|private|ltd|limited|inc|llc|llp|corp|corporation|technologies|technology|labs|india)\.?)+$',
          '',
          'g'
        ),
        '[^a-z0-9]+', '-', 'g'
      )
    ),
    ''
  );
$$;

-- ============================================================================
-- Backfill
--
-- Season is inferred from the drive's own dates, falling back to when the row
-- was created. Against the live data this puts all 59 rows in 2025-26, which
-- matches the actual season they were entered for.
-- ============================================================================

do $$
declare
  _row record;
  _slug text;
begin
  for _row in select id, name, created_at, registration_deadline, ppt_datetime,
                     oa_datetime, interview_datetime, visit_date
              from public.companies where season_id is null
  loop
    _slug := public.season_slug_for(
      coalesce(
        greatest(
          _row.registration_deadline,
          _row.ppt_datetime,
          _row.oa_datetime,
          _row.interview_datetime,
          _row.visit_date::timestamptz
        ),
        _row.created_at
      )
    );

    update public.companies
      set season_id = public.ensure_season(_slug),
          org_slug = coalesce(org_slug, public.org_slug_for(_row.name))
      where id = _row.id;
  end loop;
end $$;

-- Make sure there is always a season to fall back to, even on an empty database.
select public.ensure_season(public.season_slug_for(now()));

/**
 * The newest season that actually has companies becomes current.
 *
 * Picking the newest season outright is wrong: `ensure_season(now())` above
 * guarantees the calendar-current season exists, so on any date after a season
 * rolls over that would make an empty season current and show every visitor a
 * blank site. Falling back to the newest only when nothing has companies at
 * all covers a fresh database.
 */
update public.seasons
  set is_current = true
  where not exists (select 1 from public.seasons where is_current)
    and id = coalesce(
      (select s.id
         from public.seasons s
         join public.companies c on c.season_id = s.id
        group by s.id, s.slug
        order by s.slug desc
        limit 1),
      (select id from public.seasons order by slug desc limit 1)
    );

-- ============================================================================
-- Constraints, now that every row has values
-- ============================================================================

alter table public.companies alter column season_id set not null;
alter table public.companies alter column org_slug set not null;

-- One drive per organisation per season. A second "Acme" in the same year is a
-- duplicate, not a second drive.
create unique index if not exists idx_companies_season_org
  on public.companies (season_id, org_slug);

create index if not exists idx_companies_season on public.companies (season_id);
create index if not exists idx_companies_org_slug on public.companies (org_slug);

/**
 * Keeps org_slug in step with the name.
 *
 * Without this, renaming a company would silently detach it from its own
 * history - the row would still be there, but the previous seasons would stop
 * being findable.
 */
/**
 * Fills in the season when an insert does not name one.
 *
 * Everything that creates a company - the form, the CSV importer, the seed -
 * is working in "this season" unless it says otherwise, and requiring the
 * caller to look the id up first would just move the same default into three
 * places where they could disagree.
 */
create or replace function public.companies_default_season()
returns trigger
language plpgsql
as $$
begin
  if new.season_id is null then
    select id into new.season_id from public.seasons where is_current;
    if new.season_id is null then
      new.season_id := public.ensure_season(public.season_slug_for(now()));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_default_season on public.companies;
create trigger companies_default_season
  before insert on public.companies
  for each row execute function public.companies_default_season();

create or replace function public.companies_set_org_slug()
returns trigger
language plpgsql
as $$
begin
  new.org_slug := public.org_slug_for(new.name);
  if new.org_slug is null then
    raise exception 'COMPANY_NAME_EMPTY' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_org_slug on public.companies;
create trigger companies_org_slug
  before insert or update of name on public.companies
  for each row execute function public.companies_set_org_slug();

-- ============================================================================
-- Access
-- ============================================================================

alter table public.seasons enable row level security;

drop policy if exists "seasons_public_read" on public.seasons;
create policy "seasons_public_read" on public.seasons for select using (true);

grant select on public.seasons to anon, authenticated;
grant all on public.seasons to service_role;

revoke all on function public.ensure_season(text) from public, anon, authenticated;
grant execute on function public.ensure_season(text) to service_role;
