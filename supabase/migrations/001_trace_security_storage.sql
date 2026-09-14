-- TRACE Consultant OS — Storage & RLS hardening
-- NON-DESTRUCTIVE: preserves existing trace_kv rows.
-- Run AFTER verifying the intended TRACE team users exist in auth.users.

create extension if not exists pgcrypto;

create table if not exists public.trace_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','member')),
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trace_team_members_active_idx
  on public.trace_team_members(active);

alter table public.trace_team_members enable row level security;
revoke all on table public.trace_team_members from anon, authenticated;

drop policy if exists "trace team members self read" on public.trace_team_members;
create policy "trace team members self read"
on public.trace_team_members
for select
to authenticated
using (user_id = auth.uid());

create or replace function public.trace_is_team_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trace_team_members m
    where m.user_id = auth.uid()
      and m.active = true
  );
$$;

revoke all on function public.trace_is_team_member() from public;
grant execute on function public.trace_is_team_member() to authenticated;

-- Ensure the legacy key/value table exists and is protected.
create table if not exists public.trace_kv (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.trace_kv enable row level security;

drop policy if exists "public read write" on public.trace_kv;
drop policy if exists "logged in read write" on public.trace_kv;
drop policy if exists "trace team authenticated read write" on public.trace_kv;
drop policy if exists "trace team members only" on public.trace_kv;

create policy "trace team members only"
on public.trace_kv
for all
to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member());

revoke all on table public.trace_kv from anon, authenticated;
grant select, insert, update, delete on table public.trace_kv to authenticated;

create or replace function public.trace_kv_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trace_kv_updated_at on public.trace_kv;
create trigger trg_trace_kv_updated_at
before update on public.trace_kv
for each row execute function public.trace_kv_set_updated_at();

-- Audit trail for security-sensitive changes and future governance events.
create table if not exists public.trace_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists trace_audit_log_created_idx
  on public.trace_audit_log(created_at desc);
create index if not exists trace_audit_log_actor_idx
  on public.trace_audit_log(actor_user_id, created_at desc);

alter table public.trace_audit_log enable row level security;
revoke all on table public.trace_audit_log from anon, authenticated;

drop policy if exists "trace audit team read" on public.trace_audit_log;
create policy "trace audit team read"
on public.trace_audit_log
for select
to authenticated
using (public.trace_is_team_member());

-- Inserts should be performed by a controlled server-side path later.
-- Do not grant arbitrary client INSERT/UPDATE/DELETE on the audit table.

-- BOOTSTRAP REQUIRED:
-- Add ONLY the intended TRACE team auth.users IDs, for example:
-- insert into public.trace_team_members(user_id, role, display_name)
-- values
--   ('LEADER-UUID-HERE', 'leader', 'Irwan'),
--   ('MEMBER-UUID-HERE', 'member', 'Ruspandi'),
--   ('MEMBER-UUID-HERE', 'member', 'Firmansyah')
-- on conflict (user_id) do update
-- set role = excluded.role,
--     display_name = excluded.display_name,
--     active = true,
--     updated_at = now();
--
-- IMPORTANT: Do not paste passwords, service-role keys, or other secrets here.
