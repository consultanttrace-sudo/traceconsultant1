-- TRACE v72.9 — F&B Target & Capacity Planner
create table if not exists public.trace_fnb_target_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.trace_clients(id) on delete cascade,
  outlet_id uuid null,
  plan_name text not null,
  period date not null,
  assumptions jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  evidence_source text not null default 'manual' check (evidence_source in ('manual','imported','system')),
  evidence_note text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trace_fnb_target_client_period on public.trace_fnb_target_plans(client_id,period);
alter table public.trace_fnb_target_plans enable row level security;
drop policy if exists trace_fnb_target_select on public.trace_fnb_target_plans;
create policy trace_fnb_target_select on public.trace_fnb_target_plans for select to authenticated using (public.trace_user_can_access_client(client_id));
drop policy if exists trace_fnb_target_insert on public.trace_fnb_target_plans;
create policy trace_fnb_target_insert on public.trace_fnb_target_plans for insert to authenticated with check (public.trace_user_can_access_client(client_id));
drop policy if exists trace_fnb_target_update on public.trace_fnb_target_plans;
create policy trace_fnb_target_update on public.trace_fnb_target_plans for update to authenticated using (public.trace_user_can_access_client(client_id)) with check (public.trace_user_can_access_client(client_id));
drop policy if exists trace_fnb_target_delete on public.trace_fnb_target_plans;
create policy trace_fnb_target_delete on public.trace_fnb_target_plans for delete to authenticated using (public.trace_user_can_access_client(client_id));
create or replace function public.trace_upsert_fnb_target_plan(p_id uuid,p_client_id uuid,p_outlet_id uuid,p_plan_name text,p_period date,p_assumptions jsonb,p_result jsonb,p_evidence_source text,p_evidence_note text,p_expected_version integer default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_version integer;
begin
 if not public.trace_user_can_access_client(p_client_id) then raise exception 'client scope denied'; end if;
 if p_id is null then insert into public.trace_fnb_target_plans(client_id,outlet_id,plan_name,period,assumptions,result,evidence_source,evidence_note) values(p_client_id,p_outlet_id,p_plan_name,p_period,p_assumptions,p_result,coalesce(p_evidence_source,'manual'),p_evidence_note) returning id into v_id; return v_id; end if;
 select version into v_version from public.trace_fnb_target_plans where id=p_id and client_id=p_client_id for update;
 if v_version is null then raise exception 'plan not found'; end if;
 if p_expected_version is not null and v_version<>p_expected_version then raise exception 'version conflict'; end if;
 update public.trace_fnb_target_plans set outlet_id=p_outlet_id,plan_name=p_plan_name,period=p_period,assumptions=p_assumptions,result=p_result,evidence_source=coalesce(p_evidence_source,'manual'),evidence_note=p_evidence_note,version=version+1,updated_at=now() where id=p_id and client_id=p_client_id returning id into v_id; return v_id;
end $$;
create or replace function public.trace_delete_fnb_target_plan(p_id uuid,p_client_id uuid) returns boolean language plpgsql security definer set search_path=public as $$ begin if not public.trace_user_can_access_client(p_client_id) then raise exception 'client scope denied'; end if; delete from public.trace_fnb_target_plans where id=p_id and client_id=p_client_id; return found; end $$;
grant execute on function public.trace_upsert_fnb_target_plan(uuid,uuid,uuid,text,date,jsonb,jsonb,text,text,integer) to authenticated;
grant execute on function public.trace_delete_fnb_target_plan(uuid,uuid) to authenticated;
grant select on public.trace_fnb_target_plans to authenticated;
