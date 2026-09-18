-- TRACE v72.3 — Acquisition global KV read parity + explicit repair approval ledger.

create or replace function public.trace_read_global_kv(p_keys text[])
returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb:='{}'::jsonb; k text; raw text;
  allowed constant text[]:=array[
    'trace_os::trace-clients','trace_os::trace-companies','trace_os::trace-brands','trace_os::trace-outlets','trace_os::trace-team',
    'trace_os::trace-timeline','trace_os::trace-kpi-individu','trace_os::trace-kpi-indikator-def','trace_os::trace-marketing-event',
    'trace_os::acquisitionLeads'
  ];
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_GLOBAL_KV_ACTOR_FORBIDDEN'; end if;
  foreach k in array coalesce(p_keys,'{}'::text[]) loop
    if k is null or not(k=any(allowed)) then raise exception 'TRACE_GLOBAL_KV_KEY_FORBIDDEN'; end if;
    select value into raw from public.trace_kv where key=k;
    if raw is null then result:=result||jsonb_build_object(k,'[]'::jsonb); continue; end if;
    begin result:=result||jsonb_build_object(k,raw::jsonb); exception when others then raise exception 'TRACE_GLOBAL_KV_INVALID_JSON'; end;
  end loop;
  return result;
end; $$;
revoke all on function public.trace_read_global_kv(text[]) from public;
grant execute on function public.trace_read_global_kv(text[]) to authenticated;

drop function if exists public.trace_record_repair_approval(text,text,text,jsonb);

create or replace function public.trace_record_repair_approval(
  p_finding_id text, p_plan_id text, p_reason text, p_plan jsonb,
  p_scope_hash text default null, p_expires_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r_id uuid; r_scope text; r_expires timestamptz;
begin
  if not public.trace_is_leader() then raise exception 'TRACE_REPAIR_LEADER_REQUIRED'; end if;
  if nullif(trim(p_finding_id),'') is null or nullif(trim(p_plan_id),'') is null then raise exception 'TRACE_REPAIR_PLAN_REQUIRED'; end if;
  r_scope:=coalesce(nullif(trim(p_scope_hash),''), md5(p_plan::text));
  r_expires:=coalesce(p_expires_at, now()+interval '15 minutes');
  insert into public.trace_ai_approvals(actor_user_id,action,environment,scope_hash,approved_at,expires_at,status,metadata)
  values(auth.uid(),'apply_patch','workspace',r_scope,now(),r_expires,'approved',jsonb_build_object('findingId',p_finding_id,'planId',p_plan_id))
  returning id into r_id;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'repair_proposal_approved','diagnostic_repair',r_id,p_plan,coalesce(nullif(trim(p_reason),''),'Explicit repair approval'));
  return jsonb_build_object('approved',true,'approvalId',r_id,'findingId',p_finding_id,'planId',p_plan_id,'approvedAt',now(),'expiresAt',r_expires);
end; $$;
revoke all on function public.trace_record_repair_approval(text,text,text,jsonb,text,timestamptz) from public;
grant execute on function public.trace_record_repair_approval(text,text,text,jsonb,text,timestamptz) to authenticated;
