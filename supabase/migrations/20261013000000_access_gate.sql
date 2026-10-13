-- Admin-granted access.
--
-- Until now an account was enough: anyone who could sign up could read the
-- site, and most of it could be read with no account at all. The content is
-- internal to the institute, so signing in is no longer what lets someone in.
-- An admin has to grant access to each account, and until they do the API
-- answers every content route with 403 ACCESS_PENDING.
--
-- The flag is separate from `is_active` on purpose. `is_active = false` means
-- "this account may not sign in at all"; `access_granted = false` means "this
-- person can sign in, and is told they are waiting". Folding the two together
-- would make a new signup indistinguishable from a banned account.

alter table public.app_users
  add column if not exists access_granted boolean not null default false,
  add column if not exists access_granted_at timestamptz,
  add column if not exists access_granted_by uuid references public.app_users (id) on delete set null;

-- The admin panel lists the waiting accounts, which is a tiny fraction of the
-- table once a batch has been let in.
create index if not exists idx_app_users_access_pending
  on public.app_users (created_at desc)
  where not access_granted;

-- Existing accounts.
--
-- Admins and editors were each promoted by hand, which is already an admin
-- vouching for them, so they keep working. Everyone else signed up under the
-- old open rules and nobody has looked at them, so they wait for approval like
-- a new signup would - letting them all through would grant exactly the access
-- this migration exists to stop handing out unreviewed.
update public.app_users u
  set access_granted = true,
      access_granted_at = now()
  from public.user_roles r
  where r.user_id = u.id
    and r.role in ('admin', 'editor')
    and not u.access_granted;

-- ============================================================================
-- Close the side door.
--
-- The gate above lives in the edge function, and the edge function is not the
-- only way to the data. The anon key ships in the JS bundle, and the baseline
-- gave it `select` on companies, experiences, questions, comments, tags,
-- seasons, announcements and attachments, each behind a `using (true)` policy -
-- reasonable when the site was a public noticeboard. Left in place, anyone who
-- opened the sign-in page could lift the key from the bundle and read every
-- one of those tables straight from /rest/v1, without an account, never mind an
-- approved one.
--
-- The browser does not use PostgREST at all (see src/lib/api.ts), so nothing
-- legitimate loses anything here. The service role is untouched: it does not
-- hold its access through these grants, and it bypasses RLS.
-- ============================================================================

drop policy if exists "companies_public_read" on public.companies;
drop policy if exists "experiences_public_read" on public.interview_experiences;
drop policy if exists "questions_public_read" on public.interview_questions;
drop policy if exists "attachments_public_read" on public.attachments;
drop policy if exists "comments_public_read" on public.comments;
drop policy if exists "tags_public_read" on public.tags;
drop policy if exists "company_tags_public_read" on public.company_tags;
drop policy if exists "announcements_public_read" on public.announcements;
drop policy if exists "seasons_public_read" on public.seasons;

-- Every table, not just the ones named above. The live database predates these
-- migrations and has carried grants they never wrote down before; a sweep
-- cannot miss one the way a list can. RLS stays enabled everywhere, so a grant
-- added back by mistake still reaches nothing without a policy to go with it.
revoke all on all tables in schema public from anon, authenticated;

-- And for tables that do not exist yet, so the next migration starts closed
-- instead of inheriting a default that quietly reopens it.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- ============================================================================
-- Keep-alive
--
-- The scheduled ping kept the free-tier project awake by reading one company
-- id with the anon key, which is exactly the access just removed. This gives it
-- something to call that proves the database answered and discloses nothing.
-- ============================================================================

create or replace function public.keepalive()
returns boolean
language sql
stable
set search_path = public
as $$
  select true;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, service_role;
