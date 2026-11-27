-- Phase 3C — homepage featured article.
--
-- Additive only: one new single-row table and one function. No existing
-- table, row, column or policy is changed.
--
-- Rules, enforced by the schema itself:
--   * Only a LIVE article can be featured: article_id references
--     public.published_stories, which holds exactly the live articles.
--   * Only one article is featured at a time: the table has one row (id = true).
--   * Unpublishing deletes the published_stories row, and ON DELETE SET NULL
--     clears the feature in the same transaction, so the homepage falls back
--     to the most recently published story. Republishing updates the
--     published_stories row in place, so a featured article stays featured.
--   * article_id null = no explicit choice: the homepage shows the most
--     recently published story.
--
-- Readable by anyone (it only names a live article); changed only through
-- set_featured_article(), which checks is_editor().

create table public.homepage_feature (
  id boolean primary key default true check (id),
  article_id uuid references public.published_stories (article_id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
insert into public.homepage_feature (id) values (true);

alter table public.homepage_feature enable row level security;
revoke all on public.homepage_feature from anon, authenticated;
grant select on public.homepage_feature to anon, authenticated;
create policy homepage_feature_public_read on public.homepage_feature
  for select to anon, authenticated using (true);

-- Sets (p_article) or clears (null) the featured article.
-- Outcomes: 'featured', 'cleared' or 'unchanged'. Failures raise with a
-- stable code prefix: not_authorised, not_live.
create or replace function public.set_featured_article(p_article uuid)
returns table (outcome text, article_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_current uuid;
begin
  if not public.is_editor() then
    raise exception 'not_authorised: only editors can choose the featured article' using errcode = '42501';
  end if;
  if p_article is not null and not exists (select 1 from public.published_stories ps where ps.article_id = p_article) then
    raise exception 'not_live: only a published article can be featured';
  end if;

  select hf.article_id into v_current from public.homepage_feature hf where hf.id for update;
  if v_current is not distinct from p_article then
    return query select 'unchanged'::text, p_article;
    return;
  end if;

  update public.homepage_feature hf
     set article_id = p_article, updated_at = now(), updated_by = (select auth.uid())
   where hf.id;

  return query select (case when p_article is null then 'cleared' else 'featured' end)::text, p_article;
end $$;

revoke execute on function public.set_featured_article(uuid) from public, anon;
grant execute on function public.set_featured_article(uuid) to authenticated;
