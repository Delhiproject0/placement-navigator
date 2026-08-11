-- Announcements, site settings and an audit trail.
--
-- These are the pieces that make the admin role mean something beyond
-- promoting users: a way to say something to everyone, a way to change how
-- signup behaves without a deploy, and a record of who did what.

-- ============================================================================
-- Announcements
-- ============================================================================

do $$ begin
  create type public.announcement_severity as enum ('info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  severity public.announcement_severity not null default 'info',
  pinned boolean not null default false,
  publish_at timestamptz not null default now(),
  -- Null means it never expires. A dated announcement that nobody remembers to
  -- take down is the usual failure of a banner like this.
  expires_at timestamptz,
  author_id uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_announcements_window
  on public.announcements (publish_at, expires_at);

drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

-- Readable by anyone, but only while live. Writes go through the API.
drop policy if exists "announcements_public_read" on public.announcements;
create policy "announcements_public_read" on public.announcements
  for select using (
    publish_at <= now() and (expires_at is null or expires_at > now())
  );

grant select on public.announcements to anon, authenticated;
grant all on public.announcements to service_role;

-- ============================================================================
-- Site settings
--
-- A single row, so a setting can change without a deploy. The id check is what
-- keeps it single - otherwise "the settings" quietly becomes ambiguous.
-- ============================================================================

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  /**
   * Empty array means anyone may sign up. Non-empty restricts registration to
   * these email domains, which is how this becomes an IIIT-H-only portal
   * without hard-coding a rule.
   */
  signup_allowed_domains text[] not null default '{}',
  signup_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant all on public.app_settings to service_role;

-- ============================================================================
-- Enforce the signup policy in the database
--
-- Checking only in the API would leave the rule dependent on every future
-- caller remembering it. app_signup is the single door in, so the check goes
-- there.
-- ============================================================================

create or replace function public.app_signup(
  _email public.citext,
  _password text,
  _full_name text default null
)
returns public.app_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _user public.app_users;
  _settings public.app_settings;
  _domain text;
begin
  select * into _settings from public.app_settings where id;

  if _settings.id is not null and not _settings.signup_enabled then
    raise exception 'SIGNUP_DISABLED' using errcode = 'check_violation';
  end if;

  if _settings.id is not null and array_length(_settings.signup_allowed_domains, 1) > 0 then
    _domain := lower(split_part(_email::text, '@', 2));
    if not (_domain = any (
      select lower(unnest(_settings.signup_allowed_domains))
    )) then
      raise exception 'DOMAIN_NOT_ALLOWED' using errcode = 'check_violation';
    end if;
  end if;

  if _password is null or length(_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.app_users where email = _email) then
    raise exception 'EMAIL_TAKEN' using errcode = 'unique_violation';
  end if;

  insert into public.app_users (email, password_hash, full_name)
  values (_email, crypt(_password, gen_salt('bf', 12)), nullif(trim(_full_name), ''))
  returning * into _user;

  insert into public.profiles (user_id, email, full_name)
  values (_user.id, _user.email::text, _user.full_name)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (_user.id, 'viewer')
  on conflict (user_id) do nothing;

  return _user;
end;
$$;

revoke all on function public.app_signup(public.citext, text, text) from public, anon, authenticated;
grant execute on function public.app_signup(public.citext, text, text) to service_role;

-- ============================================================================
-- Audit log
--
-- Written by triggers rather than by the API, so an action cannot be performed
-- without being recorded - including through psql or the dashboard.
-- ============================================================================

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  -- Taken from the x-actor-id request header the API attaches; null for
  -- anything done outside the app.
  actor_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on public.audit_log (created_at desc);
create index if not exists idx_audit_log_record on public.audit_log (table_name, record_id);

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _actor uuid;
begin
  /**
   * Who did this.
   *
   * PostgREST exposes the request's headers as a GUC, and the API attaches
   * `x-actor-id` on every authenticated write - which is how a trigger can
   * attribute a change even though every connection authenticates as the same
   * service role. Falls back to a session setting for anything run through
   * psql, and to null for anything that supplies neither.
   *
   * Wrapped because both settings are absent outside a request, and a failure
   * to identify the actor must never block the write it is recording.
   */
  begin
    _actor := nullif(
      coalesce(
        current_setting('request.headers', true)::json ->> 'x-actor-id',
        current_setting('app.actor_id', true)
      ),
      ''
    )::uuid;
  exception when others then
    _actor := null;
  end;

  insert into public.audit_log (table_name, record_id, action, actor_id, before, after)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null),
    tg_op,
    _actor,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists companies_audit on public.companies;
create trigger companies_audit
  after insert or update or delete on public.companies
  for each row execute function public.audit_trigger();

drop trigger if exists user_roles_audit on public.user_roles;
create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.audit_trigger();

drop trigger if exists announcements_audit on public.announcements;
create trigger announcements_audit
  after insert or update or delete on public.announcements
  for each row execute function public.audit_trigger();

alter table public.audit_log enable row level security;
-- No policy and no grant: the log is admin-only and read through the API. It is
-- never client-writable, because a trail anyone can edit is not a trail.
revoke all on public.audit_log from anon, authenticated;
grant select, insert on public.audit_log to service_role;
grant usage on sequence public.audit_log_id_seq to service_role;
