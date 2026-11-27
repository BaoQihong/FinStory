-- Phase 3C follow-up: readers may see WHICH article is featured, not WHO
-- chose it. Replace the table-wide SELECT grant on homepage_feature with a
-- column-level grant that excludes updated_by (an auth.users id).
-- Privilege change only; no data is touched.
revoke select on public.homepage_feature from anon, authenticated;
grant select (id, article_id, updated_at) on public.homepage_feature to anon, authenticated;
