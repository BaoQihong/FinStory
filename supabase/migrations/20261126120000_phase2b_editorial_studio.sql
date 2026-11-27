-- Phase 2B — editorial studio: editor allow-list, drafts, revisions,
-- generation jobs, persisted stage outputs, research evidence and datasets.
--
-- Security model: every table has RLS enabled and a single policy that
-- admits authenticated users who are in public.editors. anon has no
-- policies and no grants, so drafts are never reachable without an editor
-- session. The application runtime uses the editor's own session (no
-- service-role key on Vercel), so these policies are the real boundary.

-- ── Editors ──────────────────────────────────────────────────────────────
create table public.editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Seshat Editorial',
  created_at timestamptz not null default now()
);

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.editors e where e.user_id = (select auth.uid()));
$$;

revoke execute on function public.is_editor() from public, anon;
grant execute on function public.is_editor() to authenticated;

alter table public.editors enable row level security;
create policy editors_read_self on public.editors
  for select to authenticated using (user_id = (select auth.uid()));

-- ── Articles (drafts) and revisions ──────────────────────────────────────
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  working_title text not null,
  brief jsonb not null,                       -- the editor's prompt + optional fields
  status text not null default 'generating'
    check (status in ('generating', 'draft', 'needs_attention', 'generation_failed')),
  content jsonb,                              -- canonical SeshatArticleV1 (null until generated)
  schema_version integer,
  as_of date,                                 -- research / data cutoff
  revision integer not null default 0,        -- latest article_revisions.revision
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.article_revisions (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.articles (id) on delete cascade,
  revision integer not null,
  origin text not null check (origin in ('generated', 'editor')),
  content jsonb not null,
  note text,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (article_id, revision)
);

-- ── Generation jobs ──────────────────────────────────────────────────────
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  stage text not null default 'plan',         -- next stage to run (or the stage that failed)
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts jsonb not null default '{}'::jsonb, -- { stage: attempt count }
  error jsonb,                                -- { stage, message, retryable }
  warnings jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

-- At most one active job across the whole studio: prevents duplicate
-- submissions and guarantees a single in-flight Arli request (D-010).
create unique index generation_jobs_one_active
  on public.generation_jobs ((true)) where status in ('queued', 'running');
create index generation_jobs_article on public.generation_jobs (article_id, created_at desc);

create table public.job_stage_runs (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.generation_jobs (id) on delete cascade,
  stage text not null,
  attempt integer not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  output jsonb,
  error text,
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index job_stage_runs_job on public.job_stage_runs (job_id, stage, id desc);

-- ── Research evidence ────────────────────────────────────────────────────
create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  ref text not null,                          -- "S1", "S2"… (the only handle the LLM sees)
  url text not null,
  title text not null,
  publisher text not null,                    -- registrable domain
  source_type text not null check (source_type in ('primary', 'journalism', 'other')),
  published_at date,
  stale boolean not null default false,
  query text not null,
  snippet text,
  excerpt text,                               -- internal verification text, never published
  score numeric,
  provider text not null,
  retrieved_at timestamptz not null default now(),
  unique (job_id, ref)
);

create table public.research_findings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  ref text not null,                          -- "F1"…
  claim text not null,
  evidence_kind text not null check (evidence_kind in ('documented', 'context', 'interpretation')),
  source_refs text[] not null default '{}',
  quote text,
  quote_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (job_id, ref)
);

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs (id) on delete cascade,
  article_id uuid not null references public.articles (id) on delete cascade,
  key text not null,                          -- alias used in fact tokens and chart specs
  provider text not null,
  series_id text not null,
  name text not null,
  units text not null,
  frequency text not null,
  seasonal_adjustment text,
  definition text,
  source_url text not null,
  retrieved_at timestamptz not null,
  observation_start date,
  observation_end date,
  transformations jsonb not null default '[]'::jsonb,
  observations jsonb not null,                -- [{date, value|null}] exactly as retrieved
  sha256 text not null,
  unique (job_id, key)
);

-- ── RLS: editors only, everywhere ────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['articles', 'article_revisions', 'generation_jobs', 'job_stage_runs',
                           'research_sources', 'research_findings', 'datasets']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select public.is_editor())) with check ((select public.is_editor()))',
      t || '_editor_all', t);
  end loop;
end $$;
revoke all on public.editors from anon;

-- ── Job lease (resumable, single-runner step execution) ─────────────────
-- Claims a job for one step. Returns the job row with a fresh lease token,
-- or nothing if another step holds an unexpired lease. SECURITY INVOKER, so
-- RLS still applies to the caller.
create or replace function public.claim_generation_job(p_job uuid, p_seconds integer)
returns setof public.generation_jobs
language sql
security invoker
set search_path = ''
as $$
  update public.generation_jobs
     set lease_token = gen_random_uuid(),
         lease_expires_at = now() + make_interval(secs => p_seconds),
         status = case when status = 'queued' then 'running' else status end,
         updated_at = now()
   where id = p_job
     and status in ('queued', 'running')
     and (lease_expires_at is null or lease_expires_at < now())
  returning *;
$$;
revoke execute on function public.claim_generation_job(uuid, integer) from public, anon;
grant execute on function public.claim_generation_job(uuid, integer) to authenticated;

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
create trigger articles_touch before update on public.articles
  for each row execute function public.touch_updated_at();
