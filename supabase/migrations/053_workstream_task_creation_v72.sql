-- TRACE v72 — jalur kerja yang menyala (src/core/workstreams.ts) → tugas nyata di trace_collaboration_tasks.
-- Additive only: tidak mengubah tabel/fungsi lama. `trace_create_collaboration_task` (migration 026) tetap
-- dipakai apa adanya oleh BusinessTwinView.tsx. Fungsi baru ini menambah due_date + catatan evidence yang
-- berasal dari jalur kerja (COGS/OPEX/labor/margin/revenue atau area yang perlu asesmen manual), supaya
-- "jalur kerja mengikuti kondisi klien" bisa langsung jadi item timeline berpemilik + bertenggat + beralasan.

create or replace function public.trace_create_workstream_task(
  p_client_id text,
  p_workstream_key text,
  p_title text,
  p_owner_user_id uuid,
  p_priority text default 'P2',
  p_due_date timestamptz default null,
  p_evidence_note text default null
) returns public.trace_collaboration_tasks
language plpgsql security definer set search_path=public
as $$
declare t public.trace_collaboration_tasks;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_TASK_ACTOR_FORBIDDEN'; end if;
  if nullif(btrim(p_client_id),'') is null then raise exception 'TRACE_TASK_CLIENT_REQUIRED'; end if;
  if nullif(btrim(p_workstream_key),'') is null then raise exception 'TRACE_TASK_WORKSTREAM_REQUIRED'; end if;
  if nullif(btrim(p_title),'') is null then raise exception 'TRACE_TASK_TITLE_REQUIRED'; end if;
  if p_priority not in ('P0','P1','P2','P3') then raise exception 'TRACE_TASK_PRIORITY_INVALID'; end if;
  if p_owner_user_id is null then raise exception 'TRACE_TASK_OWNER_REQUIRED'; end if;
  if not exists(select 1 from public.trace_team_members m where m.user_id=p_owner_user_id and m.active=true) then raise exception 'TRACE_TASK_OWNER_NOT_TEAM_MEMBER'; end if;

  insert into public.trace_collaboration_tasks(client_id,title,owner_user_id,created_by,status,priority,due_date,dependencies,evidence_ids,version)
  values(
    btrim(p_client_id),
    btrim(p_title),
    p_owner_user_id,
    auth.uid(),
    'open',
    p_priority,
    p_due_date,
    '[]'::jsonb,
    case when p_evidence_note is null then '[]'::jsonb else jsonb_build_array('workstream:'||btrim(p_workstream_key)||' — '||p_evidence_note) end,
    1
  )
  returning * into t;

  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'create','collaboration_task',t.id::text,
    jsonb_build_object('client_id',t.client_id,'title',t.title,'owner_user_id',t.owner_user_id,'priority',t.priority,'status',t.status,'due_date',t.due_date,'workstream_key',p_workstream_key),
    'TRACE workstream finding converted to task');
  return t;
end; $$;
revoke all on function public.trace_create_workstream_task(text,text,text,uuid,text,timestamptz,text) from public;
grant execute on function public.trace_create_workstream_task(text,text,text,uuid,text,timestamptz,text) to authenticated;

comment on function public.trace_create_workstream_task(text,text,text,uuid,text,timestamptz,text) is 'Creates a trace_collaboration_tasks row from a workstreams.ts finding, with owner + due date + evidence note carried over. Additive alongside trace_create_collaboration_task.';
