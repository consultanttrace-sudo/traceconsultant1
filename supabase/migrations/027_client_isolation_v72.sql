-- TRACE v72 — true client-scoped reads and legacy KV containment.
-- Internal-only application: clients are data subjects, never app users.
-- This migration deliberately removes direct table SELECT from operational
-- client-scoped tables. Reads go through one audited, fail-closed RPC.

create extension if not exists pgcrypto;

-- Per-client JSON records replace multi-client JSON blobs for legacy collections.
create table if not exists public.trace_client_kv (
  client_id text not null,
  key text not null,
  record_id text not null,
  value jsonb not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, key, record_id)
);
create index if not exists trace_client_kv_client_key_idx on public.trace_client_kv(client_id, key, updated_at desc);
alter table public.trace_client_kv enable row level security;
revoke all on table public.trace_client_kv from anon, authenticated;
drop policy if exists trace_client_kv_team_read on public.trace_client_kv;
create policy trace_client_kv_team_read on public.trace_client_kv for select to authenticated using(public.trace_is_team_member());
grant select on public.trace_client_kv to authenticated;

create or replace function public.trace_read_client_kv(p_client_id text, p_keys text[])
returns jsonb
language plpgsql security definer set search_path=public as $$
declare result jsonb := '{}'::jsonb; k text;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_CLIENT_KV_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null then raise exception 'TRACE_CLIENT_ID_REQUIRED'; end if;
  foreach k in array coalesce(p_keys,'{}'::text[]) loop
    if k is null or trim(k)='' then continue; end if;
    result := result || jsonb_build_object(k, coalesce((select jsonb_agg(v.value order by v.updated_at desc) from public.trace_client_kv v where v.client_id=trim(p_client_id) and v.key=k), '[]'::jsonb));
  end loop;
  return result;
end; $$;
revoke all on function public.trace_read_client_kv(text,text[]) from public;
grant execute on function public.trace_read_client_kv(text,text[]) to authenticated;

create or replace function public.trace_upsert_client_kv(
  p_client_id text, p_key text, p_record_id text, p_value jsonb
) returns public.trace_client_kv
language plpgsql security definer set search_path=public as $$
declare r public.trace_client_kv;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_CLIENT_KV_ACTOR_FORBIDDEN'; end if;
  if nullif(trim(p_client_id),'') is null or nullif(trim(p_key),'') is null or nullif(trim(p_record_id),'') is null then raise exception 'TRACE_CLIENT_KV_SCOPE_REQUIRED'; end if;
  if p_value is null then raise exception 'TRACE_CLIENT_KV_VALUE_REQUIRED'; end if;
  insert into public.trace_client_kv(client_id,key,record_id,value,created_by)
  values(trim(p_client_id),trim(p_key),trim(p_record_id),p_value,auth.uid())
  on conflict(client_id,key,record_id) do update set value=excluded.value,updated_at=now()
  returning * into r;
  return r;
end; $$;
revoke all on function public.trace_upsert_client_kv(text,text,text,jsonb) from public;
grant execute on function public.trace_upsert_client_kv(text,text,text,jsonb) to authenticated;

-- Imports are operational client data once a client has been identified.
alter table public.trace_data_intake_imports add column if not exists client_id text;
create index if not exists trace_data_intake_imports_client_idx on public.trace_data_intake_imports(client_id,created_at desc);

-- One RPC is the only browser-facing path for operational client reads.
create or replace function public.trace_read_client_dataset(p_client_id text)
returns jsonb
language plpgsql security definer set search_path=public as $$
declare cid text := nullif(trim(p_client_id),'');
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_CLIENT_DATA_ACTOR_FORBIDDEN'; end if;
  if cid is null then raise exception 'TRACE_CLIENT_ID_REQUIRED'; end if;
  return jsonb_build_object(
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_collaboration_tasks t where t.client_id=cid),'[]'::jsonb),
    'imports', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_data_intake_imports t where t.client_id=cid),'[]'::jsonb),
    'finance', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_finance_records t where t.client_id=cid),'[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_product_catalog t where t.client_id=cid),'[]'::jsonb),
    'sales', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_sales_transactions t where t.client_id=cid),'[]'::jsonb),
    'social_accounts', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'client_id',t.client_id,'is_internal_account',t.is_internal_account,'platform',t.platform,'platform_account_id',t.platform_account_id,'display_name',t.display_name,'status',t.status,'scopes',t.scopes,'token_expires_at',t.token_expires_at,'connected_by',t.connected_by,'first_synced_at',t.first_synced_at,'last_synced_at',t.last_synced_at,'last_sync_error',t.last_sync_error,'created_at',t.created_at,'updated_at',t.updated_at) order by t.created_at desc) from public.trace_social_accounts t where t.client_id=cid),'[]'::jsonb),
    'content_items', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_content_items t where t.client_id=cid),'[]'::jsonb),
    'content_metrics', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_content_metrics t where t.client_id=cid),'[]'::jsonb),
    'content_inquiries', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_content_inquiries t where t.client_id=cid),'[]'::jsonb),
    'ad_accounts', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'client_id',t.client_id,'is_internal_account',t.is_internal_account,'platform',t.platform,'ad_account_id',t.ad_account_id,'display_name',t.display_name,'status',t.status,'token_expires_at',t.token_expires_at,'connected_by',t.connected_by,'first_synced_at',t.first_synced_at,'last_synced_at',t.last_synced_at,'last_sync_error',t.last_sync_error,'created_at',t.created_at,'updated_at',t.updated_at) order by t.created_at desc) from public.trace_ad_accounts t where t.client_id=cid),'[]'::jsonb),
    'ad_campaigns', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_ad_campaigns t where t.client_id=cid),'[]'::jsonb),
    'ad_metrics', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_ad_metrics t where t.client_id=cid),'[]'::jsonb),
    'competitor_accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_competitor_accounts t where t.client_id=cid),'[]'::jsonb),
    'competitor_snapshots', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_competitor_snapshots t where t.client_id=cid),'[]'::jsonb),
    'competitor_posts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_competitor_posts t where t.client_id=cid),'[]'::jsonb),
    'competitor_discovery_lens', coalesce((select jsonb_agg(to_jsonb(t) order by t.updated_at desc) from public.trace_competitor_discovery_lens t where t.client_id=cid),'[]'::jsonb),
    'content_plans', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_content_plans t where t.client_id=cid),'[]'::jsonb),
    'ingestion', coalesce((select jsonb_agg(to_jsonb(t) order by t.imported_at desc) from public.trace_ingestion_records t where t.organization_id=cid),'[]'::jsonb),
    'pos_events', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at desc) from public.trace_pos_events t where t.organization_id=cid),'[]'::jsonb),
    'inventory_items', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_inventory_items t where t.organization_id=cid),'[]'::jsonb),
    'inventory_movements', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at desc) from public.trace_inventory_movements t where t.organization_id=cid),'[]'::jsonb),
    'inventory_recipes', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_inventory_recipes t where t.organization_id=cid),'[]'::jsonb),
    'anomalies', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_anomalies t where t.organization_id=cid),'[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_business_alerts t where t.organization_id=cid),'[]'::jsonb),
    'health', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_business_health_snapshots t where t.organization_id=cid),'[]'::jsonb)
  );
end; $$;
revoke all on function public.trace_read_client_dataset(text) from public;
grant execute on function public.trace_read_client_dataset(text) to authenticated;

-- Prevent accidental direct browser reads of operational client tables.
revoke select on public.trace_collaboration_tasks, public.trace_data_intake_imports,
  public.trace_finance_records, public.trace_product_catalog, public.trace_sales_transactions,
  public.trace_social_accounts, public.trace_content_items, public.trace_content_metrics,
  public.trace_content_inquiries, public.trace_ad_accounts, public.trace_ad_campaigns,
  public.trace_ad_metrics, public.trace_competitor_accounts, public.trace_competitor_snapshots,
  public.trace_competitor_posts, public.trace_competitor_discovery_lens, public.trace_content_plans,
  public.trace_ingestion_records, public.trace_pos_events, public.trace_inventory_items,
  public.trace_inventory_movements, public.trace_inventory_recipes, public.trace_anomalies,
  public.trace_business_alerts, public.trace_business_health_snapshots
from authenticated;

comment on table public.trace_client_kv is 'Client-scoped operational KV. Never mix clients in one JSON blob.';
comment on function public.trace_read_client_dataset(text) is 'Single fail-closed RPC for browser operational reads. Client scope is enforced in SQL.';
