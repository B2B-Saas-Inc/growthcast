-- Positioning Wizard: email-gated runs, evidence, and module jobs.
-- Idempotent: safe to re-run. Apply with `npm run db:migrate` using an administrative connection.

create schema if not exists wizard;

-- One row per submitted email. Emails are not verified, so the quota is also enforced per browser (devices).
create table if not exists wizard.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) <= 254),
  first_name text not null check (length(first_name) between 1 and 80),
  generations_used integer not null default 0 check (generations_used >= 0),
  consent_text text not null,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- A browser, identified by a signed HttpOnly cookie. Runs belong to the device that created them, so entering
-- someone else's email never reveals their work.
create table if not exists wizard.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references wizard.users (id) on delete cascade,
  generations_used integer not null default 0 check (generations_used >= 0),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists devices_user_idx on wizard.devices (user_id);

create table if not exists wizard.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references wizard.users (id) on delete cascade,
  device_id uuid not null references wizard.devices (id) on delete cascade,
  product text not null check (length(product) between 1 and 120),
  feature text not null default '' check (length(feature) <= 160),
  website text not null default '' check (length(website) <= 300),
  audience text not null default '' check (length(audience) <= 500),
  research_brief jsonb not null default '{}'::jsonb,
  icp jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists runs_device_idx on wizard.runs (device_id, created_at desc);

create table if not exists wizard.evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references wizard.runs (id) on delete cascade,
  kind text not null check (kind in ('upload', 'url')),
  name text not null check (length(name) between 1 and 300),
  url text check (url is null or length(url) <= 2000),
  url_type text,
  note text not null default '' check (length(note) <= 300),
  mime text,
  content text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists evidence_run_idx on wizard.evidence (run_id, created_at);

create table if not exists wizard.jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references wizard.runs (id) on delete cascade,
  module text not null check (module in ('research', 'jtbd', 'positioning', 'pmm', 'copy')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output text,
  error text,
  model text,
  usage jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_run_idx on wizard.jobs (run_id, started_at);
-- At most one job runs per run at a time.
create unique index if not exists jobs_one_running_per_run on wizard.jobs (run_id) where status = 'running';

-- Server-only access. The serverless function connects with a credential that owns these tables; nothing is
-- exposed through Supabase's public API roles.
alter table wizard.users enable row level security;
alter table wizard.devices enable row level security;
alter table wizard.runs enable row level security;
alter table wizard.evidence enable row level security;
alter table wizard.jobs enable row level security;
revoke all on schema wizard from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema wizard from anon, authenticated';
    execute 'revoke usage on schema wizard from anon, authenticated';
  end if;
end $$;
