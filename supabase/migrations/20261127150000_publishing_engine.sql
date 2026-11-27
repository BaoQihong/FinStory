-- Phase 3A — publishing engine: permanent article identity, immutable
-- publication history, and a public table holding only live snapshots.
--
-- Additive only: no existing column, row or policy is dropped or rewritten.
--
-- Security model
--   * public.published_stories is the ONLY table readable without an editor
--     session. It contains one row per live article: the public snapshot
--     (no brief, findings, quotes, validation ledger, attention notes or job
--     metadata). Unpublishing deletes the row.
--   * public.publication_revisions keeps every published snapshot plus the
--     full internal draft it came from. Editors may read it; nobody may
--     write it directly.
--   * All writes to both tables, and to the publication columns of
--     public.articles, go through publish_article() / unpublish_article():
--     SECURITY DEFINER, explicit is_editor() check, one transaction, row
--     lock on the article. A trigger rejects direct edits of the
--     publication columns.

-- ── Article identity and publication pointers ───────────────────────────
alter table public.articles
  add column slug text unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),
  add column is_live boolean not null default false,
  add column first_published_at timestamptz,
  add column last_published_at timestamptz,
  add column unpublished_at timestamptz,
  add column published_revision integer not null default 0,     -- latest publication number (0 = never)
  add column published_source_revision integer;                 -- articles.revision that publication was taken from

-- ── Publication history (immutable) ─────────────────────────────────────
create table public.publication_revisions (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.articles (id) on delete restrict,
  revision integer not null check (revision > 0),       -- publication number: 1, 2, 3…
  source_revision integer not null,                     -- the working-draft revision published
  slug text not null,
  content jsonb not null,                               -- full internal draft at source_revision (editors only)
  snapshot jsonb not null,                              -- public snapshot exactly as served
  note text,
  published_by uuid not null references auth.users (id),
  published_by_name text not null,
  published_at timestamptz not null default now(),
  unique (article_id, revision)
);
create index publication_revisions_article on public.publication_revisions (article_id, revision desc);

-- ── Live public snapshots ───────────────────────────────────────────────
create table public.published_stories (
  article_id uuid primary key references public.articles (id) on delete restrict,
  slug text not null unique,
  revision integer not null,
  snapshot jsonb not null,
  first_published_at timestamptz not null,
  published_at timestamptz not null
);

-- ── Grants and RLS ──────────────────────────────────────────────────────
alter table public.publication_revisions enable row level security;
revoke all on public.publication_revisions from anon, authenticated;
grant select on public.publication_revisions to authenticated;
create policy publication_revisions_editor_read on public.publication_revisions
  for select to authenticated using ((select public.is_editor()));

alter table public.published_stories enable row level security;
revoke all on public.published_stories from anon, authenticated;
grant select on public.published_stories to anon, authenticated;
create policy published_stories_public_read on public.published_stories
  for select to anon, authenticated using (true);

-- ── Guard: publication columns change only inside the publishing functions ──
create or replace function public.guard_article_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  publishing boolean := coalesce(current_setting('seshat.publishing', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if new.slug is not null or new.is_live or new.first_published_at is not null or new.last_published_at is not null
       or new.unpublished_at is not null or new.published_revision <> 0 or new.published_source_revision is not null then
      raise exception 'publication fields are set only by publish_article()';
    end if;
    return new;
  end if;
  if old.slug is not null and new.slug is distinct from old.slug then
    raise exception 'an article slug is permanent once published';
  end if;
  if publishing then
    -- Publishing is not an edit: keep the draft's "last updated" time.
    new.updated_at := old.updated_at;
    return new;
  end if;
  if new.slug is distinct from old.slug or new.is_live is distinct from old.is_live
     or new.first_published_at is distinct from old.first_published_at
     or new.last_published_at is distinct from old.last_published_at
     or new.unpublished_at is distinct from old.unpublished_at
     or new.published_revision is distinct from old.published_revision
     or new.published_source_revision is distinct from old.published_source_revision then
    raise exception 'publication fields are changed only by publish_article() / unpublish_article()';
  end if;
  return new;
end $$;

-- Named to fire after articles_touch (triggers run in name order).
create trigger articles_zz_guard_publication
  before insert or update on public.articles
  for each row execute function public.guard_article_publication();

-- ── publish_article ─────────────────────────────────────────────────────
-- Publishes (or republishes) the article's CURRENT working revision.
-- p_expected_revision must equal articles.revision: the snapshot was built
-- and validated by the application from exactly that revision.
-- Outcomes: 'published' or 'unchanged' (already live at this revision —
-- duplicate submissions are a no-op). Failures raise with a stable code
-- prefix: not_authorised, not_found, no_content, temporary_draft,
-- generation_running, stale_revision, slug_required, slug_mismatch,
-- slug_taken, invalid_snapshot.
create or replace function public.publish_article(
  p_article uuid,
  p_expected_revision integer,
  p_slug text,
  p_snapshot jsonb,
  p_note text default null
)
returns table (outcome text, slug text, published_revision integer, published_source_revision integer, first_published_at timestamptz, last_published_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.articles;
  v_slug text;
  v_rev integer;
  v_now timestamptz := now();
  v_name text;
begin
  if not public.is_editor() then
    raise exception 'not_authorised: only editors can publish' using errcode = '42501';
  end if;

  select * into a from public.articles where id = p_article for update;
  if not found then raise exception 'not_found: article does not exist'; end if;

  -- Duplicate / concurrent request for a revision that is already live.
  if a.is_live and a.published_source_revision = a.revision and a.revision = p_expected_revision then
    return query select 'unchanged'::text, a.slug, a.published_revision, a.published_source_revision, a.first_published_at, a.last_published_at;
    return;
  end if;

  if a.content is null then raise exception 'no_content: the draft has no content yet'; end if;
  if a.is_temporary then raise exception 'temporary_draft: temporary drafts cannot be published'; end if;
  if a.revision <> p_expected_revision then
    raise exception 'stale_revision: the draft is now at revision %, not %', a.revision, p_expected_revision;
  end if;
  if exists (select 1 from public.generation_jobs j where j.article_id = p_article and j.status in ('queued', 'running')) then
    raise exception 'generation_running: generation is running for this draft';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or p_snapshot->>'schemaVersion' is null then
    raise exception 'invalid_snapshot: snapshot must be a versioned object';
  end if;

  if a.slug is not null then
    if p_slug is not null and p_slug <> a.slug then
      raise exception 'slug_mismatch: this article is permanently published as %', a.slug;
    end if;
    v_slug := a.slug;
  else
    if p_slug is null then raise exception 'slug_required: choose a URL slug'; end if;
    if exists (select 1 from public.articles x where x.slug = p_slug and x.id <> p_article) then
      raise exception 'slug_taken: % is already used by another article', p_slug;
    end if;
    v_slug := p_slug;
  end if;

  select e.display_name into v_name from public.editors e where e.user_id = (select auth.uid());
  v_rev := a.published_revision + 1;

  perform set_config('seshat.publishing', 'on', true);
  begin
    insert into public.publication_revisions (article_id, revision, source_revision, slug, content, snapshot, note, published_by, published_by_name, published_at)
    values (p_article, v_rev, a.revision, v_slug, a.content, p_snapshot, nullif(btrim(p_note), ''), (select auth.uid()), coalesce(v_name, 'Editor'), v_now);

    insert into public.published_stories as ps (article_id, slug, revision, snapshot, first_published_at, published_at)
    values (p_article, v_slug, v_rev, p_snapshot, coalesce(a.first_published_at, v_now), v_now)
    on conflict (article_id) do update
      set revision = excluded.revision, snapshot = excluded.snapshot, published_at = excluded.published_at;

    update public.articles
       set slug = v_slug,
           is_live = true,
           first_published_at = coalesce(a.first_published_at, v_now),
           last_published_at = v_now,
           unpublished_at = null,
           published_revision = v_rev,
           published_source_revision = a.revision
     where id = p_article;
  exception when unique_violation then
    raise exception 'slug_taken: % is already used by another article', v_slug;
  end;
  perform set_config('seshat.publishing', '', true);

  return query select 'published'::text, v_slug, v_rev, a.revision, coalesce(a.first_published_at, v_now), v_now;
end $$;

-- ── unpublish_article ───────────────────────────────────────────────────
-- Removes the live snapshot. Keeps the working draft, the slug and the full
-- publication history. Outcomes: 'unpublished' or 'unchanged'.
create or replace function public.unpublish_article(p_article uuid)
returns table (outcome text, slug text, published_revision integer, unpublished_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  a public.articles;
  v_now timestamptz := now();
begin
  if not public.is_editor() then
    raise exception 'not_authorised: only editors can unpublish' using errcode = '42501';
  end if;
  select * into a from public.articles where id = p_article for update;
  if not found then raise exception 'not_found: article does not exist'; end if;
  if not a.is_live then
    return query select 'unchanged'::text, a.slug, a.published_revision, a.unpublished_at;
    return;
  end if;

  perform set_config('seshat.publishing', 'on', true);
  delete from public.published_stories where article_id = p_article;
  update public.articles set is_live = false, unpublished_at = v_now where id = p_article;
  perform set_config('seshat.publishing', '', true);

  return query select 'unpublished'::text, a.slug, a.published_revision, v_now;
end $$;

revoke execute on function public.publish_article(uuid, integer, text, jsonb, text) from public, anon;
revoke execute on function public.unpublish_article(uuid) from public, anon;
grant execute on function public.publish_article(uuid, integer, text, jsonb, text) to authenticated;
grant execute on function public.unpublish_article(uuid) to authenticated;
revoke execute on function public.guard_article_publication() from public, anon, authenticated;
