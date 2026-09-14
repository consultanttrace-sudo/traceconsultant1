-- TRACE additive governance correction. Do not edit already-applied migrations 011/012.
-- Fixes two concrete issues found during re-audit:
-- 1) leader/team updates were blocked by an over-restrictive created_by WITH CHECK;
-- 2) atomic task audit was recording the new status as the "before" state.

drop policy if exists trace_collab_tasks_team on public.trace_collaboration_tasks;
create policy trace_collab_tasks_team on public.trace_collaboration_tasks for all to authenticated
using(public.trace_is_team_member())
with check(public.trace_is_team_member());

create or replace function public.trace_transition_collaboration_task(
  p_task_id uuid,
  p_status text,
  p_expected_version bigint,
  p_evidence_ids jsonb default null,
  p_reason text default null
) returns public.trace_collaboration_tasks
language plpgsql security definer set search_path=public as $$
declare
  t public.trace_collaboration_tasks;
  old_status text;
  old_version bigint;
  old_evidence_ids jsonb;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_TASK_ACTOR_FORBIDDEN'; end if;
  if p_status not in ('open','in_progress','blocked','done','cancelled') then
    raise exception 'TRACE_TASK_INVALID_STATUS';
  end if;
  select * into t from public.trace_collaboration_tasks where id=p_task_id for update;
  if not found then raise exception 'TRACE_TASK_NOT_FOUND'; end if;
  if t.version <> p_expected_version then raise exception 'TRACE_TASK_VERSION_MISMATCH'; end if;
  if t.status is distinct from p_status and not (
    (t.status='open' and p_status in ('in_progress','blocked','cancelled')) or
    (t.status='in_progress' and p_status in ('open','blocked','done','cancelled')) or
    (t.status='blocked' and p_status in ('open','in_progress','cancelled')) or
    (t.status='done' and p_status='done') or
    (t.status='cancelled' and p_status='cancelled')
  ) then raise exception 'TRACE_TASK_INVALID_STATUS_TRANSITION:%:%',t.status,p_status; end if;
  old_status := t.status;
  old_version := t.version;
  old_evidence_ids := t.evidence_ids;
  if p_status='done' and jsonb_array_length(coalesce(p_evidence_ids,t.evidence_ids,'[]'::jsonb))=0 then
    raise exception 'TRACE_TASK_EVIDENCE_REQUIRED';
  end if;
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
    jsonb_build_object('status',old_status,'version',old_version,'evidence_ids',old_evidence_ids),
    jsonb_build_object('status',t.status,'version',t.version,'evidence_ids',t.evidence_ids),p_reason);
  return t;
end; $$;
revoke all on function public.trace_transition_collaboration_task(uuid,text,bigint,jsonb,text) from public;
grant execute on function public.trace_transition_collaboration_task(uuid,text,bigint,jsonb,text) to authenticated;

-- Controlled audit API must not become an arbitrary event injection surface.
create or replace function public.trace_append_audit_event(p_action text,p_entity_type text,p_entity_id text,p_before jsonb default null,p_after jsonb default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_AUDIT_ACTOR_FORBIDDEN'; end if;
  if p_action not in ('create','update','delete','approve','reject','execute','login','security') then
    raise exception 'TRACE_AUDIT_INVALID_ACTION';
  end if;
  if p_entity_type is null or length(trim(p_entity_type))=0 or p_entity_id is null or length(trim(p_entity_id))=0 then
    raise exception 'TRACE_AUDIT_ENTITY_REQUIRED';
  end if;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),p_action,p_entity_type,p_entity_id,p_before,p_after,p_reason) returning id into new_id;
  return new_id;
end; $$;
revoke all on function public.trace_append_audit_event(text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.trace_append_audit_event(text,text,text,jsonb,jsonb,text) to authenticated;
