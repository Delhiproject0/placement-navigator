-- Per-student tracking: saved companies, and where you are in each drive.
--
-- Both are private to the owner. Nothing here is readable through the anon
-- key at all - which drive a student is interviewing for is exactly the kind
-- of thing that should not leak sideways.

-- ============================================================================
-- Bookmarks
-- ============================================================================

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Saving the same company twice is meaningless; the API upserts on this.
  unique (user_id, company_id)
);

create index if not exists idx_bookmarks_user_id on public.bookmarks (user_id);

-- ============================================================================
-- Applications
--
-- A student's own progress, which is not the same thing as the company's
-- phase: the drive can be at "interviews done" while you personally were
-- rejected at the OA.
-- ============================================================================

do $$ begin
  create type public.application_stage as enum (
    'interested',
    'applied',
    'shortlisted',
    'oa',
    'interviewing',
    'offered',
    'rejected',
    'withdrawn',
    'accepted'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  stage public.application_stage not null default 'interested',
  notes text,
  applied_at timestamptz,
  outcome_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index if not exists idx_applications_user_id on public.applications (user_id);
create index if not exists idx_applications_company_id on public.applications (company_id);

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Stamps the timestamps that go with a stage change, so the API does not have
-- to remember to and they cannot drift out of step with the stage itself.
create or replace function public.applications_stamp_stage()
returns trigger
language plpgsql
as $$
begin
  if new.stage <> old.stage or tg_op = 'INSERT' then
    if new.stage = 'applied' and new.applied_at is null then
      new.applied_at = now();
    end if;
    if new.stage in ('offered', 'rejected', 'withdrawn', 'accepted') and new.outcome_at is null then
      new.outcome_at = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_stamp_stage on public.applications;
create trigger applications_stamp_stage
  before insert or update on public.applications
  for each row execute function public.applications_stamp_stage();

-- ============================================================================
-- Access
-- ============================================================================

alter table public.bookmarks enable row level security;
alter table public.applications enable row level security;

-- No policies, and no grant to anon/authenticated: these tables are reachable
-- only through the API, which scopes every query to the calling user.
revoke all on public.bookmarks from anon, authenticated;
revoke all on public.applications from anon, authenticated;

grant all on public.bookmarks to service_role;
grant all on public.applications to service_role;
