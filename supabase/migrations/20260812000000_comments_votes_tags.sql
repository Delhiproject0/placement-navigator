-- Discussion and signal on contributions, plus a company taxonomy.
--
-- An interview writeup usually prompts a follow-up question ("was the OA on
-- HackerRank?"), and with no way to ask it that exchange happens somewhere the
-- next batch will never find. Votes give the useful writeups a way to surface
-- above the thin ones.

-- ============================================================================
-- Comments
-- ============================================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),

  -- Polymorphic over the two contribution kinds. No FK, because the target is
  -- in one of two tables; the API resolves and checks it before inserting.
  entity_type text not null check (entity_type in ('experience', 'question')),
  entity_id uuid not null,

  -- One level of threading. Deeper nesting reads badly on a phone and invites
  -- arguments; a reply-to-a-reply attaches to the same parent.
  parent_id uuid references public.comments (id) on delete cascade,

  author_id uuid references public.app_users (id) on delete set null,
  /**
   * Non-empty *unless* deleted. Soft delete blanks the text - the row survives
   * so replies keep their context, but the words themselves should not linger
   * in the database after someone removes them. An unconditional length check
   * makes that blanking impossible.
   */
  body text not null,

  -- Soft delete: hard-deleting a parent would take its replies with it and
  -- leave the thread unreadable.
  is_deleted boolean not null default false,
  constraint comments_body_length check (is_deleted or length(trim(body)) between 1 and 5000),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_comments_entity on public.comments (entity_type, entity_id);
create index if not exists idx_comments_parent on public.comments (parent_id);

alter table public.comments enable row level security;

drop policy if exists "comments_public_read" on public.comments;
create policy "comments_public_read" on public.comments for select using (true);

grant select on public.comments to anon, authenticated;
grant all on public.comments to service_role;

-- ============================================================================
-- Votes
-- ============================================================================

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('experience', 'question', 'comment')),
  entity_id uuid not null,
  user_id uuid not null references public.app_users (id) on delete cascade,
  -- Up or down only. The unique constraint is what makes a vote a vote rather
  -- than a click counter.
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, user_id)
);

create index if not exists idx_votes_entity on public.votes (entity_type, entity_id);
create index if not exists idx_votes_user on public.votes (user_id);

alter table public.votes enable row level security;
revoke all on public.votes from anon, authenticated;
grant all on public.votes to service_role;

/**
 * Score for one entity.
 *
 * Computed rather than denormalised into a counter column: a counter drifts
 * the first time a delete or a rollback misses it, and this table stays small
 * enough that summing is cheap with the index above.
 */
create or replace function public.vote_score(_entity_type text, _entity_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(value), 0)::integer
  from public.votes
  where entity_type = _entity_type and entity_id = _entity_id;
$$;

revoke all on function public.vote_score(text, uuid) from public, anon, authenticated;
grant execute on function public.vote_score(text, uuid) to service_role;

-- ============================================================================
-- Tags
--
-- A flexible taxonomy - "fintech", "core", "dream", "intern+ppo" - that the
-- fixed columns cannot express and that students actually sort by.
-- ============================================================================

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  -- Stored lowercase so "Fintech" and "fintech" cannot both exist.
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9-]+$'),
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.company_tags (
  company_id uuid not null references public.companies (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (company_id, tag_id)
);

create index if not exists idx_company_tags_tag on public.company_tags (tag_id);

alter table public.tags enable row level security;
alter table public.company_tags enable row level security;

drop policy if exists "tags_public_read" on public.tags;
create policy "tags_public_read" on public.tags for select using (true);
drop policy if exists "company_tags_public_read" on public.company_tags;
create policy "company_tags_public_read" on public.company_tags for select using (true);

grant select on public.tags to anon, authenticated;
grant select on public.company_tags to anon, authenticated;
grant all on public.tags to service_role;
grant all on public.company_tags to service_role;
