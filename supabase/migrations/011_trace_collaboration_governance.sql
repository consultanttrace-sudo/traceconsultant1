-- TRACE collaboration + governance durable foundation. Additive only.
create extension if not exists pgcrypto;

create table if not exists public.trace_collaboration_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  title text not null,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'open' check(status in ('open','in_progress','blocked','done','cancelled')),
  priority text not null default 'P2' check(priority in ('P0','P1','P2','P3')),
  due_date timestamptz,
  dependencies jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  version bigint not null default 1 check(version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trace_collab_tasks_client_idx on public.trace_collaboration_tasks(client_id,status,priority,due_date);
create index if not exists trace_collab_tasks_owner_idx on public.trace_collaboration_tasks(owner_user_id,status,updated_at desc);
alter table public.trace_collaboration_tasks enable row level security;
revoke all on public.trace_collaboration_tasks from anon, authenticated;
grant select,insert,update on public.trace_collaboration_tasks to authenticated;
drop policy if exists trace_collab_tasks_team on public.trace_collaboration_tasks;
create policy trace_collab_tasks_team on public.trace_collaboration_tasks for all to authenticated
using(public.trace_is_team_member())
with check(public.trace_is_team_member() and created_by=auth.uid());

create or replace function public.trace_collab_task_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.version <> old.version + 1 then raise exception 'TRACE_TASK_VERSION_MISMATCH'; end if;
    if new.status='done' and jsonb_array_length(coalesce(new.evidence_ids,'[]'::jsonb))=0 then raise exception 'TRACE_TASK_EVIDENCE_REQUIRED'; end if;
    if new.created_by is distinct from old.created_by then raise exception 'TRACE_TASK_CREATOR_IMMUTABLE'; end if;
  elsif tg_op='INSERT' then
    if new.version <> 1 then raise exception 'TRACE_TASK_INITIAL_VERSION_INVALID'; end if;
    if new.created_by <> auth.uid() and not public.trace_is_leader() then raise exception 'TRACE_TASK_CREATOR_FORBIDDEN'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trace_collab_task_guard on public.trace_collaboration_tasks;
create trigger trg_trace_collab_task_guard before insert or update on public.trace_collaboration_tasks for each row execute function public.trace_collab_task_guard();
drop trigger if exists trg_trace_collab_tasks_updated_at on public.trace_collaboration_tasks;
create trigger trg_trace_collab_tasks_updated_at before update on public.trace_collaboration_tasks for each row execute function public.trace_set_updated_at();

create table if not exists public.trace_collaboration_comments (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.trace_collaboration_tasks(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null check(length(trim(body))>0),
  created_at timestamptz not null default now()
);
alter table public.trace_collaboration_comments enable row level security;
revoke all on public.trace_collaboration_comments from anon, authenticated;
grant select,insert on public.trace_collaboration_comments to authenticated;
create index if not exists trace_collab_comments_task_idx on public.trace_collaboration_comments(task_id,created_at);
drop policy if exists trace_collab_comments_team on public.trace_collaboration_comments;
create policy trace_collab_comments_team on public.trace_collaboration_comments for select to authenticated using(public.trace_is_team_member());
drop policy if exists trace_collab_comments_own_insert on public.trace_collaboration_comments;
create policy trace_collab_comments_own_insert on public.trace_collaboration_comments for insert to authenticated with check(public.trace_is_team_member() and author_user_id=auth.uid());

-- Controlled append-only audit insert path. Clients cannot UPDATE/DELETE audit rows.
create or replace function public.trace_append_audit_event(p_action text,p_entity_type text,p_entity_id text,p_before jsonb default null,p_after jsonb default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_AUDIT_ACTOR_FORBIDDEN'; end if;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),p_action,p_entity_type,p_entity_id,p_before,p_after,p_reason) returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.trace_append_audit_event(text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.trace_append_audit_event(text,text,text,jsonb,jsonb,text) to authenticated;

comment on table public.trace_collaboration_tasks is 'Durable TRACE team tasks with optimistic version guard and evidence-required completion.';
comment on table public.trace_collaboration_comments is 'Append-only team collaboration comments.';
