-- TRACE v72.2 — durable Acquisition job/checkpoint RPC boundary + intake metadata.
-- Browser no longer performs direct writes to trace_jobs/checkpoints. This keeps
-- RLS fail-closed while preserving the authenticated actor boundary.

create or replace function public.trace_create_acquisition_job(
  p_job_id uuid,
  p_job_type text default 'acquisition_discovery',
  p_scope jsonb default '{}'::jsonb,
  p_config jsonb default '{}'::jsonb,
  p_progress jsonb default '{}'::jsonb
) returns public.trace_jobs
language plpgsql security definer set search_path=public as $$
declare r public.trace_jobs;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_JOB_ACTOR_FORBIDDEN'; end if;
  if p_job_type not in ('acquisition_discovery','acquisition_research') then raise exception 'TRACE_JOB_TYPE_INVALID'; end if;
  insert into public.trace_jobs(id,job_type,status,requested_by,scope,config,progress,started_at,heartbeat_at)
  values(coalesce(p_job_id,gen_random_uuid()),p_job_type,'RUNNING',auth.uid(),coalesce(p_scope,'{}'),coalesce(p_config,'{}'),coalesce(p_progress,'{}'),now(),now())
  on conflict(id) do update set heartbeat_at=now()
  returning * into r;
  return r;
end; $$;
revoke all on function public.trace_create_acquisition_job(uuid,text,jsonb,jsonb,jsonb) from public;
grant execute on function public.trace_create_acquisition_job(uuid,text,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.trace_update_acquisition_job(
  p_job_id uuid, p_status text, p_progress jsonb default '{}'::jsonb, p_error jsonb default null
) returns public.trace_jobs
language plpgsql security definer set search_path=public as $$
declare r public.trace_jobs; finish_at timestamptz;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_JOB_ACTOR_FORBIDDEN'; end if;
  if p_status not in ('QUEUED','RUNNING','PAUSING','PAUSED','STOPPING','STOPPED','COMPLETED','PARTIAL_FAILURE','FAILED','RESUMABLE') then raise exception 'TRACE_JOB_STATUS_INVALID'; end if;
  finish_at := case when p_status in ('COMPLETED','STOPPED','FAILED','PARTIAL_FAILURE') then now() else null end;
  update public.trace_jobs
  set status=p_status, progress=coalesce(p_progress,progress), error=p_error, heartbeat_at=now(), finished_at=finish_at
  where id=p_job_id and (requested_by=auth.uid() or public.trace_is_leader())
  returning * into r;
  if not found then raise exception 'TRACE_JOB_NOT_FOUND_OR_FORBIDDEN'; end if;
  return r;
end; $$;
revoke all on function public.trace_update_acquisition_job(uuid,text,jsonb,jsonb) from public;
grant execute on function public.trace_update_acquisition_job(uuid,text,jsonb,jsonb) to authenticated;

create or replace function public.trace_save_acquisition_checkpoint(
  p_job_id uuid, p_sequence_no bigint, p_stats jsonb default '{}'::jsonb, p_payload jsonb default '{}'::jsonb
) returns public.trace_job_checkpoints
language plpgsql security definer set search_path=public as $$
declare r public.trace_job_checkpoints;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_JOB_ACTOR_FORBIDDEN'; end if;
  if p_sequence_no < 1 then raise exception 'TRACE_CHECKPOINT_SEQUENCE_INVALID'; end if;
  if not exists(select 1 from public.trace_jobs where id=p_job_id and (requested_by=auth.uid() or public.trace_is_leader())) then raise exception 'TRACE_JOB_NOT_FOUND_OR_FORBIDDEN'; end if;
  insert into public.trace_job_checkpoints(job_id,sequence_no,stats,payload)
  values(p_job_id,p_sequence_no,coalesce(p_stats,'{}'),coalesce(p_payload,'{}'))
  on conflict(job_id,sequence_no) do update set stats=excluded.stats,payload=excluded.payload
  returning * into r;
  return r;
end; $$;
revoke all on function public.trace_save_acquisition_checkpoint(uuid,bigint,jsonb,jsonb) from public;
grant execute on function public.trace_save_acquisition_checkpoint(uuid,bigint,jsonb,jsonb) to authenticated;

-- Keep Data Intake's scope in the first-class column for every future write.
create or replace function public.trace_transition_data_intake(
  p_source_hash text,p_source_name text,p_source_type text,p_status text,
  p_payload jsonb default '{}'::jsonb,p_evidence jsonb default '[]'::jsonb,p_client_id text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid:=auth.uid(); v_row public.trace_data_intake_imports%rowtype; v_existing public.trace_data_intake_imports%rowtype;
  v_current text:='none'; v_client text:=nullif(trim(coalesce(p_client_id,p_payload->>'organizationId')),'');
begin
  if v_actor is null then raise exception 'TRACE_IMPORT_AUTH_REQUIRED'; end if;
  if not public.trace_is_team_member() then raise exception 'TRACE_IMPORT_TEAM_MEMBER_REQUIRED'; end if;
  if p_status not in ('draft','reviewed','approved','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS'; end if;
  if p_source_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'TRACE_IMPORT_INVALID_SOURCE_HASH'; end if;
  if v_client is not null and not public.trace_is_org_member(v_client) then raise exception 'TRACE_IMPORT_CLIENT_FORBIDDEN'; end if;
  if p_status='approved' and v_client is null then raise exception 'TRACE_IMPORT_CLIENT_REQUIRED'; end if;
  select * into v_existing from public.trace_data_intake_imports where actor_user_id=v_actor and source_hash=lower(p_source_hash) for update;
  if found then v_current:=v_existing.status; end if;
  if v_current='none' and p_status<>'draft' then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:none:%',p_status;
  elsif v_current='draft' and p_status not in ('draft','reviewed','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:draft:%',p_status;
  elsif v_current='reviewed' and p_status not in ('reviewed','approved','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:reviewed:%',p_status;
  elsif v_current='approved' and p_status not in ('approved','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:approved:%',p_status;
  elsif v_current='rejected' and p_status<>'draft' then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:rejected:%',p_status; end if;
  if v_current='none' then
    insert into public.trace_data_intake_imports(actor_user_id,source_hash,source_name,source_type,status,payload,evidence,client_id)
    values(v_actor,lower(p_source_hash),left(coalesce(p_source_name,'unknown'),255),left(coalesce(p_source_type,'unknown'),40),p_status,coalesce(p_payload,'{}'),coalesce(p_evidence,'[]'),case when v_client is not null then v_client else null end)
    returning * into v_row;
  else
    update public.trace_data_intake_imports set status=p_status,payload=coalesce(p_payload,'{}'),evidence=coalesce(p_evidence,'[]'),client_id=coalesce(v_client,client_id),updated_at=now()
    where id=v_existing.id returning * into v_row;
  end if;
  return jsonb_build_object('idempotent',v_current<>'none' and v_current=p_status,'import',to_jsonb(v_row));
end; $$;
revoke all on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) to authenticated;

comment on function public.trace_create_acquisition_job(uuid,text,jsonb,jsonb,jsonb) is 'Authenticated durable Acquisition job creation; browser direct table writes are intentionally avoided.';
comment on function public.trace_save_acquisition_checkpoint(uuid,bigint,jsonb,jsonb) is 'Authenticated durable Acquisition checkpoint write with ownership enforcement.';
