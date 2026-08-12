-- Converge the shape the live database actually has onto the shape the
-- baseline describes.
--
-- The baseline is written with `create table if not exists`, which makes it
-- safe to run against the live database but also means it *skips* tables that
-- already exist - so any difference between the live schema and the baseline's
-- definition silently survives. This migration closes the differences that
-- were found when the baseline was first applied to the real project.
--
-- Everything here is conditional, so it is a no-op on a database created from
-- the baseline itself.

-- ============================================================================
-- user_roles: one role per user
--
-- The live table was created with `unique (user_id, role)`, which models a
-- user holding several roles at once. The application does not: `getCaller`
-- reads a single role, the admin screen sets a single role, and `has_role`
-- is only ever asked about one. A user with both 'viewer' and 'editor' would
-- get whichever row came back first.
--
-- The mismatch surfaced as `ON CONFLICT (user_id)` failing with "no unique or
-- exclusion constraint matching the ON CONFLICT specification", because the
-- composite constraint does not match a conflict target of (user_id) alone.
-- ============================================================================

do $$
declare
  has_user_id_unique boolean;
begin
  select exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.user_roles'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.user_roles'::regclass and attname = 'user_id')
      ]::smallint[]
  ) into has_user_id_unique;

  if has_user_id_unique then
    return;
  end if;

  -- Collapse to the strongest role each user holds, so nobody is demoted by
  -- the deduplication. On the live data every user already has exactly one
  -- row, which makes this a no-op there, but it must be correct regardless.
  delete from public.user_roles r
  where exists (
    select 1
    from public.user_roles keep
    where keep.user_id = r.user_id
      and (
        case keep.role when 'admin' then 3 when 'editor' then 2 else 1 end,
        keep.id
      ) > (
        case r.role when 'admin' then 3 when 'editor' then 2 else 1 end,
        r.id
      )
  );

  alter table public.user_roles
    drop constraint if exists user_roles_user_id_role_key;

  alter table public.user_roles
    add constraint user_roles_user_id_key unique (user_id);
end $$;

-- ============================================================================
-- profiles: the unique the backfill relies on
--
-- Present on the live table already, but a database restored from an older
-- dump would not have it, and the backfill in the next migration conflicts on
-- exactly this column.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'u'
      and conkey = array[
        (select attnum from pg_attribute
         where attrelid = 'public.profiles'::regclass and attname = 'user_id')
      ]::smallint[]
  ) then
    -- Two profiles for one person is already broken; keep the earliest.
    delete from public.profiles p
    where exists (
      select 1 from public.profiles keep
      where keep.user_id = p.user_id and keep.created_at < p.created_at
    );

    alter table public.profiles
      add constraint profiles_user_id_key unique (user_id);
  end if;
end $$;
