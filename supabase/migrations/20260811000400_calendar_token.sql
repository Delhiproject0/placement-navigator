-- Per-user calendar subscription token.
--
-- Calendar clients (Google, Apple, Outlook) poll a URL on a schedule with no
-- way to send an Authorization header, so the feed has to authenticate from
-- the URL itself. The token is therefore a bearer credential in a query
-- string: long, random, revocable, and scoped to read-only calendar data and
-- nothing else.

alter table public.profiles
  add column if not exists calendar_token text unique;

-- Partial index: most rows will have no token until the user asks for one.
create index if not exists idx_profiles_calendar_token
  on public.profiles (calendar_token)
  where calendar_token is not null;

/**
 * Issues (or rotates) a token. Returns the new value.
 *
 * gen_random_bytes gives 32 bytes of CSPRNG output; encode()'s base64 is then
 * made URL-safe. Rotating simply overwrites, which is what "revoke" means
 * here - any calendar still polling the old URL stops resolving.
 */
create or replace function public.issue_calendar_token(_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  _token text;
begin
  _token := replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_');
  _token := rtrim(_token, '=');

  update public.profiles set calendar_token = _token where user_id = _user_id;
  if not found then
    insert into public.profiles (user_id, calendar_token) values (_user_id, _token);
  end if;

  return _token;
end;
$$;

revoke all on function public.issue_calendar_token(uuid) from public, anon, authenticated;
grant execute on function public.issue_calendar_token(uuid) to service_role;
