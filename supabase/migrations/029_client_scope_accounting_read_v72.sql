-- Extend the single client read boundary with accounting data.
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
    'competitor_discovery_lens', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_competitor_discovery_lens t where t.client_id=cid),'[]'::jsonb),
    'content_plans', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_content_plans t where t.client_id=cid),'[]'::jsonb),
    'ingestion', coalesce((select jsonb_agg(to_jsonb(t) order by t.imported_at desc) from public.trace_ingestion_records t where t.organization_id=cid),'[]'::jsonb),
    'pos_events', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at desc) from public.trace_pos_events t where t.organization_id=cid),'[]'::jsonb),
    'inventory_items', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_inventory_items t where t.organization_id=cid),'[]'::jsonb),
    'inventory_movements', coalesce((select jsonb_agg(to_jsonb(t) order by t.occurred_at desc) from public.trace_inventory_movements t where t.organization_id=cid),'[]'::jsonb),
    'inventory_recipes', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_inventory_recipes t where t.organization_id=cid),'[]'::jsonb),
    'anomalies', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_anomalies t where t.organization_id=cid),'[]'::jsonb),
    'alerts', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_business_alerts t where t.organization_id=cid),'[]'::jsonb),
    'health', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_business_health_snapshots t where t.organization_id=cid),'[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.code) from public.trace_accounts t where t.client_id=cid),'[]'::jsonb),
    'journal_entries', coalesce((select jsonb_agg(to_jsonb(t) order by t.entry_date desc,t.created_at desc) from public.trace_journal_entries t where t.client_id=cid),'[]'::jsonb),
    'journal_lines', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.trace_journal_lines t where t.client_id=cid),'[]'::jsonb)
  );
end; $$;
revoke all on function public.trace_read_client_dataset(text) from public;
grant execute on function public.trace_read_client_dataset(text) to authenticated;
revoke select on public.trace_accounts,public.trace_journal_entries,public.trace_journal_lines from authenticated;
