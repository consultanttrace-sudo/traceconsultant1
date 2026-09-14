-- TRACE Data Intake atomic transition.
-- Additive migration: do not edit previously applied migrations.
-- Centralizes state transition + upsert so concurrent requests cannot make
-- decisions from a stale preflight read.

create or replace function public.trace_transition_data_intake(
  p_source_hash text,
  p_source_name text,
  p_source_type text,
  p_status text,
  p_payload jsonb default '{}'::jsonb,
  p_evidence jsonb default '[]'::jsonb
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
begin
  if v_actor is null then
    raise exception 'TRACE_IMPORT_AUTH_REQUIRED';
  end if;
  if not public.trace_is_team_member() then
    raise exception 'TRACE_IMPORT_TEAM_MEMBER_REQUIRED';
  end if;
  if p_status not in ('draft','reviewed','approved','rejected') then
    raise exception 'TRACE_IMPORT_INVALID_STATUS';
  end if;
  if p_source_hash !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'TRACE_IMPORT_INVALID_SOURCE_HASH';
  end if;

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
    insert into public.trace_data_intake_imports(actor_user_id,source_hash,source_name,source_type,status,payload,evidence)
    values(v_actor,lower(p_source_hash),left(coalesce(p_source_name,'unknown'),255),left(coalesce(p_source_type,'unknown'),40),p_status,coalesce(p_payload,'{}'::jsonb),coalesce(p_evidence,'[]'::jsonb))
    returning * into v_row;
  else
    update public.trace_data_intake_imports
    set status=p_status,
        payload=coalesce(p_payload,'{}'::jsonb),
        evidence=coalesce(p_evidence,'[]'::jsonb)
    where id=v_existing.id
    returning * into v_row;
  end if;

  return jsonb_build_object('idempotent',v_current<>'none' and v_current=p_status,'import',to_jsonb(v_row));
end;
$$;

revoke all on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb) from public;
grant execute on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb) to authenticated;
