-- TRACE Consultant OS — durable operational job/checkpoint foundation
-- NON-DESTRUCTIVE: additive only. Does not migrate or delete trace_kv data.

create extension if not exists pgcrypto;

-- Durable Acquisition/discovery job state. One row per run.
create table if not exists public.trace_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('acquisition_discovery','acquisition_research')),
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','PAUSING','PAUSED','STOPPING','STOPPED','COMPLETED','PARTIAL_FAILURE','FAILED','RESUMABLE')),
  requested_by uuid references auth.users(id) on delete set null,
  scope jsonb not null default '{}'::jsonb,
  config jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  error jsonb,
  started_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trace_jobs_status_idx on public.trace_jobs(status, updated_at desc);
create index if not exists trace_jobs_requester_idx on public.trace_jobs(requested_by, created_at desc);
create index if not exists trace_jobs_type_idx on public.trace_jobs(job_type, created_at desc);

-- Checkpoints are append-only snapshots. This is the recovery source, not the UI's in-memory array.
create table if not exists public.trace_job_checkpoints (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.trace_jobs(id) on delete cascade,
  sequence_no bigint not null,
  cursor jsonb,
  stats jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(job_id, sequence_no)
);

create index if not exists trace_job_checkpoints_job_idx on public.trace_job_checkpoints(job_id, sequence_no desc);

-- Members may inspect their jobs; leaders can inspect the whole team.
create or replace function public.trace_is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trace_team_members m
    where m.user_id = auth.uid() and m.active = true and m.role = 'leader'
  );
$$;

revoke all on function public.trace_is_leader() from public;
grant execute on function public.trace_is_leader() to authenticated;

alter table public.trace_jobs enable row level security;
alter table public.trace_job_checkpoints enable row level security;
revoke all on table public.trace_jobs, public.trace_job_checkpoints from anon, authenticated;
grant select, insert, update on public.trace_jobs to authenticated;
grant select, insert on public.trace_job_checkpoints to authenticated;

drop policy if exists "trace jobs member access" on public.trace_jobs;
create policy "trace jobs member access"
on public.trace_jobs
for all to authenticated
using (
  public.trace_is_team_member()
  and (requested_by = auth.uid() or public.trace_is_leader())
)
with check (
  public.trace_is_team_member()
  and (requested_by = auth.uid() or public.trace_is_leader())
);

drop policy if exists "trace checkpoints member access" on public.trace_job_checkpoints;
create policy "trace checkpoints member access"
on public.trace_job_checkpoints
for select to authenticated
using (
  public.trace_is_team_member()
  and exists (
    select 1 from public.trace_jobs j
    where j.id = trace_job_checkpoints.job_id
      and (j.requested_by = auth.uid() or public.trace_is_leader())
  )
);

-- Inserts are allowed only for a job the caller owns (or a leader-owned job).
create policy "trace checkpoints controlled insert"
on public.trace_job_checkpoints
for insert to authenticated
with check (
  public.trace_is_team_member()
  and exists (
    select 1 from public.trace_jobs j
    where j.id = trace_job_checkpoints.job_id
      and (j.requested_by = auth.uid() or public.trace_is_leader())
  )
);

-- Generic updated_at helper for operational rows.
create or replace function public.trace_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trace_jobs_updated_at on public.trace_jobs;
create trigger trg_trace_jobs_updated_at
before update on public.trace_jobs
for each row execute function public.trace_set_updated_at();

-- Guardrail: do not permit a member to rewrite ownership after creation.
create or replace function public.trace_job_ownership_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.requested_by is distinct from old.requested_by and not public.trace_is_leader() then
    raise exception 'TRACE_JOB_OWNER_CHANGE_FORBIDDEN';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trace_job_ownership_guard on public.trace_jobs;
create trigger trg_trace_job_ownership_guard
before update on public.trace_jobs
for each row execute function public.trace_job_ownership_guard();

comment on table public.trace_jobs is 'Durable TRACE operational jobs; used for Acquisition discovery/research lifecycle and future background workflows.';
comment on table public.trace_job_checkpoints is 'Append-only recovery checkpoints for durable TRACE jobs.';
