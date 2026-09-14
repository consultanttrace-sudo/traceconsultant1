-- TRACE canonical POS import commit. Server-side validation + idempotency.
-- Additive migration: no existing table is dropped or renamed.

create or replace function public.trace_commit_canonical_pos_import(
  p_organization_id text,
  p_source_hash text,
  p_source_name text,
  p_provider text,
  p_rows jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid();
  item jsonb;
  ingestion_id uuid;
  inserted_ingestion integer := 0;
  inserted_events integer := 0;
  duplicate_rows integer := 0;
  rejected_rows integer := 0;
  occurred timestamptz;
  event_type text;
  amount_value numeric;
  qty_value numeric;
  unit_price_value numeric;
  gross_value numeric;
  discount_value numeric;
  net_value numeric;
  payment_value numeric;
  record_id text;
  currency_value text;
  product_id_value uuid;
  row_errors jsonb;
begin
  if actor is null then raise exception 'TRACE_CANONICAL_AUTH_REQUIRED'; end if;
  if not public.trace_is_org_member(p_organization_id) then raise exception 'TRACE_CANONICAL_ORG_FORBIDDEN'; end if;
  if p_source_hash !~ '^[0-9a-fA-F]{64}$' then raise exception 'TRACE_CANONICAL_SOURCE_HASH_INVALID'; end if;
  if not exists (select 1 from public.trace_data_intake_imports where actor_user_id=actor and source_hash=lower(p_source_hash) and status='approved') then raise exception 'TRACE_CANONICAL_IMPORT_NOT_APPROVED'; end if;
  if not exists (select 1 from public.trace_data_intake_imports where actor_user_id=actor and source_hash=lower(p_source_hash) and status='approved' and payload->>'organizationId'=p_organization_id) then raise exception 'TRACE_CANONICAL_ORG_MISMATCH'; end if;
  if p_provider not in ('csv','excel','moka','pawoon','majoo','qasir','custom_pos','api','webhook','manual') then raise exception 'TRACE_CANONICAL_PROVIDER_INVALID'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then raise exception 'TRACE_CANONICAL_ROWS_INVALID'; end if;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    row_errors := coalesce(item->'issues','[]'::jsonb);
    record_id := nullif(btrim(item->>'sourceRecordId'),'');
    if record_id is null then rejected_rows:=rejected_rows+1; continue; end if;
    if jsonb_array_length(row_errors)>0 then rejected_rows:=rejected_rows+1; continue; end if;
    occurred := nullif(item->>'occurredAt','')::timestamptz;
    qty_value := (item->>'qty')::numeric;
    unit_price_value := (item->>'unitPrice')::numeric;
    gross_value := (item->>'grossAmount')::numeric;
    discount_value := (item->>'discountAmount')::numeric;
    net_value := (item->>'netAmount')::numeric;
    payment_value := (item->>'paymentAmount')::numeric;
    amount_value := (item->>'amount')::numeric;
    currency_value := upper(coalesce(item->>'currency',''));
    event_type := item->>'type';
    if occurred is null or occurred > now() or qty_value <= 0 or unit_price_value < 0 or gross_value < 0 or discount_value < 0 or net_value < 0 or payment_value < 0 or amount_value < 0 or discount_value > gross_value or abs(net_value-(gross_value-discount_value)) > 0.01 or currency_value !~ '^[A-Z]{3}$' then
      rejected_rows:=rejected_rows+1; continue;
    end if;
    product_id_value := null;
    if coalesce(item->>'productId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then product_id_value := (item->>'productId')::uuid; end if;

    insert into public.trace_ingestion_records(organization_id,outlet_id,provider,source_record_id,source_file,source_row,payload,imported_at,normalized_at,status,validation_errors,created_by)
    values(p_organization_id,nullif(item->>'outletId',''),p_provider,record_id,left(coalesce(p_source_name,item->>'sourceFile','unknown'),255),nullif(item->>'sourceRow','')::integer,item,now(),now(),'IMPORTED','[]'::jsonb,actor)
    on conflict (organization_id,provider,source_record_id) do nothing
    returning id into ingestion_id;
    if ingestion_id is null then duplicate_rows:=duplicate_rows+1; continue; end if;
    inserted_ingestion:=inserted_ingestion+1;

    event_type := case when event_type in ('sale','void','refund','discount','price_override','payment','cash_discrepancy','comp','cancellation') then event_type else 'sale' end;
    if event_type='sale' and nullif(btrim(item->>'productName'),'') is null then
      update public.trace_ingestion_records set status='REJECTED', validation_errors='["PRODUCT_NAME_MISSING"]'::jsonb where id=ingestion_id;
      rejected_rows:=rejected_rows+1; continue;
    end if;
    insert into public.trace_pos_events(organization_id,outlet_id,employee_id,cashier_id,product_id,event_type,amount,occurred_at,source_record_id,provenance_id,created_by)
    values(p_organization_id,nullif(item->>'outletId',''),nullif(item->>'employeeId',''),nullif(item->>'cashierId',''),product_id_value,event_type,amount_value,occurred,record_id,ingestion_id,actor)
    on conflict (organization_id,source_record_id) do nothing;
    if found then inserted_events:=inserted_events+1; end if;
  end loop;

  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,after_data,reason)
  values(actor,'canonical_import_commit','canonical_import',p_source_hash,jsonb_build_object('organization_id',p_organization_id,'source_name',p_source_name,'inserted_ingestion',inserted_ingestion,'inserted_events',inserted_events,'duplicate_rows',duplicate_rows,'rejected_rows',rejected_rows),'Canonical POS import commit');
  return jsonb_build_object('sourceHash',p_source_hash,'insertedIngestion',inserted_ingestion,'insertedEvents',inserted_events,'duplicates',duplicate_rows,'rejected',rejected_rows);
end; $$;
revoke all on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) from public;
grant execute on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) to authenticated;
