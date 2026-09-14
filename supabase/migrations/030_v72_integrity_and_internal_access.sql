-- TRACE v72 — final internal access/integrity hardening.
-- All TRACE users are internal team users and may work across clients.
-- Clients themselves never receive an application role/session.

-- The organization helper is intentionally team-wide for TRACE's internal OS.
-- Client separation is a data scope boundary, not an end-user membership boundary.
create or replace function public.trace_is_org_member(p_organization_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.trace_is_team_member();
$$;
revoke all on function public.trace_is_org_member(text) from public;
grant execute on function public.trace_is_org_member(text) to authenticated;

-- Backfill the now-explicit client scope on historical import approvals when
-- the payload already contained the canonical organization/client identifier.
update public.trace_data_intake_imports
set client_id = coalesce(client_id, nullif(payload->>'organizationId',''))
where client_id is null and nullif(payload->>'organizationId','') is not null;

-- Replace the canonical import commit with a client-aware version. Approval
-- is still required and the resulting ingestion/event rows are immutable-ish
-- append records under the same client scope.
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
  if not exists(select 1 from public.trace_data_intake_imports where actor_user_id=actor and source_hash=lower(p_source_hash) and status='approved' and client_id=p_organization_id) then raise exception 'TRACE_CANONICAL_IMPORT_NOT_APPROVED_OR_SCOPED'; end if;
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
  update public.trace_data_intake_imports set client_id=p_organization_id,updated_at=now() where actor_user_id=actor and source_hash=lower(p_source_hash) and status='approved';
  perform public.trace_append_audit_event('canonical_import_commit','canonical_import',p_source_hash,null,jsonb_build_object('client_id',p_organization_id,'inserted_ingestion',inserted_ingestion,'inserted_events',inserted_events,'duplicates',duplicate_rows,'rejected',rejected_rows),null);
  return jsonb_build_object('sourceHash',p_source_hash,'clientId',p_organization_id,'insertedIngestion',inserted_ingestion,'insertedEvents',inserted_events,'duplicates',duplicate_rows,'rejected',rejected_rows);
end; $$;
revoke all on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) from public;
grant execute on function public.trace_commit_canonical_pos_import(text,text,text,text,jsonb) to authenticated;

-- Cross-table client consistency guards. A record cannot reference a parent
-- belonging to another client/organization.
create or replace function public.trace_client_fk_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare parent_client text; child_client text;
begin
  child_client:=coalesce(new.client_id,new.organization_id);
  if tg_table_name='trace_sales_transactions' and new.product_id is not null then select client_id into parent_client from public.trace_product_catalog where id=new.product_id; end if;
  if tg_table_name='trace_content_items' then select client_id into parent_client from public.trace_social_accounts where id=new.social_account_id; end if;
  if tg_table_name='trace_content_metrics' then select client_id into parent_client from public.trace_content_items where id=new.content_item_id; end if;
  if tg_table_name='trace_ad_campaigns' then select client_id into parent_client from public.trace_ad_accounts where id=new.ad_account_id; end if;
  if tg_table_name='trace_ad_metrics' then select client_id into parent_client from public.trace_ad_campaigns where id=new.campaign_id; end if;
  if tg_table_name='trace_competitor_snapshots' or tg_table_name='trace_competitor_posts' then select client_id into parent_client from public.trace_competitor_accounts where id=new.competitor_id; end if;
  if tg_table_name='trace_journal_lines' then select client_id into parent_client from public.trace_journal_entries where id=new.entry_id; end if;
  if parent_client is not null and child_client is distinct from parent_client then raise exception 'TRACE_CLIENT_SCOPE_MISMATCH'; end if;
  return new;
end; $$;

DROP TRIGGER IF EXISTS trg_trace_sales_client_fk ON public.trace_sales_transactions;
CREATE TRIGGER trg_trace_sales_client_fk BEFORE INSERT OR UPDATE ON public.trace_sales_transactions FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();
DROP TRIGGER IF EXISTS trg_trace_content_items_client_fk ON public.trace_content_items;
CREATE TRIGGER trg_trace_content_items_client_fk BEFORE INSERT OR UPDATE ON public.trace_content_items FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();
DROP TRIGGER IF EXISTS trg_trace_content_metrics_client_fk ON public.trace_content_metrics;
CREATE TRIGGER trg_trace_content_metrics_client_fk BEFORE INSERT OR UPDATE ON public.trace_content_metrics FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();
DROP TRIGGER IF EXISTS trg_trace_ad_campaigns_client_fk ON public.trace_ad_campaigns;
CREATE TRIGGER trg_trace_ad_campaigns_client_fk BEFORE INSERT OR UPDATE ON public.trace_ad_campaigns FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();
DROP TRIGGER IF EXISTS trg_trace_ad_metrics_client_fk ON public.trace_ad_metrics;
CREATE TRIGGER trg_trace_ad_metrics_client_fk BEFORE INSERT OR UPDATE ON public.trace_ad_metrics FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();
DROP TRIGGER IF EXISTS trg_trace_competitor_snapshots_client_fk ON public.trace_competitor_snapshots;
CREATE TRIGGER trg_trace_competitor_snapshots_client_fk BEFORE INSERT OR UPDATE ON public.trace_competitor_snapshots FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();
DROP TRIGGER IF EXISTS trg_trace_competitor_posts_client_fk ON public.trace_competitor_posts;
CREATE TRIGGER trg_trace_competitor_posts_client_fk BEFORE INSERT OR UPDATE ON public.trace_competitor_posts FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();
DROP TRIGGER IF EXISTS trg_trace_journal_lines_client_fk ON public.trace_journal_lines;
CREATE TRIGGER trg_trace_journal_lines_client_fk BEFORE INSERT OR UPDATE ON public.trace_journal_lines FOR EACH ROW EXECUTE FUNCTION public.trace_client_fk_guard();

-- Idempotent anomaly/alert persistence: repeated analysis does not create a
-- new identical finding for the same client/period/event.
create or replace function public.trace_record_anomaly(
  p_organization_id text,p_outlet_id text,p_category text,p_code text,p_title text,p_severity text,p_observed numeric,p_baseline numeric,p_ratio_pct numeric,p_impact_min numeric,p_impact_max numeric,p_methodology text,p_confidence text,p_evidence_ids jsonb default '[]'::jsonb,p_period_start timestamptz default null,p_period_end timestamptz default null
) returns public.trace_anomalies language plpgsql security definer set search_path=public as $$
declare r public.trace_anomalies;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_ANOMALY_ACTOR_FORBIDDEN'; end if;
  select * into r from public.trace_anomalies where organization_id=p_organization_id and code=p_code and coalesce(outlet_id,'')=coalesce(p_outlet_id,'') and period_start is not distinct from p_period_start and period_end is not distinct from p_period_end order by created_at desc limit 1;
  if found then return r; end if;
  insert into public.trace_anomalies(organization_id,outlet_id,category,code,title,severity,observed,baseline,ratio_pct,impact_min,impact_max,methodology,confidence,evidence_ids,period_start,period_end)
  values(p_organization_id,p_outlet_id,p_category,p_code,p_title,p_severity,p_observed,p_baseline,p_ratio_pct,p_impact_min,p_impact_max,p_methodology,p_confidence,coalesce(p_evidence_ids,'[]'::jsonb),p_period_start,p_period_end) returning * into r;
  return r;
end; $$;
revoke all on function public.trace_record_anomaly(text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,timestamptz,timestamptz) from public;
grant execute on function public.trace_record_anomaly(text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,timestamptz,timestamptz) to authenticated;

create or replace function public.trace_create_business_alert(
  p_organization_id text,p_anomaly_id uuid,p_severity text,p_title text,p_what text,p_why text,p_impact numeric,p_confidence text,p_evidence_ids jsonb default '[]'::jsonb
) returns public.trace_business_alerts language plpgsql security definer set search_path=public as $$
declare r public.trace_business_alerts;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_ALERT_ACTOR_FORBIDDEN'; end if;
  select * into r from public.trace_business_alerts where organization_id=p_organization_id and anomaly_id=p_anomaly_id and title=p_title and status in ('OPEN','ACKNOWLEDGED') order by created_at desc limit 1;
  if found then return r; end if;
  insert into public.trace_business_alerts(organization_id,anomaly_id,severity,title,what,why,impact,confidence,evidence_ids)
  values(p_organization_id,p_anomaly_id,p_severity,p_title,p_what,p_why,p_impact,p_confidence,coalesce(p_evidence_ids,'[]'::jsonb)) returning * into r;
  return r;
end; $$;
revoke all on function public.trace_create_business_alert(text,uuid,text,text,text,text,numeric,text,jsonb) from public;
grant execute on function public.trace_create_business_alert(text,uuid,text,text,text,text,numeric,text,jsonb) to authenticated;

-- Default chart of accounts is generated only when a TRACE operator asks for it.
create or replace function public.trace_seed_default_chart(p_client_id text)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer:=0; rec record;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_COA_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null then raise exception 'TRACE_CLIENT_ID_REQUIRED'; end if;
  for rec in select * from (values
    ('1000','Kas','asset'),('1100','Piutang Usaha','asset'),('1200','Persediaan','asset'),
    ('2000','Utang Usaha','liability'),('3000','Modal/Ekuitas','equity'),('4000','Pendapatan Usaha','revenue'),
    ('5000','COGS/HPP','cogs'),('6100','Labor','expense'),('6200','OPEX','expense'),('6300','Marketing','expense')
  ) x(code,name,account_type) loop
    insert into public.trace_accounts(client_id,code,name,account_type,created_by) values(trim(p_client_id),rec.code,rec.name,rec.account_type,auth.uid()) on conflict(client_id,code) do nothing;
    if found then n:=n+1; end if;
  end loop;
  return n;
end; $$;
revoke all on function public.trace_seed_default_chart(text) from public;
grant execute on function public.trace_seed_default_chart(text) to authenticated;
