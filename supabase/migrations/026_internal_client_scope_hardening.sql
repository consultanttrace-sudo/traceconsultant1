-- TRACE v70 — internal-only client scope hardening.
-- The TRACE application is for the internal team. Clients are data subjects, not application users.
-- This migration adds an audited task-creation RPC so UI code does not need a direct table insert.

create or replace function public.trace_create_collaboration_task(
  p_client_id text,
  p_title text,
  p_owner_user_id uuid,
  p_priority text default 'P2',
  p_evidence_ids jsonb default '[]'::jsonb
) returns public.trace_collaboration_tasks
language plpgsql security definer set search_path=public
as $$
declare t public.trace_collaboration_tasks;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_TASK_ACTOR_FORBIDDEN'; end if;
  if nullif(btrim(p_client_id),'') is null then raise exception 'TRACE_TASK_CLIENT_REQUIRED'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'TRACE_TASK_TITLE_REQUIRED'; end if;
  if p_priority not in ('P0','P1','P2','P3') then raise exception 'TRACE_TASK_PRIORITY_INVALID'; end if;
  if p_owner_user_id is null then raise exception 'TRACE_TASK_OWNER_REQUIRED'; end if;
  if not exists(select 1 from public.trace_team_members m where m.user_id=p_owner_user_id and m.active=true) then raise exception 'TRACE_TASK_OWNER_NOT_TEAM_MEMBER'; end if;

  insert into public.trace_collaboration_tasks(client_id,title,owner_user_id,created_by,status,priority,dependencies,evidence_ids,version)
  values(btrim(p_client_id),btrim(p_title),p_owner_user_id,auth.uid(),'open',p_priority,'[]'::jsonb,coalesce(p_evidence_ids,'[]'::jsonb),1)
  returning * into t;

  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'create','collaboration_task',t.id::text,
    jsonb_build_object('client_id',t.client_id,'title',t.title,'owner_user_id',t.owner_user_id,'priority',t.priority,'status',t.status),
    'TRACE internal client-scoped task creation');
  return t;
end; $$;
revoke all on function public.trace_create_collaboration_task(text,text,uuid,text,jsonb) from public;
grant execute on function public.trace_create_collaboration_task(text,text,uuid,text,jsonb) to authenticated;

comment on function public.trace_create_collaboration_task(text,text,uuid,text,jsonb) is 'Internal TRACE task creation; clients never authenticate to TRACE. Task is explicitly scoped to one client and audited.';
