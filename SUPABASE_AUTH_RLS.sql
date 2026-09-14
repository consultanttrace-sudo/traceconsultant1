-- TRACE Consultant OS — RLS entrypoint
-- NON-DESTRUCTIVE: existing trace_kv data is preserved.
-- Recommended: run supabase/migrations/001_trace_security_storage.sql.
-- This file is kept as the simple SQL Editor entrypoint for the current app.

create extension if not exists pgcrypto;

create table if not exists public.trace_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','member')),
  active boolean not null default true,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trace_team_members enable row level security;
revoke all on table public.trace_team_members from anon, authenticated;

drop policy if exists "trace team members self read" on public.trace_team_members;
create policy "trace team members self read"
on public.trace_team_members for select to authenticated
using (user_id = auth.uid());

create or replace function public.trace_is_team_member()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trace_team_members m
    where m.user_id = auth.uid() and m.active = true
  );
$$;
revoke all on function public.trace_is_team_member() from public;
grant execute on function public.trace_is_team_member() to authenticated;

alter table public.trace_kv enable row level security;
drop policy if exists "public read write" on public.trace_kv;
drop policy if exists "logged in read write" on public.trace_kv;
drop policy if exists "trace team authenticated read write" on public.trace_kv;
drop policy if exists "trace team members only" on public.trace_kv;
create policy "trace team members only"
on public.trace_kv for all to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member());

revoke all on table public.trace_kv from anon, authenticated;
grant select, insert, update, delete on table public.trace_kv to authenticated;

-- Bootstrap the three intended team accounts using their auth.users UUIDs:
-- insert into public.trace_team_members(user_id, role, display_name) values
-- ('LEADER-UUID-HERE','leader','Irwan'),
-- ('MEMBER-UUID-HERE','member','Ruspandi'),
-- ('MEMBER-UUID-HERE','member','Firmansyah')
-- on conflict (user_id) do update set role=excluded.role, display_name=excluded.display_name, active=true, updated_at=now();
