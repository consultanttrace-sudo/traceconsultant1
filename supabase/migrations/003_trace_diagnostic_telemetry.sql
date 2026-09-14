-- TRACE Diagnostic telemetry: additive, append-only, team-member scoped.
create table if not exists public.trace_diagnostic_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('runtime','performance','network','data','job','test','supabase','dependency')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists trace_diagnostic_events_created_idx
  on public.trace_diagnostic_events(created_at desc);
create index if not exists trace_diagnostic_events_actor_idx
  on public.trace_diagnostic_events(actor_user_id, created_at desc);
create index if not exists trace_diagnostic_events_kind_idx
  on public.trace_diagnostic_events(kind, created_at desc);

alter table public.trace_diagnostic_events enable row level security;
revoke all on table public.trace_diagnostic_events from anon;
revoke all on table public.trace_diagnostic_events from authenticated;
grant select, insert on table public.trace_diagnostic_events to authenticated;

drop policy if exists "trace diagnostic team read" on public.trace_diagnostic_events;
create policy "trace diagnostic team read"
on public.trace_diagnostic_events for select to authenticated
using (public.trace_is_team_member());

drop policy if exists "trace diagnostic team insert own" on public.trace_diagnostic_events;
create policy "trace diagnostic team insert own"
on public.trace_diagnostic_events for insert to authenticated
with check (public.trace_is_team_member() and actor_user_id = auth.uid());

-- No UPDATE/DELETE policy: telemetry is append-only from the client role.
