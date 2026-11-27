-- Temporary (test) drafts and a per-service / per-API-key usage ledger.

-- Drafts created for review/testing; listed with a "Temporary" badge and
-- deletable in bulk. Never public (no draft is public in Phase 2B).
alter table public.articles add column is_temporary boolean not null default false;

-- One row per stage per external service. key_fingerprint = first 12 hex
-- chars of sha256(api key): identifies WHICH key was used without storing it.
-- Rows survive draft deletion (FKs set null) so cost history is kept.
create table public.api_usage (
  id bigint generated always as identity primary key,
  job_id uuid references public.generation_jobs (id) on delete set null,
  article_id uuid references public.articles (id) on delete set null,
  stage text not null,
  service text not null check (service in ('arli', 'tavily', 'fred', 'tiingo', 'eia')),
  key_fingerprint text not null,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  credits numeric not null default 0,
  calls integer not null default 0,
  created_at timestamptz not null default now()
);
create index api_usage_service_key on public.api_usage (service, key_fingerprint, created_at desc);
create index api_usage_article on public.api_usage (article_id);

alter table public.api_usage enable row level security;
revoke all on public.api_usage from anon;
create policy api_usage_editor_all on public.api_usage
  for all to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
