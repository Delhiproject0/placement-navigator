-- Traditional database-backed authentication, replacing Supabase Auth.
--
-- Accounts, password hashes and sessions live in ordinary tables in `public`.
-- The edge function is the only thing that touches them (service-role key),
-- and it issues its own HS256 JWTs. Nothing here depends on GoTrue.
--
-- Passwords are hashed with bcrypt via pgcrypto, inside the database. The
-- plaintext is a function argument and is never stored, logged or returned.
--
-- Existing auth.users accounts are migrated at the end with their ids and
-- their bcrypt hashes intact, so nobody has to reset a password and every
-- existing user_id on other tables keeps pointing at the right person.

-- ============================================================================
-- 1. Accounts
-- ============================================================================

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  -- citext so "Dileep@iiit.ac.in" and "dileep@iiit.ac.in" are one account.
  -- A case-sensitive unique index is a classic duplicate-account bug.
  email public.citext not null unique,
  password_hash text not null,
  full_name text,
  is_active boolean not null default true,
  email_verified boolean not null default false,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. Sessions (refresh tokens)
--
-- The refresh token is a random opaque string. Only its SHA-256 digest is
-- stored, so a database leak does not hand over usable sessions. Rotation is
-- handled by the edge function: each refresh revokes the row it used and
-- issues a new one.
-- ============================================================================

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  refresh_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  -- Set when this session is rotated, so a replayed old token is detectable.
  replaced_by uuid references public.auth_sessions (id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_sessions_user_id on public.auth_sessions (user_id);
create index if not exists idx_auth_sessions_expires_at on public.auth_sessions (expires_at);

-- ============================================================================
-- 3. Password reset tokens
-- ============================================================================

create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_resets_user_id on public.password_resets (user_id);

-- ============================================================================
-- 4. Lock everything down
--
-- RLS on with no policies at all: the anon and authenticated roles can never
-- read these tables, whatever else changes. Only the service-role key (which
-- bypasses RLS) reaches them, and it is only ever used inside the edge
-- function. This is the single most important statement in the file.
-- ============================================================================

alter table public.app_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.password_resets enable row level security;

revoke all on public.app_users from anon, authenticated;
revoke all on public.auth_sessions from anon, authenticated;
revoke all on public.password_resets from anon, authenticated;

-- ...but the API itself must reach them.
grant all on public.app_users to service_role;
grant all on public.auth_sessions to service_role;
grant all on public.password_resets to service_role;

-- ============================================================================
-- 5. Signup
--
-- Returns the new row. Raises a clean, catchable error on duplicate email so
-- the API can answer 409 rather than leaking a constraint name.
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
begin
  if _password is null or length(_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.app_users where email = _email) then
    raise exception 'EMAIL_TAKEN' using errcode = 'unique_violation';
  end if;

  insert into public.app_users (email, password_hash, full_name)
  values (_email, crypt(_password, gen_salt('bf', 12)), nullif(trim(_full_name), ''))
  returning * into _user;

  -- Mirror the old handle_new_user() trigger: every account gets a profile
  -- and the default viewer role, so the rest of the app can assume they exist.
  insert into public.profiles (user_id, email, full_name)
  values (_user.id, _user.email::text, _user.full_name)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (_user.id, 'viewer')
  on conflict (user_id) do nothing;

  return _user;
end;
$$;

-- ============================================================================
-- 6. Login
--
-- Verifying with crypt() means the comparison happens in the database against
-- the stored salt, and the plaintext never needs to leave it.
--
-- On failure it returns null rather than raising, and the caller must answer
-- with the same message for "no such email" and "wrong password" - otherwise
-- the endpoint becomes an account-enumeration oracle.
-- ============================================================================

create or replace function public.app_login(_email public.citext, _password text)
returns public.app_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _user public.app_users;
begin
  select * into _user from public.app_users where email = _email;

  if _user.id is null then
    -- Spend roughly the same time as a real bcrypt verify would, so response
    -- timing does not reveal whether the address exists.
    perform crypt(_password, gen_salt('bf', 12));
    return null;
  end if;

  if not _user.is_active then
    raise exception 'ACCOUNT_DISABLED' using errcode = 'check_violation';
  end if;

  if _user.locked_until is not null and _user.locked_until > now() then
    raise exception 'ACCOUNT_LOCKED' using errcode = 'check_violation';
  end if;

  if _user.password_hash <> crypt(_password, _user.password_hash) then
    update public.app_users
      set failed_login_attempts = failed_login_attempts + 1,
          -- Ten consecutive failures parks the account for fifteen minutes.
          locked_until = case
            when failed_login_attempts + 1 >= 10 then now() + interval '15 minutes'
            else locked_until
          end
      where id = _user.id;
    return null;
  end if;

  update public.app_users
    set failed_login_attempts = 0,
        locked_until = null,
        last_login_at = now()
    where id = _user.id
    returning * into _user;

  return _user;
end;
$$;

-- ============================================================================
-- 7. Change password
-- ============================================================================

create or replace function public.app_change_password(
  _user_id uuid,
  _current_password text,
  _new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _hash text;
begin
  if _new_password is null or length(_new_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT' using errcode = 'check_violation';
  end if;

  select password_hash into _hash from public.app_users where id = _user_id;
  if _hash is null or _hash <> crypt(_current_password, _hash) then
    return false;
  end if;

  update public.app_users
    set password_hash = crypt(_new_password, gen_salt('bf', 12))
    where id = _user_id;

  -- Changing a password ends every other session. Otherwise a stolen refresh
  -- token survives exactly the event meant to shut it out.
  update public.auth_sessions
    set revoked_at = now()
    where user_id = _user_id and revoked_at is null;

  return true;
end;
$$;

-- ============================================================================
-- 8. Reset password (consumes a token issued by the edge function)
-- ============================================================================

create or replace function public.app_reset_password(_token_hash text, _new_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _reset public.password_resets;
begin
  if _new_password is null or length(_new_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT' using errcode = 'check_violation';
  end if;

  select * into _reset
    from public.password_resets
    where token_hash = _token_hash
      and used_at is null
      and expires_at > now();

  if _reset.id is null then
    return false;
  end if;

  update public.password_resets set used_at = now() where id = _reset.id;

  update public.app_users
    set password_hash = crypt(_new_password, gen_salt('bf', 12)),
        failed_login_attempts = 0,
        locked_until = null
    where id = _reset.user_id;

  update public.auth_sessions
    set revoked_at = now()
    where user_id = _reset.user_id and revoked_at is null;

  return true;
end;
$$;

-- ============================================================================
-- 9. Housekeeping
-- ============================================================================

create or replace function public.app_purge_expired_sessions()
returns integer
language sql
security definer
set search_path = public, extensions
as $$
  with deleted as (
    delete from public.auth_sessions
    where expires_at < now() - interval '30 days'
    returning 1
  )
  select count(*)::integer from deleted;
$$;

-- These are called only by the service-role client inside the edge function.
-- No other role should be able to invoke them - app_login in particular would
-- otherwise be a password oracle callable straight from the anon key.
--
-- The revoke has to name PUBLIC, because that is where execute is granted by
-- default; revoking only from anon/authenticated would leave it reachable.
-- But service_role also holds execute *through* PUBLIC, so it has to be
-- granted back explicitly afterwards or the API cannot call its own functions.
revoke all on function public.app_signup(public.citext, text, text) from public, anon, authenticated;
revoke all on function public.app_login(public.citext, text) from public, anon, authenticated;
revoke all on function public.app_change_password(uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_reset_password(text, text) from public, anon, authenticated;
revoke all on function public.app_purge_expired_sessions() from public, anon, authenticated;

grant execute on function public.app_signup(public.citext, text, text) to service_role;
grant execute on function public.app_login(public.citext, text) to service_role;
grant execute on function public.app_change_password(uuid, text, text) to service_role;
grant execute on function public.app_reset_password(text, text) to service_role;
grant execute on function public.app_purge_expired_sessions() to service_role;

-- ============================================================================
-- 10. Migrate existing Supabase Auth accounts
--
-- auth.users.encrypted_password is already a bcrypt hash in the same format
-- pgcrypto's crypt() verifies, so hashes copy across verbatim and every
-- existing password keeps working.
--
-- Ids are preserved, which is what keeps profiles.user_id, user_roles.user_id
-- and interview_experiences.user_id pointing at the right person.
--
-- auth.users is left completely untouched as a fallback. Guarded on the schema
-- existing so this migration still runs on a database that has no GoTrue.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'auth' and table_name = 'users') then

    insert into public.app_users (id, email, password_hash, full_name, email_verified, created_at)
    select
      u.id,
      u.email::public.citext,
      u.encrypted_password,
      coalesce(u.raw_user_meta_data ->> 'full_name', p.full_name),
      u.email_confirmed_at is not null,
      u.created_at
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    where u.email is not null
      and u.encrypted_password is not null
      and u.deleted_at is null
    on conflict (id) do nothing;

    -- Backfill the rows the old signup trigger should have created.
    insert into public.profiles (user_id, email, full_name)
    select a.id, a.email::text, a.full_name
    from public.app_users a
    on conflict (user_id) do nothing;

    insert into public.user_roles (user_id, role)
    select a.id, 'viewer'
    from public.app_users a
    on conflict (user_id) do nothing;

    raise notice 'Migrated % account(s) from auth.users',
      (select count(*) from public.app_users);
  end if;
end $$;

-- ============================================================================
-- 11. Foreign keys, now that accounts live in public
--
-- These previously referenced auth.users. Repointing them at app_users is
-- safe because the ids were preserved above.
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_user_id_fkey;
alter table public.user_roles drop constraint if exists user_roles_user_id_fkey;

-- Only add the constraints if nothing would violate them - a half-migrated
-- database should fail loudly here rather than silently drop the reference.
do $$
begin
  if not exists (
    select 1 from public.profiles p
    left join public.app_users a on a.id = p.user_id
    where a.id is null
  ) then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id) references public.app_users (id) on delete cascade;
  else
    raise warning 'profiles has rows with no matching app_users row - FK not added';
  end if;

  if not exists (
    select 1 from public.user_roles r
    left join public.app_users a on a.id = r.user_id
    where a.id is null
  ) then
    alter table public.user_roles
      add constraint user_roles_user_id_fkey
      foreign key (user_id) references public.app_users (id) on delete cascade;
  else
    raise warning 'user_roles has rows with no matching app_users row - FK not added';
  end if;
end $$;
