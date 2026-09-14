-- TRACE collaboration atomic transition. Additive only.
-- Prevents clients from bypassing the core version contract with a direct UPDATE.
create or replace function public.trace_collaboration_task_update_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.version <> old.version + 1 then raise exception 'TRACE_TASK_VERSION_MISMATCH'; end if;
    if new.created_by is distinct from old.created_by then raise exception 'TRACE_TASK_CREATOR_IMMUTABLE'; end if;
    if new.status is distinct from old.status and not (
      (old.status='open' and new.status in ('in_progress','blocked','cancelled')) or
      (old.status='in_progress' and new.status in ('open','blocked','done','cancelled')) or
      (old.status='blocked' and new.status in ('open','in_progress','cancelled')) or
      (old.status='done' and new.status='done') or
      (old.status='cancelled' and new.status='cancelled')
    ) then raise exception 'TRACE_TASK_INVALID_STATUS_TRANSITION:%:%',old.status,new.status; end if;
    if new.status='done' and jsonb_array_length(coalesce(new.evidence_ids,'[]'::jsonb))=0 then raise exception 'TRACE_TASK_EVIDENCE_REQUIRED'; end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_trace_collab_task_update_guard on public.trace_collaboration_tasks;
create trigger trg_trace_collab_task_update_guard before update on public.trace_collaboration_tasks for each row execute function public.trace_collaboration_task_update_guard();

-- Atomic transition + immutable audit record. expected_version is the optimistic lock.
create or replace function public.trace_transition_collaboration_task(
  p_task_id uuid,
  p_status text,
  p_expected_version bigint,
  p_evidence_ids jsonb default null,
  p_reason text default null
) returns public.trace_collaboration_tasks
language plpgsql security definer set search_path=public as $$
declare t public.trace_collaboration_tasks;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_TASK_ACTOR_FORBIDDEN'; end if;
  select * into t from public.trace_collaboration_tasks where id=p_task_id for update;
  if not found then raise exception 'TRACE_TASK_NOT_FOUND'; end if;
  if t.version <> p_expected_version then raise exception 'TRACE_TASK_VERSION_MISMATCH'; end if;
  update public.trace_collaboration_tasks
    set status=p_status,
        evidence_ids=coalesce(p_evidence_ids,evidence_ids),
        version=version+1,
        updated_at=now()
  where id=p_task_id and version=p_expected_version
  returning * into t;
  if not found then raise exception 'TRACE_TASK_CONCURRENT_UPDATE'; end if;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),'update','collaboration_task',t.id::text,
    jsonb_build_object('status',p_status,'version',p_expected_version),
    jsonb_build_object('status',t.status,'version',t.version,'evidence_ids',t.evidence_ids),p_reason);
  return t;
end; $$;
revoke all on function public.trace_transition_collaboration_task(uuid,text,bigint,jsonb,text) from public;
grant execute on function public.trace_transition_collaboration_task(uuid,text,bigint,jsonb,text) to authenticated;

-- Audit log remains append-only: there is deliberately no client UPDATE/DELETE grant.
