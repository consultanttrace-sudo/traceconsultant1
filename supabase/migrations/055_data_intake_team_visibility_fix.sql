-- BUG FIX: Data Intake import ledger (trace_data_intake_imports) was scoped by
-- actor_user_id (the uploading team member) instead of client_id (the shared
-- business scope). Every other collaborative table in TRACE (finance records,
-- clients, etc.) treats "team member" as team-wide access, consistent with
-- trace_is_org_member()'s own comment: "the organization helper is
-- intentionally team-wide for TRACE's internal OS. Client separation is a
-- data scope boundary, not an end-user membership boundary." The Data Intake
-- ledger was the one place that didn't follow this rule, because its RLS
-- policy and RPC lookups reused the "requester-or-leader" pattern meant for
-- job-cancellation control (see trace_update_acquisition_job), which does not
-- fit a shared client record.
--
-- Symptom this caused: if team member A uploads a file and gets partway
-- through Draft -> Reviewed (but has not yet clicked Approve), team member B
-- logging in and working the same client sees no trace of it at all -- the
-- RPC's own lookup (`where actor_user_id = v_actor`) can never find A's row
-- when called as B, so B is forced to start over from scratch. The same bug
-- existed in trace_commit_canonical_pos_import's approval check, so B could
-- not commit canonical POS rows against an import A had already approved.
--
-- Fix: once an import is attached to a client (client_id is set), any active
-- team member may see it and continue its review/approve lifecycle. Before a
-- client is chosen, an in-progress draft has no shared scope yet, so it stays
-- visible only to the team member who started it (falls back to the previous
-- actor_user_id behaviour). Nothing about the approval state machine itself,
-- the payload/evidence shape, or the finance/canonical commit logic changes.

drop policy if exists trace_data_intake_imports_member on public.trace_data_intake_imports;
create policy trace_data_intake_imports_member on public.trace_data_intake_imports
for all to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member() and actor_user_id=auth.uid());

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
  -- Shared lookup: once a client is attached, match on (client_id, source_hash) so any
  -- team member can find and continue an import a teammate already started or approved.
  if v_client is not null then
    select * into v_existing from public.trace_data_intake_imports where client_id=v_client and source_hash=lower(p_source_hash) for update;
    if found then v_current:=v_existing.status; end if;
  end if;
  -- Fallback: no client scope yet (or none found under it), so this is either a fresh
  -- import or a still-personal draft the current actor started before picking a client.
  if v_current='none' then
    select * into v_existing from public.trace_data_intake_imports where actor_user_id=v_actor and source_hash=lower(p_source_hash) and client_id is null for update;
    if found then v_current:=v_existing.status; end if;
  end if;
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
  -- Scoped by client + hash only (no actor filter): the import just needs to have been
  -- approved by *some* team member for this client, not specifically by the caller.
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
  update public.trace_data_intake_imports set client_id=p_organization_id,updated_at=now() where source_hash=lower(p_source_hash) and status='approved';
  perform public.trace_append_audit_event('canonical_import_commit','canonical_import',p_source_hash,null,jsonb_build_object('client_id',p_organization_id,'inserted_ingestion',inserted_ingestion,'inserted_events',inserted_events,'duplicates',duplicate_rows,'rejected',rejected_rows),null);
  return jsonb_build_object('sourceHash',p_source_hash,'clientId',p_organization_id,'insertedIngestion',inserted_ingestion,'insertedEvents',inserted_events,'duplicates',duplicate_rows,'rejected',rejected_rows);
end; $$;
revoke all on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) from public;
grant execute on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) to authenticated;
