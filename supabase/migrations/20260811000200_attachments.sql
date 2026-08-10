-- File attachment metadata.
--
-- The storage host has no listing endpoint and no concept of ownership, so
-- this table is the only record of what exists. If a row is lost, the bytes
-- are unreachable forever - which is why the upload route deletes the blob
-- when the insert here fails.

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),

  -- Polymorphic: no FK, because the target lives in one of several tables.
  -- Integrity is enforced by the upload route, which resolves the entity and
  -- checks the caller may attach to it before writing anything.
  entity_type text not null check (entity_type in ('company', 'experience', 'question', 'profile')),
  entity_id uuid,

  url text not null,
  -- Kept separately rather than re-derived from the URL at delete time: the
  -- deletion path needs the exact name the storage server was given.
  storage_file_name text not null,

  title text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  kind text check (kind is null or kind in ('logo', 'jd', 'offer_letter', 'oa_paper', 'resume', 'avatar', 'other')),
  visibility text not null default 'public' check (visibility in ('public', 'members', 'admins')),

  uploaded_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_attachments_entity on public.attachments (entity_type, entity_id);
create index if not exists idx_attachments_uploaded_by on public.attachments (uploaded_by);

alter table public.attachments enable row level security;

-- Public attachments are readable with the anon key so an <img> or an
-- <iframe> can load them without a round trip through the API. Everything
-- else, and every write, goes through the edge function.
drop policy if exists "attachments_public_read" on public.attachments;
create policy "attachments_public_read" on public.attachments
  for select using (visibility = 'public');

grant select on public.attachments to anon, authenticated;
grant all on public.attachments to service_role;
