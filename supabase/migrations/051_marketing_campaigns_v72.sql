-- v72.15 — Marketing/Content/KPI/SOP/Action Plan, Tahap 4/4: Marketing.
-- Menggantikan legacy trace_kv key 'trace_os::trace-marketing-event'
-- dengan skema kampanye + event bertingkat (bukan cuma log datar), plus
-- kalkulasi ROI/CAC/CTR per kampanye & per channel — fitur atribusi
-- multi-channel yang umumnya TIDAK ada di software akuntansi biasa.
-- content_plan_id opsional menautkan event marketing ke rencana konten
-- yang sudah ada (trace_content_plans, migration 021).

-- ============================================================
-- 1. KAMPANYE
-- ============================================================
create table if not exists public.trace_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  name text not null,
  objective text,
  primary_channel text,
  start_date date,
  end_date date,
  budget_amount numeric not null default 0,
  status text not null default 'planned' check (status in ('planned','running','completed','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trace_marketing_campaigns_scope_idx on public.trace_marketing_campaigns(organization_id, outlet_id, status);
alter table public.trace_marketing_campaigns enable row level security;
revoke all on public.trace_marketing_campaigns from anon, authenticated;
grant select on public.trace_marketing_campaigns to authenticated;
drop policy if exists trace_marketing_campaigns_team_select on public.trace_marketing_campaigns;
create policy trace_marketing_campaigns_team_select on public.trace_marketing_campaigns
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_create_marketing_campaign(
  p_client_id text,p_outlet_id text,p_name text,p_objective text,p_primary_channel text,
  p_start_date date,p_end_date date,p_budget_amount numeric)
returns public.trace_marketing_campaigns
language plpgsql security definer set search_path=public as $$
declare v public.trace_marketing_campaigns;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_MKT_ACTOR_FORBIDDEN'; end if;
  if p_name is null or length(trim(p_name))=0 then raise exception 'TRACE_MKT_NAME_REQUIRED'; end if;
  insert into public.trace_marketing_campaigns(
    organization_id,outlet_id,name,objective,primary_channel,start_date,end_date,budget_amount,created_by)
  values(
    trim(p_client_id),p_outlet_id,trim(p_name),nullif(trim(p_objective),''),
    nullif(trim(p_primary_channel),''),p_start_date,p_end_date,coalesce(p_budget_amount,0),auth.uid())
  returning * into v;
  perform public.trace_append_audit_event('create','marketing_campaign',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_create_marketing_campaign(text,text,text,text,text,date,date,numeric) from public;
grant execute on function public.trace_create_marketing_campaign(text,text,text,text,text,date,date,numeric) to authenticated;

create or replace function public.trace_list_marketing_campaigns(p_client_id text,p_outlet_id text default null,p_status text default null)
returns setof public.trace_marketing_campaigns
language sql stable security definer set search_path=public as $$
  select * from public.trace_marketing_campaigns
  where public.trace_is_team_member()
    and organization_id=trim(p_client_id)
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
    and (p_status is null or status=p_status)
  order by coalesce(start_date, created_at::date) desc;
$$;
revoke all on function public.trace_list_marketing_campaigns(text,text,text) from public;
grant execute on function public.trace_list_marketing_campaigns(text,text,text) to authenticated;

-- ============================================================
-- 2. MARKETING EVENTS — log granular per aktivitas
-- ============================================================
create table if not exists public.trace_marketing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  campaign_id uuid references public.trace_marketing_campaigns(id) on delete set null,
  content_plan_id uuid references public.trace_content_plans(id) on delete set null,
  event_type text not null check (event_type in ('post','ad_spend','promo','collab','giveaway','offline_event','referral','other')),
  channel text not null,
  event_date date not null default current_date,
  spend_amount numeric not null default 0,
  reach numeric not null default 0,
  impressions numeric not null default 0,
  clicks numeric not null default 0,
  engagement numeric not null default 0,
  leads_generated numeric not null default 0,
  conversions numeric not null default 0,
  revenue_attributed numeric not null default 0,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists trace_marketing_events_scope_idx
  on public.trace_marketing_events(organization_id, outlet_id, event_date, channel);
create index if not exists trace_marketing_events_campaign_idx on public.trace_marketing_events(campaign_id);
alter table public.trace_marketing_events enable row level security;
revoke all on public.trace_marketing_events from anon, authenticated;
grant select on public.trace_marketing_events to authenticated;
drop policy if exists trace_marketing_events_team_select on public.trace_marketing_events;
create policy trace_marketing_events_team_select on public.trace_marketing_events
for select to authenticated using (public.trace_is_team_member());

create or replace function public.trace_log_marketing_event(
  p_client_id text,p_outlet_id text,p_campaign_id uuid,p_content_plan_id uuid,
  p_event_type text,p_channel text,p_event_date date,p_spend_amount numeric,p_reach numeric,
  p_impressions numeric,p_clicks numeric,p_engagement numeric,p_leads_generated numeric,
  p_conversions numeric,p_revenue_attributed numeric,p_notes text)
returns public.trace_marketing_events
language plpgsql security definer set search_path=public as $$
declare v public.trace_marketing_events;
begin
  if not public.trace_is_team_member() then raise exception 'TRACE_MKT_ACTOR_FORBIDDEN'; end if;
  if p_channel is null or length(trim(p_channel))=0 then raise exception 'TRACE_MKT_CHANNEL_REQUIRED'; end if;
  insert into public.trace_marketing_events(
    organization_id,outlet_id,campaign_id,content_plan_id,event_type,channel,event_date,
    spend_amount,reach,impressions,clicks,engagement,leads_generated,conversions,revenue_attributed,notes,created_by)
  values(
    trim(p_client_id),p_outlet_id,p_campaign_id,p_content_plan_id,p_event_type,trim(p_channel),
    coalesce(p_event_date,current_date),coalesce(p_spend_amount,0),coalesce(p_reach,0),coalesce(p_impressions,0),
    coalesce(p_clicks,0),coalesce(p_engagement,0),coalesce(p_leads_generated,0),coalesce(p_conversions,0),
    coalesce(p_revenue_attributed,0),nullif(trim(p_notes),''),auth.uid())
  returning * into v;
  perform public.trace_append_audit_event('log','marketing_event',v.id::text,null,to_jsonb(v),null);
  return v;
end; $$;
revoke all on function public.trace_log_marketing_event(text,text,uuid,uuid,text,text,date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) from public;
grant execute on function public.trace_log_marketing_event(text,text,uuid,uuid,text,text,date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text) to authenticated;

create or replace function public.trace_list_marketing_events(
  p_client_id text,p_outlet_id text default null,p_campaign_id uuid default null,
  p_start_date date default null,p_end_date date default null)
returns setof public.trace_marketing_events
language sql stable security definer set search_path=public as $$
  select * from public.trace_marketing_events
  where public.trace_is_team_member()
    and organization_id=trim(p_client_id)
    and (p_outlet_id is null or outlet_id is not distinct from p_outlet_id)
    and (p_campaign_id is null or campaign_id=p_campaign_id)
    and (p_start_date is null or event_date >= p_start_date)
    and (p_end_date is null or event_date <= p_end_date)
  order by event_date desc;
$$;
revoke all on function public.trace_list_marketing_events(text,text,uuid,date,date) from public;
grant execute on function public.trace_list_marketing_events(text,text,uuid,date,date) to authenticated;

-- ============================================================
-- 3. RPC — performa kampanye (ROI, CAC, CTR, conversion rate)
-- ============================================================
create or replace function public.trace_marketing_campaign_performance(p_campaign_id uuid)
returns table(
  total_spend numeric, total_reach numeric, total_impressions numeric, total_clicks numeric,
  total_leads numeric, total_conversions numeric, total_revenue_attributed numeric,
  ctr_pct numeric, conversion_rate_pct numeric, cac numeric, roi_pct numeric
)
language sql stable security definer set search_path=public as $$
  select
    coalesce(sum(spend_amount),0), coalesce(sum(reach),0), coalesce(sum(impressions),0), coalesce(sum(clicks),0),
    coalesce(sum(leads_generated),0), coalesce(sum(conversions),0), coalesce(sum(revenue_attributed),0),
    case when sum(impressions) > 0 then round(sum(clicks)/sum(impressions)*100,2) else null end,
    case when sum(leads_generated) > 0 then round(sum(conversions)/sum(leads_generated)*100,2) else null end,
    case when sum(conversions) > 0 then round(sum(spend_amount)/sum(conversions),2) else null end,
    case when sum(spend_amount) > 0 then round((sum(revenue_attributed)-sum(spend_amount))/sum(spend_amount)*100,2) else null end
  from public.trace_marketing_events
  where campaign_id=p_campaign_id and public.trace_is_team_member();
$$;
revoke all on function public.trace_marketing_campaign_performance(uuid) from public;
grant execute on function public.trace_marketing_campaign_performance(uuid) to authenticated;

-- Ringkasan per channel lintas kampanye dalam satu periode — untuk
-- membandingkan channel mana yang paling efisien (bukan cuma per kampanye).
create or replace function public.trace_marketing_channel_summary(p_client_id text,p_start_date date,p_end_date date)
returns table(channel text, total_spend numeric, total_reach numeric, total_conversions numeric, total_revenue_attributed numeric, roi_pct numeric)
language sql stable security definer set search_path=public as $$
  select channel,
    coalesce(sum(spend_amount),0), coalesce(sum(reach),0), coalesce(sum(conversions),0), coalesce(sum(revenue_attributed),0),
    case when sum(spend_amount) > 0 then round((sum(revenue_attributed)-sum(spend_amount))/sum(spend_amount)*100,2) else null end
  from public.trace_marketing_events
  where public.trace_is_team_member()
    and organization_id=trim(p_client_id)
    and event_date >= p_start_date and event_date <= p_end_date
  group by channel
  order by total_spend desc;
$$;
revoke all on function public.trace_marketing_channel_summary(text,date,date) from public;
grant execute on function public.trace_marketing_channel_summary(text,date,date) to authenticated;
