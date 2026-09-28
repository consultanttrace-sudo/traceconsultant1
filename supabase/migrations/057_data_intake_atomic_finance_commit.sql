-- Audit finding (2026-09-27), traced live against a real project via the
-- SQL Editor, not assumed from reading code: a user's Approve click
-- genuinely succeeded server-side (trace_transition_data_intake set
-- status='approved', proven by the row's client_id being non-null and
-- correct) but the immediately-following, SEPARATE frontend call to
-- trace_commit_intake_finance() failed -- leaving the row permanently
-- stuck as "approved" with zero trace_finance_records and no way to
-- retell the difference from a genuinely-finished approval. Overview
-- reads trace_finance_records, so this silently reads as "no data".
--
-- Root cause: Approve was ever only two independent RPC calls
-- (transition, then commit-finance) with no shared transaction between
-- them. Whatever the second call's real reason for failing was, it
-- never had a chance to roll back the first.
--
-- Fix: fold the finance commit into the SAME transaction as the status
-- transition. trace_transition_data_intake now calls
-- trace_commit_intake_finance(v_client, v_hash) itself, only when
-- p_status='approved', immediately after the row is written and while
-- still inside the same function invocation -- so a Postgres function
-- call is not its own transaction; if the finance commit raises, the
-- whole thing (including the status write) rolls back together.
-- 'approved' can no longer exist without matching trace_finance_records
-- (or neither exists at all). Re-submitting p_status='approved' for a
-- row that is already 'approved' is already an allowed idempotent
-- transition (see migration 056) and now doubles as the retry path for
-- rows stuck in the old broken state, since it re-attempts the finance
-- commit every time.
--
-- This also fixes error visibility for free, without touching the
-- frontend's error handling: this whole call already goes through
-- netlify/functions/data-intake-import.js, which inspects the RPC
-- error's message and re-throws a proper `new Error(...)` with the
-- exact TRACE_* reason -- unlike the old separate direct
-- supabase.rpc('trace_commit_intake_finance', ...) call from the
-- frontend, whose raw error object was thrown as-is and swallowed by
-- an `e instanceof Error` check further up (see accompanying frontend
-- fix). data-intake-import.js's error mapping is extended in this same
-- change to translate the TRACE_FINANCE_* / TRACE_PERIOD_LOCKED codes
-- that can now surface through this one endpoint.
create or replace function public.trace_transition_data_intake(
  p_source_hash text,p_source_name text,p_source_type text,p_status text,
  p_payload jsonb default '{}'::jsonb,p_evidence jsonb default '[]'::jsonb,p_client_id text default null
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  v_actor uuid:=auth.uid();
  v_row public.trace_data_intake_imports%rowtype;
  v_draft public.trace_data_intake_imports%rowtype;
  v_draft_found boolean:=false;
  v_current text:='none';
  v_client text:=nullif(trim(coalesce(p_client_id,p_payload->>'organizationId')),'');
  v_hash text:=lower(p_source_hash);
  v_finance jsonb:=null;
begin
  if v_actor is null then raise exception 'TRACE_IMPORT_AUTH_REQUIRED'; end if;
  if not public.trace_is_team_member() then raise exception 'TRACE_IMPORT_TEAM_MEMBER_REQUIRED'; end if;
  if p_status not in ('draft','reviewed','approved','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS'; end if;
  if p_source_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'TRACE_IMPORT_INVALID_SOURCE_HASH'; end if;
  if v_client is not null and not public.trace_is_org_member(v_client) then raise exception 'TRACE_IMPORT_CLIENT_FORBIDDEN'; end if;
  if p_status='approved' and v_client is null then raise exception 'TRACE_IMPORT_CLIENT_REQUIRED'; end if;

  if v_client is not null then
    -- This actor's own not-yet-attached draft, if any, is the one row a
    -- plain client-scoped lookup can't see (its client_id is still null)
    -- -- find and lock it explicitly so it can be attached below instead
    -- of creating a second, duplicate row for the same file.
    select * into v_draft from public.trace_data_intake_imports
      where actor_user_id=v_actor and source_hash=v_hash and client_id is null for update;
    v_draft_found:=found;
    if v_draft_found then
      v_current:=v_draft.status;
    else
      select status into v_current from public.trace_data_intake_imports
        where client_id=v_client and source_hash=v_hash for update;
      v_current:=coalesce(v_current,'none');
    end if;
  else
    select status into v_current from public.trace_data_intake_imports
      where actor_user_id=v_actor and source_hash=v_hash and client_id is null for update;
    v_current:=coalesce(v_current,'none');
  end if;

  if v_current='none' and p_status<>'draft' then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:none:%',p_status;
  elsif v_current='draft' and p_status not in ('draft','reviewed','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:draft:%',p_status;
  elsif v_current='reviewed' and p_status not in ('reviewed','approved','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:reviewed:%',p_status;
  elsif v_current='approved' and p_status not in ('approved','rejected') then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:approved:%',p_status;
  elsif v_current='rejected' and p_status<>'draft' then raise exception 'TRACE_IMPORT_INVALID_STATUS_TRANSITION:rejected:%',p_status; end if;

  begin
    if v_draft_found then
      update public.trace_data_intake_imports
        set status=p_status,payload=coalesce(p_payload,'{}'),evidence=coalesce(p_evidence,'[]'),client_id=v_client,updated_at=now()
        where id=v_draft.id
        returning * into v_row;
    elsif v_client is not null then
      insert into public.trace_data_intake_imports(actor_user_id,source_hash,source_name,source_type,status,payload,evidence,client_id)
      values(v_actor,v_hash,left(coalesce(p_source_name,'unknown'),255),left(coalesce(p_source_type,'unknown'),40),p_status,coalesce(p_payload,'{}'),coalesce(p_evidence,'[]'),v_client)
      on conflict (client_id, source_hash) where client_id is not null
      do update set status=excluded.status,payload=excluded.payload,evidence=excluded.evidence,updated_at=now()
      returning * into v_row;
    else
      insert into public.trace_data_intake_imports(actor_user_id,source_hash,source_name,source_type,status,payload,evidence,client_id)
      values(v_actor,v_hash,left(coalesce(p_source_name,'unknown'),255),left(coalesce(p_source_type,'unknown'),40),p_status,coalesce(p_payload,'{}'),coalesce(p_evidence,'[]'),null)
      on conflict (actor_user_id, source_hash) where client_id is null
      do update set status=excluded.status,payload=excluded.payload,evidence=excluded.evidence,updated_at=now()
      returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'TRACE_IMPORT_CONCURRENT_WRITE: import untuk client/file ini baru saja diproses proses lain, muat ulang lalu coba lagi';
  end;

  -- Atomic with the status write above: if this raises (negative
  -- amount, scope mismatch, etc.), the whole transaction -- including
  -- the UPDATE/INSERT that just set status='approved' -- rolls back, so
  -- the row falls back to its previous status instead of getting stuck
  -- "approved" with no finance records.
  if p_status='approved' then
    v_finance:=public.trace_commit_intake_finance(v_client,v_hash);
  end if;

  return jsonb_build_object('idempotent',v_current<>'none' and v_current=p_status,'import',to_jsonb(v_row),'finance',v_finance);
end; $$;
revoke all on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) to authenticated;
