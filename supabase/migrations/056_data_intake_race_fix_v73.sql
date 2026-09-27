-- Audit v73 (2026-09-26), finding #1: migration 055 made the Data Intake
-- lookup client-scoped (client_id, source_hash) for team-wide visibility,
-- but the only unique constraint on trace_data_intake_imports was still
-- the original migration-006 unique(actor_user_id, source_hash) -- keyed
-- on the uploader, not the client. Two problems follow from that mismatch,
-- one the audit found and one found here while fixing it:
--
--   a) Cross-actor race (the audit's finding): the client-scoped
--      "select ... for update" in trace_transition_data_intake /
--      trace_commit_canonical_pos_import can only lock a row that already
--      exists. Two team members hitting the same client+file at nearly
--      the same time can both see "not found yet" and both INSERT --
--      the old constraint never fires, because each actor's own
--      (actor_user_id, source_hash) pair really is unique on its own.
--      Result: two rows for one client+file (the "split view" bug 055
--      was meant to close), and -- not previously flagged -- a
--      cross-client contamination risk in trace_commit_canonical_pos_import,
--      whose closing UPDATE matched only on (source_hash, status='approved')
--      with no client_id filter, so committing client X's import could
--      silently overwrite client Y's row's client_id if a duplicate ever
--      existed. Also unhandled: raw unique_violation reaching the caller
--      instead of a TRACE_IMPORT_* error -- the audit's own "more likely"
--      case, the same actor double-clicking submit.
--   b) Cross-client false collision (found fixing (a), not in the
--      original audit): that same blanket constraint also blocks
--      something it was never meant to -- the same team member uploading
--      the literal same file (same hash) for two DIFFERENT clients fails
--      today, because unique(actor_user_id, source_hash) doesn't know
--      client_id exists.
--
-- Fix:
--   1. Two PARTIAL unique indexes instead of one blanket constraint --
--      (client_id, source_hash) where client_id is not null, and
--      (actor_user_id, source_hash) where client_id is null (preserves
--      migration 006's original per-actor protection for not-yet-attached
--      drafts, scoped so it no longer reaches client-linked rows).
--   2. trace_transition_data_intake rewritten to use INSERT ... ON
--      CONFLICT ... DO UPDATE against whichever partial index applies
--      (Postgres allows one conflict target per statement, so the branch
--      on v_client picks it), instead of select-then-insert-or-update.
--      The one case a plain client-scoped upsert can't see -- this
--      actor's own not-yet-attached draft for the same file, now being
--      attached to a client for the first time -- is still located
--      explicitly and updated by id, same as before.
--   3. trace_commit_canonical_pos_import's closing UPDATE now also
--      requires client_id = the committing client (or null), closing (a)'s
--      contamination risk.
--   4. Both functions now catch unique_violation and raise a
--      TRACE_IMPORT_*/TRACE_CANONICAL_* error instead of letting a raw
--      Postgres error reach the UI.
--
-- Left deliberately untouched: DO NOT set actor_user_id in any DO UPDATE
-- SET clause below. Migration 008's trg_trace_data_intake_import_guard
-- raises TRACE_IMPORT_PROVENANCE_IMMUTABLE if actor_user_id (or
-- source_hash) changes on UPDATE -- so preserving the original importer
-- on conflict isn't just an audit-trail nicety, it's required for the
-- upsert to succeed at all when the conflicting row belongs to someone
-- else. Confirmed by reading migration 008 directly, not assumed.
--
-- Not done here, and why: dropping migration 006's original constraint
-- below assumes Postgres's default auto-generated name for an inline
-- UNIQUE(...) on CREATE TABLE
-- (trace_data_intake_imports_actor_user_id_source_hash_key). This sandbox
-- has no live Supabase project to confirm that name against the actual
-- one. The DROP is guarded with IF EXISTS specifically so a name mismatch
-- fails safe: the migration still completes and fix (a) above -- the
-- audit's actual reported bug -- is fully closed regardless, because it's
-- closed by the new partial indexes existing, not by the old constraint
-- being gone. Only fix (b) (the cross-client false collision found here)
-- would silently stay unfixed if the name is wrong. Verify with
-- \d trace_data_intake_imports against the real project and drop it by
-- hand if this didn't match.
--
-- Pre-flight duplicate check, added after actually reproducing this
-- exact scenario against a real local Postgres 16 (not asserted from
-- reading the SQL): if the race in finding (a) has already fired for
-- real, at least one (client_id, source_hash) pair already has more than
-- one row, and CREATE UNIQUE INDEX below fails outright with a bare
-- "could not create unique index ... Key is duplicated" -- which stops
-- this whole migration (including the function fixes) without saying
-- how many pairs are affected or what to do about it. Surface that
-- clearly instead of letting the migration die on an opaque error.
do $$
declare v_client_dupes int; v_actor_dupes int;
begin
  select count(*) into v_client_dupes from (
    select 1 from public.trace_data_intake_imports
    where client_id is not null
    group by client_id, source_hash having count(*) > 1
  ) d;
  select count(*) into v_actor_dupes from (
    select 1 from public.trace_data_intake_imports
    where client_id is null
    group by actor_user_id, source_hash having count(*) > 1
  ) d;
  if v_client_dupes > 0 or v_actor_dupes > 0 then
    raise exception 'TRACE_MIGRATION_056_PREFLIGHT: % (client_id, source_hash) pair(s) and % (actor_user_id, source_hash) pair(s) with client_id null already have duplicate rows in trace_data_intake_imports -- likely caused by the exact race this migration fixes. Resolve them manually (merge or delete the duplicates, keeping whichever row has the most advanced status) before re-running this migration; the two CREATE UNIQUE INDEX statements below will otherwise fail.', v_client_dupes, v_actor_dupes;
  end if;
end $$;

alter table public.trace_data_intake_imports
  drop constraint if exists trace_data_intake_imports_actor_user_id_source_hash_key;

create unique index if not exists trace_data_intake_imports_actor_hash_no_client_uidx
  on public.trace_data_intake_imports (actor_user_id, source_hash)
  where client_id is null;

create unique index if not exists trace_data_intake_imports_client_hash_uidx
  on public.trace_data_intake_imports (client_id, source_hash)
  where client_id is not null;

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

  return jsonb_build_object('idempotent',v_current<>'none' and v_current=p_status,'import',to_jsonb(v_row));
end; $$;
revoke all on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) from public;
grant execute on function public.trace_transition_data_intake(text,text,text,text,jsonb,jsonb,text) to authenticated;

create or replace function public.trace_commit_canonical_pos_import(
  p_organization_id text,
  p_source_hash text,
  p_source_name text,
  p_provider text,
  p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare actor uuid := auth.uid(); item jsonb; ingestion_id uuid; inserted_ingestion integer:=0; inserted_events integer:=0; duplicate_rows integer:=0; rejected_rows integer:=0; occurred timestamptz; event_type text; amount_value numeric; qty_value numeric; unit_price_value numeric; gross_value numeric; discount_value numeric; net_value numeric; payment_value numeric; record_id text; currency_value text; product_id_value uuid; row_errors jsonb;
begin
  if actor is null then raise exception 'TRACE_CANONICAL_AUTH_REQUIRED'; end if;
  if not public.trace_is_team_member() then raise exception 'TRACE_CANONICAL_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_organization_id),'') is null then raise exception 'TRACE_CANONICAL_CLIENT_REQUIRED'; end if;
  if p_source_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'TRACE_CANONICAL_SOURCE_HASH_INVALID'; end if;
  if not exists(select 1 from public.trace_data_intake_imports where source_hash=lower(p_source_hash) and status='approved' and client_id=p_organization_id) then raise exception 'TRACE_CANONICAL_IMPORT_NOT_APPROVED_OR_SCOPED'; end if;
  if p_provider not in ('csv','excel','moka','pawoon','majoo','qasir','custom_pos','api','webhook','manual') then raise exception 'TRACE_CANONICAL_PROVIDER_INVALID'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows)>2000 then raise exception 'TRACE_CANONICAL_ROWS_INVALID'; end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    row_errors:=coalesce(item->'issues','[]'::jsonb); record_id:=nullif(btrim(item->>'sourceRecordId'),'');
    if record_id is null or jsonb_array_length(row_errors)>0 then rejected_rows:=rejected_rows+1; continue; end if;
    begin occurred:=nullif(item->>'occurredAt','')::timestamptz; exception when others then occurred:=null; end;
    begin qty_value:=(item->>'qty')::numeric; unit_price_value:=(item->>'unitPrice')::numeric; gross_value:=(item->>'grossAmount')::numeric; discount_value:=(item->>'discountAmount')::numeric; net_value:=(item->>'netAmount')::numeric; payment_value:=(item->>'paymentAmount')::numeric; amount_value:=(item->>'amount')::numeric; exception when others then rejected_rows:=rejected_rows+1; continue; end;
    currency_value:=upper(coalesce(item->>'currency',''));
    if occurred is null or occurred>now() or qty_value<=0 or unit_price_value<0 or gross_value<0 or discount_value<0 or net_value<0 or payment_value<0 or amount_value<0 or discount_value>gross_value or abs(net_value-(gross_value-discount_value))>0.01 or currency_value !~ '^[A-Z]{3}$' then rejected_rows:=rejected_rows+1; continue; end if;
    product_id_value:=null; if coalesce(item->>'productId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then product_id_value:=(item->>'productId')::uuid; end if;
    insert into public.trace_ingestion_records(organization_id,outlet_id,provider,source_record_id,source_file,source_row,payload,imported_at,normalized_at,status,validation_errors,created_by)
    values(p_organization_id,nullif(item->>'outletId',''),p_provider,record_id,left(coalesce(p_source_name,item->>'sourceFile','unknown'),255),nullif(item->>'sourceRow','')::integer,item,now(),now(),'IMPORTED','[]'::jsonb,actor)
    on conflict(organization_id,provider,source_record_id) do nothing returning id into ingestion_id;
    if ingestion_id is null then duplicate_rows:=duplicate_rows+1; continue; end if; inserted_ingestion:=inserted_ingestion+1;
    event_type:=case when item->>'type' in ('sale','void','refund','discount','price_override','payment','cash_discrepancy','comp','cancellation') then item->>'type' else 'sale' end;
    if event_type='sale' and nullif(btrim(item->>'productName'),'') is null then update public.trace_ingestion_records set status='REJECTED',validation_errors='["PRODUCT_NAME_MISSING"]'::jsonb where id=ingestion_id; rejected_rows:=rejected_rows+1; continue; end if;
    insert into public.trace_pos_events(organization_id,outlet_id,employee_id,cashier_id,product_id,event_type,amount,occurred_at,source_record_id,provenance_id,created_by)
    values(p_organization_id,nullif(item->>'outletId',''),nullif(item->>'employeeId',''),nullif(item->>'cashierId',''),product_id_value,event_type,amount_value,occurred,record_id,ingestion_id,actor)
    on conflict(organization_id,source_record_id) do nothing;
    if found then inserted_events:=inserted_events+1; end if;
  end loop;
  -- v73 fix: client_id filter added (was: source_hash+status only). Without
  -- it, a pre-fix duplicate row for a DIFFERENT client sharing this hash
  -- would have its client_id silently overwritten to this one too.
  begin
    update public.trace_data_intake_imports set client_id=p_organization_id,updated_at=now()
      where source_hash=lower(p_source_hash) and status='approved' and (client_id=p_organization_id or client_id is null);
  exception when unique_violation then
    raise exception 'TRACE_CANONICAL_DUPLICATE_IMPORT_ROWS: ditemukan lebih dari satu baris trace_data_intake_imports approved untuk hash file ini dari sebelum perbaikan v73 -- perlu dibersihkan manual sebelum commit ini bisa lanjut';
  end;
  perform public.trace_append_audit_event('canonical_import_commit','canonical_import',p_source_hash,null,jsonb_build_object('client_id',p_organization_id,'inserted_ingestion',inserted_ingestion,'inserted_events',inserted_events,'duplicates',duplicate_rows,'rejected',rejected_rows),null);
  return jsonb_build_object('sourceHash',p_source_hash,'clientId',p_organization_id,'insertedIngestion',inserted_ingestion,'insertedEvents',inserted_events,'duplicates',duplicate_rows,'rejected',rejected_rows);
end; $$;
revoke all on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) from public;
grant execute on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) to authenticated;
