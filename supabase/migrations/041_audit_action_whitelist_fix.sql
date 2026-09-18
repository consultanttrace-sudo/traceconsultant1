-- v72.12 — fix a live-breaking bug: trace_append_audit_event() rejects any
-- p_action not in ('create','update','delete','approve','reject','execute',
-- 'login','security'), but 9 call sites across migrations 028/032/040 pass
-- 'insert', and 030/038 pass 'canonical_import_commit'/'finance_import_commit'.
-- None of those are in the whitelist, so every one of those RPCs
-- (trace_create_inventory_item, trace_create_inventory_recipe,
-- trace_create_inventory_movement, the AR/AP/fixed-asset insert helpers,
-- canonical import commit, finance import commit) raises
-- TRACE_AUDIT_INVALID_ACTION the first time it actually runs against a real
-- database — a failure the static/simulated test suite never exercises.
-- Widen the whitelist to match the actions the codebase actually uses,
-- rather than editing nine scattered call sites.
create or replace function public.trace_append_audit_event(p_action text,p_entity_type text,p_entity_id text,p_before jsonb default null,p_after jsonb default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_AUDIT_ACTOR_FORBIDDEN'; end if;
  if p_action not in ('create','insert','update','delete','approve','reject','execute','login','security','canonical_import_commit','finance_import_commit') then
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
