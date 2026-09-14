-- TRACE Data Intake durable review/import ledger. Additive; never overwrites existing finance rows.
create table if not exists public.trace_data_intake_imports (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  source_hash text not null,
  source_name text not null,
  source_type text not null,
  status text not null default 'draft' check (status in ('draft','reviewed','approved','committed','rejected')),
  payload jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(actor_user_id, source_hash)
);
create index if not exists trace_data_intake_imports_status_idx on public.trace_data_intake_imports(actor_user_id,status,created_at desc);
alter table public.trace_data_intake_imports enable row level security;
revoke all on table public.trace_data_intake_imports from anon, authenticated;
grant select,insert,update on table public.trace_data_intake_imports to authenticated;
drop policy if exists trace_data_intake_imports_member on public.trace_data_intake_imports;
create policy trace_data_intake_imports_member on public.trace_data_intake_imports
for all to authenticated
using (public.trace_is_team_member() and (actor_user_id=auth.uid() or public.trace_is_leader()))
with check (public.trace_is_team_member() and actor_user_id=auth.uid());
drop trigger if exists trg_trace_data_intake_imports_updated_at on public.trace_data_intake_imports;
create trigger trg_trace_data_intake_imports_updated_at before update on public.trace_data_intake_imports for each row execute function public.trace_set_updated_at();
