-- Baseline: the schema as it already exists in the live project.
--
-- Nothing here is new. The tables, enums and helper functions below were
-- created through the dashboard and were never captured in version control,
-- which meant the repository could not reproduce its own database - the only
-- migration that existed was an ALTER against tables no migration created.
--
-- Everything is guarded so this is a no-op against the live database and a
-- full build against a fresh one (`supabase db reset`, CI, local dev).

-- ============================================================================
-- Extensions
-- ============================================================================

-- pgcrypto is normally already present in the `extensions` schema on Supabase;
-- this only creates it on a plain Postgres. Either way the auth functions
-- resolve it by putting `extensions` on their search_path rather than assuming
-- a location.
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema public;

-- ============================================================================
-- Enums
-- ============================================================================

do $$ begin
  create type public.app_role as enum ('admin', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.placement_status as enum ('upcoming', 'ongoing', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  logo_url text,
  website_url text,
  external_form text,
  visit_date date,
  registration_deadline timestamptz,
  ppt_datetime timestamptz,
  oa_datetime timestamptz,
  interview_datetime timestamptz,
  offered_ctc text,
  ctc_distribution text,
  cgpa_cutoff numeric(3, 2),
  roles text[],
  people_selected integer,
  status public.placement_status not null default 'upcoming',
  bond_details text,
  job_location text,
  eligibility_criteria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  role public.app_role not null default 'viewer'
);

create table if not exists public.interview_experiences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid,
  round_name text not null,
  experience text not null,
  difficulty text,
  result text,
  tips text,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid,
  question text not null,
  answer text,
  topic text,
  question_type text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists idx_companies_registration_deadline
  on public.companies (registration_deadline);
create index if not exists idx_companies_status on public.companies (status);
create index if not exists idx_experiences_company_id
  on public.interview_experiences (company_id);
create index if not exists idx_experiences_user_id
  on public.interview_experiences (user_id);
create index if not exists idx_questions_company_id
  on public.interview_questions (company_id);
create index if not exists idx_questions_user_id
  on public.interview_questions (user_id);

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Role helpers
--
-- These back the existing RLS policies. They are security definer so that a
-- policy can read user_roles without the calling user needing access to it,
-- and they pin search_path so a caller cannot shadow `public` with their own
-- schema and change what the function resolves to.
-- ============================================================================

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

create or replace function public.can_edit(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role in ('admin', 'editor')
  );
$$;

-- ============================================================================
-- Row level security
--
-- Every table stays RLS-enabled. Reads are public because the site is a public
-- placement calendar; writes go through the edge function's service-role
-- client, which bypasses RLS - so these policies are the backstop that keeps
-- the anon key read-only if a route is ever missed.
-- ============================================================================

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.interview_experiences enable row level security;
alter table public.interview_questions enable row level security;

drop policy if exists "companies_public_read" on public.companies;
create policy "companies_public_read" on public.companies for select using (true);

drop policy if exists "experiences_public_read" on public.interview_experiences;
create policy "experiences_public_read" on public.interview_experiences for select using (true);

drop policy if exists "questions_public_read" on public.interview_questions;
create policy "questions_public_read" on public.interview_questions for select using (true);

-- profiles and user_roles are deliberately not readable by the anon key: they
-- are the personal-data tables, and everything that needs them reads through
-- the edge function.

-- Table-level grants, stated explicitly rather than inherited from Supabase's
-- default privileges. Without these the RLS policies above are unreachable -
-- a policy can only narrow access that a GRANT already allows - and a fresh
-- `db reset` would behave differently from the live database.
--
-- Read-only, and only for the public-content tables. The anon key can do
-- nothing else: every write goes through the edge function's service-role
-- client, which bypasses RLS entirely.
grant usage on schema public to anon, authenticated;
grant select on public.companies to anon, authenticated;
grant select on public.interview_experiences to anon, authenticated;
grant select on public.interview_questions to anon, authenticated;

revoke insert, update, delete on public.companies from anon, authenticated;
revoke insert, update, delete on public.interview_experiences from anon, authenticated;
revoke insert, update, delete on public.interview_questions from anon, authenticated;
revoke all on public.profiles from anon, authenticated;
revoke all on public.user_roles from anon, authenticated;

-- service_role is the API's identity and needs full access to everything it
-- fronts. Stated explicitly rather than relying on Supabase's default
-- privileges, which are configuration and differ between a local stack and a
-- hosted project - a difference that otherwise only shows up at runtime.
grant all on public.companies to service_role;
grant all on public.profiles to service_role;
grant all on public.user_roles to service_role;
grant all on public.interview_experiences to service_role;
grant all on public.interview_questions to service_role;
