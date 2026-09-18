-- v72.15 — Marketing/Content/KPI/SOP/Action Plan, Tahap 3/4: Action Plan.
-- Skema mengikuti ActionPlan/ActionItem di src/core/actionPlan.ts. Aturan
-- dari validateActionItem() DITEGAKKAN ULANG di server:
--  - status 'completed' wajib punya evidence (tidak boleh kosong)
--  - priority 'P0' wajib target != baseline (kalau keduanya diisi)

-- ============================================================
-- 1. ACTION PLANS
-- ============================================================
create table if not exists public.trace_action_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  objective text not null,
  status text not null default 'active' check (status in ('active','archived')),
  version bigint not null default 1,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trace_action_plans_scope_idx on public.trace_action_plans(organization_id, outlet_id, status);
alter table public.trace_action_plans enable row level security;
revoke all on public.trace_action_plans from anon, authenticated;
grant select on public.trace_action_plans to authenticated;
drop policy if exists trace_action_plans_team_select on public.trace_action_plans;
create policy trace_action_plans_team_select on public.trace_action_plans
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_create_action_plan(p_client_id text,p_outlet_id text,p_objective text)
returns public.trace_action_plans
language plpgsql security definer set search_path=public as $$
declare v public.trace_action_plans;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_ACTIONPLAN_ACTOR_FORBIDDEN'; end if;
  if p_objective is null or length(trim(p_objective))=0 then raise exception 'TRACE_ACTIONPLAN_OBJECTIVE_REQUIRED'; end if;
  insert into public.trace_action_plans(organization_id,outlet_id,objective,created_by)
  values(trim(p_client_id),p_outlet_id,trim(p_objective),auth.uid())
  returning * into v;
  perform public.trace_append_audit_event('create','action_plan',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_create_action_plan(text,text,text) from public;
grant execute on function public.trace_create_action_plan(text,text,text) to authenticated;

create or replace function public.trace_list_action_plans(p_client_id text,p_outlet_id text default null,p_status text default 'active')
returns setof public.trace_action_plans
language sql stable security definer set search_path=public as $$
  select * from public.trace_action_plans
  where public.trace_is_team_member()
    and organization_id=trim(p_client_id)
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
    and (p_status is null or status=p_status)
  order by created_at desc;
$$;
revoke all on function public.trace_list_action_plans(text,text,text) from public;
grant execute on function public.trace_list_action_plans(text,text,text) to authenticated;

-- ============================================================
-- 2. ACTION ITEMS
-- ============================================================
create table if not exists public.trace_action_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.trace_action_plans(id) on delete cascade,
  title text not null,
  owner text not null,
  priority text not null check (priority in ('P0','P1','P2','P3')),
  status text not null default 'planned' check (status in ('planned','in_progress','blocked','completed','cancelled')),
  due_date date,
  measure text not null,
  baseline numeric,
  target numeric,
  evidence jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trace_action_items_plan_idx on public.trace_action_items(plan_id, status);
alter table public.trace_action_items enable row level security;
revoke all on public.trace_action_items from anon, authenticated;
grant select on public.trace_action_items to authenticated;
drop policy if exists trace_action_items_team_select on public.trace_action_items;
create policy trace_action_items_team_select on public.trace_action_items
for select to authenticated using (public.trace_is_team_member());

-- ============================================================
-- 3. RPC — upsert item (validasi P0 & completed-requires-evidence)
-- ============================================================
create or replace function public.trace_upsert_action_item(
  p_id uuid,p_plan_id uuid,p_title text,p_owner text,p_priority text,p_status text,
  p_due_date date,p_measure text,p_baseline numeric,p_target numeric,p_evidence jsonb,p_dependencies jsonb)
returns public.trace_action_items
language plpgsql security definer set search_path=public as $$
declare v public.trace_action_items;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_ACTIONPLAN_ACTOR_FORBIDDEN'; end if;
  if p_title is null or length(trim(p_title))=0 or p_owner is null or length(trim(p_owner))=0 then
    raise exception 'TRACE_ACTIONITEM_IDENTITY_REQUIRED'; end if;
  if p_measure is null or length(trim(p_measure))=0 then raise exception 'TRACE_ACTIONITEM_MEASURE_REQUIRED'; end if;
  if p_priority not in ('P0','P1','P2','P3') then raise exception 'TRACE_ACTIONITEM_PRIORITY_INVALID'; end if;
  if p_status not in ('planned','in_progress','blocked','completed','cancelled') then raise exception 'TRACE_ACTIONITEM_STATUS_INVALID'; end if;
  if p_priority='P0' and p_target is not null and p_baseline is not null and p_target = p_baseline then
    raise exception 'TRACE_ACTIONITEM_P0_TARGET_MUST_DIFFER_FROM_BASELINE';
  end if;
  if p_status='completed' and jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) = 0 then
    raise exception 'TRACE_ACTIONITEM_COMPLETED_REQUIRES_EVIDENCE';
  end if;

  if p_id is null then
    insert into public.trace_action_items(
      plan_id,title,owner,priority,status,due_date,measure,baseline,target,evidence,dependencies)
    values(
      p_plan_id,trim(p_title),trim(p_owner),p_priority,p_status,p_due_date,trim(p_measure),
      p_baseline,p_target,coalesce(p_evidence,'[]'::jsonb),coalesce(p_dependencies,'[]'::jsonb))
    returning * into v;
  else
    update public.trace_action_items set
      title=trim(p_title), owner=trim(p_owner), priority=p_priority, status=p_status,
      due_date=p_due_date, measure=trim(p_measure), baseline=p_baseline, target=p_target,
      evidence=coalesce(p_evidence,'[]'::jsonb), dependencies=coalesce(p_dependencies,'[]'::jsonb),
      updated_at=now()
    where id=p_id
    returning * into v;
    if not found then raise exception 'TRACE_ACTIONITEM_NOT_FOUND'; end if;
  end if;

  update public.trace_action_plans set version=version+1, updated_at=now() where id=v.plan_id;
  perform public.trace_append_audit_event(
    case when p_id is null then 'create' else 'update' end,'action_item',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_upsert_action_item(uuid,uuid,text,text,text,text,date,text,numeric,numeric,jsonb,jsonb) from public;
grant execute on function public.trace_upsert_action_item(uuid,uuid,text,text,text,text,date,text,numeric,numeric,jsonb,jsonb) to authenticated;

create or replace function public.trace_get_action_items(p_plan_id uuid)
returns setof public.trace_action_items
language sql stable security definer set search_path=public as $$
  select * from public.trace_action_items
  where plan_id=p_plan_id and public.trace_is_team_member()
  order by case priority when 'P0' then 0 when 'P1' then 1 when 'P2' then 2 else 3 end, due_date asc nulls last;
$$;
revoke all on function public.trace_get_action_items(uuid) from public;
grant execute on function public.trace_get_action_items(uuid) to authenticated;

-- ============================================================
-- 4. RPC — ringkasan progres (mirror summarizeActionPlan di actionPlan.ts,
--    dipakai utk kartu dashboard tanpa perlu tarik semua item ke client)
-- ============================================================
create or replace function public.trace_action_plan_summary(p_plan_id uuid)
returns table(total int, completed int, blocked int, overdue int, completion_pct numeric, execution_pct numeric)
language sql stable security definer set search_path=public as $$
  select
    count(*)::int,
    count(*) filter (where status='completed')::int,
    count(*) filter (where status='blocked')::int,
    count(*) filter (where due_date is not null and due_date < current_date and status not in ('completed','cancelled'))::int,
    case when count(*)=0 then 0 else round(count(*) filter (where status='completed')::numeric/count(*)*100,1) end,
    case when count(*)=0 then 0 else round(
      sum(case status when 'completed' then 1 when 'in_progress' then 0.5 else 0 end)::numeric/count(*)*100,1) end
  from public.trace_action_items where plan_id=p_plan_id and public.trace_is_team_member();
$$;
revoke all on function public.trace_action_plan_summary(uuid) from public;
grant execute on function public.trace_action_plan_summary(uuid) to authenticated;
