-- TRACE v72.1 — Data Intake P0 hardening.
-- Additive migration: fixes the v72 REST/RLS conflict and binds approved
-- imports to the selected client scope atomically.

create or replace function public.trace_transition_data_intake(
  p_source_hash text,
  p_source_name text,
  p_source_type text,
  p_status text,
  p_payload jsonb default '{}'::jsonb,
  p_evidence jsonb default '[]'::jsonb,
  p_client_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.trace_data_intake_imports%rowtype;
  v_existing public.trace_data_intake_imports%rowtype;
  v_current text := 'none';
  v_client text := nullif(trim(coalesce(p_client_id, p_payload->>'organizationId')), '');
begin
  if v_actor is null then raise exception 'TRACE_IMPORT_AUTH_REQUIRED'; end if;
  if not public.trace_is_team_member() then raise exception 'TRACE_IMPORT_TEAM_MEMBER_REQUIRED'; end if;
  if p_status not in ('draft','reviewed','approved','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS'; end if;
  if p_source_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'TRACE_IMPORT_INVALID_SOURCE_HASH'; end if;
  if p_status='approved' and v_client is null then raise exception 'TRACE_IMPORT_CLIENT_REQUIRED'; end if;
  if v_client is not null and not public.trace_is_org_member(v_client) then raise exception 'TRACE_IMPORT_CLIENT_FORBIDDEN'; end if;

  select * into v_existing
  from public.trace_data_intake_imports
  where actor_user_id=v_actor and source_hash=lower(p_source_hash)
  for update;
  if found then v_current := v_existing.status; end if;

  if v_current='none' and p_status<>'draft' then
    raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:none:%', p_status;
  elsif v_current='draft' and p_status not in ('draft','reviewed','rejected') then
    raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:draft:%', p_status;
  elsif v_current='reviewed' and p_status not in ('reviewed','approved','rejected') then
    raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:reviewed:%', p_status;
  elsif v_current='approved' and p_status not in ('approved','rejected') then
    raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:approved:%', p_status;
  elsif v_current='rejected' and p_status<>'draft' then
    raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:rejected:%', p_status;
  end if;

  if v_current='none' then
    insert into public.trace_data_intake_imports(actor_user_id,source_hash,source_name,source_type,status,payload,evidence,client_id)
    values(v_actor,lower(p_source_hash),left(coalesce(p_source_name,'unknown'),255),left(coalesce(p_source_type,'unknown'),40),p_status,coalesce(p_payload,'{}'::jsonb),coalesce(p_evidence,'[]'::jsonb),case when p_status='approved' then v_client else null end)
    returning * into v_row;
  else
    update public.trace_data_intake_imports
    set status=p_status,
        payload=coalesce(p_payload,'{}'::jsonb),
        evidence=coalesce(p_evidence,'[]'::jsonb),
        client_id=case when v_client is not null then v_client else client_id end,
        updated_at=now()
    where id=v_existing.id
    returning * into v_row;
  end if;

  return jsonb_build_object('idempotent',v_current<>'none' and v_current=p_status,'import',to_jsonb(v_row));
end;
$$;

-- Remove the old six-argument overload so callers cannot accidentally bypass
-- the client-aware contract.
drop function if exists public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb);
revoke all on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) to authenticated;

comment on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text)
is 'Atomic Data Intake state transition. Approved imports must be bound to an authorized client; browser must use this RPC instead of direct table REST access.';
