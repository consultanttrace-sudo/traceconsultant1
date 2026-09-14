-- TRACE Business Intelligence Platform — additive canonical ingestion, POS health,
-- inventory intelligence, anomaly and alert persistence.
-- No existing tables are dropped or renamed.
create extension if not exists pgcrypto;

create table if not exists public.trace_ingestion_records (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  provider text not null check (provider in ('moka','pawoon','majoo','qasir','custom_pos','csv','excel','api','webhook','manual','unknown')),
  source_record_id text not null,
  source_file text,
  source_row integer,
  payload jsonb not null,
  imported_at timestamptz not null default now(),
  normalized_at timestamptz,
  status text not null default 'RECEIVED' check (status in ('RECEIVED','VALIDATED','REJECTED','NORMALIZED','IMPORTED')),
  validation_errors jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, provider, source_record_id)
);
create index if not exists trace_ingestion_org_time_idx on public.trace_ingestion_records(organization_id, imported_at desc);
alter table public.trace_ingestion_records enable row level security;
revoke all on public.trace_ingestion_records from anon, authenticated;
grant select on public.trace_ingestion_records to authenticated;
drop policy if exists trace_ingestion_team_select on public.trace_ingestion_records;
create policy trace_ingestion_team_select on public.trace_ingestion_records for select to authenticated using (public.trace_is_team_member());

create table if not exists public.trace_pos_events (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  employee_id text,
  cashier_id text,
  product_id text,
  event_type text not null check (event_type in ('sale','void','refund','discount','price_override','payment','cash_discrepancy','comp','cancellation')),
  amount numeric not null check (amount >= 0),
  occurred_at timestamptz not null,
  source_record_id text,
  provenance_id uuid references public.trace_ingestion_records(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);
create index if not exists trace_pos_events_scope_time_idx on public.trace_pos_events(organization_id, outlet_id, occurred_at desc);
create index if not exists trace_pos_events_employee_idx on public.trace_pos_events(organization_id, employee_id, event_type, occurred_at desc);
alter table public.trace_pos_events enable row level security;
revoke all on public.trace_pos_events from anon, authenticated;
grant select on public.trace_pos_events to authenticated;
drop policy if exists trace_pos_events_team_select on public.trace_pos_events;
create policy trace_pos_events_team_select on public.trace_pos_events for select to authenticated using (public.trace_is_team_member());

create table if not exists public.trace_inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  sku text,
  item_name text not null,
  unit text not null,
  unit_cost numeric check (unit_cost >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, outlet_id, item_name)
);
create index if not exists trace_inventory_items_scope_idx on public.trace_inventory_items(organization_id, outlet_id, active);
alter table public.trace_inventory_items enable row level security;
revoke all on public.trace_inventory_items from anon, authenticated;
grant select on public.trace_inventory_items to authenticated;
drop policy if exists trace_inventory_items_team_select on public.trace_inventory_items;
create policy trace_inventory_items_team_select on public.trace_inventory_items for select to authenticated using (public.trace_is_team_member());

create table if not exists public.trace_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  item_id uuid not null references public.trace_inventory_items(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase','sale_consumption','adjustment','waste','return','transfer')),
  qty numeric not null check (qty > 0),
  unit_cost numeric check (unit_cost >= 0),
  occurred_at timestamptz not null,
  source_record_id text,
  provenance_id uuid references public.trace_ingestion_records(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, source_record_id)
);
create index if not exists trace_inventory_movements_scope_time_idx on public.trace_inventory_movements(organization_id, outlet_id, item_id, occurred_at desc);
alter table public.trace_inventory_movements enable row level security;
revoke all on public.trace_inventory_movements from anon, authenticated;
grant select on public.trace_inventory_movements to authenticated;
drop policy if exists trace_inventory_movements_team_select on public.trace_inventory_movements;
create policy trace_inventory_movements_team_select on public.trace_inventory_movements for select to authenticated using (public.trace_is_team_member());

create table if not exists public.trace_inventory_recipes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  product_id uuid not null references public.trace_product_catalog(id) on delete restrict,
  item_id uuid not null references public.trace_inventory_items(id) on delete restrict,
  qty_per_sale numeric not null check (qty_per_sale > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (organization_id, product_id, item_id)
);
alter table public.trace_inventory_recipes enable row level security;
revoke all on public.trace_inventory_recipes from anon, authenticated;
grant select on public.trace_inventory_recipes to authenticated;
drop policy if exists trace_inventory_recipes_team_select on public.trace_inventory_recipes;
create policy trace_inventory_recipes_team_select on public.trace_inventory_recipes for select to authenticated using (public.trace_is_team_member());

create table if not exists public.trace_anomalies (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  category text not null check (category in ('void','discount','refund','price','cash','sequence','inventory','other')),
  code text not null,
  title text not null,
  severity text not null check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  observed numeric,
  baseline numeric,
  ratio_pct numeric,
  impact_min numeric,
  impact_max numeric,
  methodology text not null,
  confidence text not null check (confidence in ('VERIFIED','HIGH CONFIDENCE','MEDIUM CONFIDENCE','LOW CONFIDENCE','INSUFFICIENT DATA')),
  evidence_ids jsonb not null default '[]'::jsonb,
  period_start timestamptz,
  period_end timestamptz,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  created_at timestamptz not null default now()
);
create index if not exists trace_anomalies_scope_idx on public.trace_anomalies(organization_id, severity, status, created_at desc);
alter table public.trace_anomalies enable row level security;
revoke all on public.trace_anomalies from anon, authenticated;
grant select on public.trace_anomalies to authenticated;
drop policy if exists trace_anomalies_team_select on public.trace_anomalies;
create policy trace_anomalies_team_select on public.trace_anomalies for select to authenticated using (public.trace_is_team_member());

create table if not exists public.trace_business_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  anomaly_id uuid references public.trace_anomalies(id) on delete set null,
  severity text not null check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null,
  what text not null,
  why text not null,
  impact numeric,
  confidence text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED')),
  resolution_note text,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists trace_business_alerts_scope_idx on public.trace_business_alerts(organization_id, status, severity, created_at desc);
alter table public.trace_business_alerts enable row level security;
revoke all on public.trace_business_alerts from anon, authenticated;
grant select on public.trace_business_alerts to authenticated;
drop policy if exists trace_business_alerts_team_select on public.trace_business_alerts;
create policy trace_business_alerts_team_select on public.trace_business_alerts for select to authenticated using (public.trace_is_team_member());

create table if not exists public.trace_business_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  outlet_id text,
  period_start date not null,
  period_end date not null,
  score numeric check (score between 0 and 100),
  dimensions jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  confidence_pct numeric check (confidence_pct between 0 and 100),
  methodology text not null,
  created_at timestamptz not null default now()
);
create index if not exists trace_health_scope_period_idx on public.trace_business_health_snapshots(organization_id, outlet_id, period_end desc);
alter table public.trace_business_health_snapshots enable row level security;
revoke all on public.trace_business_health_snapshots from anon, authenticated;
grant select on public.trace_business_health_snapshots to authenticated;
drop policy if exists trace_health_team_select on public.trace_business_health_snapshots;
create policy trace_health_team_select on public.trace_business_health_snapshots for select to authenticated using (public.trace_is_team_member());

-- All writes for these evidence-bearing tables must use a controlled server-side path/RPC.
-- Direct client grants are intentionally read-only.

-- Tenant isolation for the new canonical BI tables. TRACE internal leaders retain
-- global access; other users must have an active organization membership.
create table if not exists public.trace_organization_memberships (
  organization_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','finance','cashier','auditor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create index if not exists trace_org_memberships_user_idx on public.trace_organization_memberships(user_id, active);
alter table public.trace_organization_memberships enable row level security;
revoke all on public.trace_organization_memberships from anon, authenticated;
grant select on public.trace_organization_memberships to authenticated;
drop policy if exists trace_org_memberships_self_select on public.trace_organization_memberships;
create policy trace_org_memberships_self_select on public.trace_organization_memberships for select to authenticated using (user_id=auth.uid() or exists(select 1 from public.trace_team_members t where t.user_id=auth.uid() and t.active=true and t.role='leader'));

create or replace function public.trace_is_org_member(p_organization_id text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.trace_team_members t where t.user_id=auth.uid() and t.active=true and t.role='leader')
      or exists(select 1 from public.trace_organization_memberships m where m.organization_id=p_organization_id and m.user_id=auth.uid() and m.active=true);
$$;
revoke all on function public.trace_is_org_member(text) from public;
grant execute on function public.trace_is_org_member(text) to authenticated;

-- Replace team-wide read policies on the new tenant-scoped tables.
drop policy if exists trace_ingestion_team_select on public.trace_ingestion_records;
create policy trace_ingestion_org_select on public.trace_ingestion_records for select to authenticated using (public.trace_is_org_member(organization_id));
drop policy if exists trace_pos_events_team_select on public.trace_pos_events;
create policy trace_pos_events_org_select on public.trace_pos_events for select to authenticated using (public.trace_is_org_member(organization_id));
drop policy if exists trace_inventory_items_team_select on public.trace_inventory_items;
create policy trace_inventory_items_org_select on public.trace_inventory_items for select to authenticated using (public.trace_is_org_member(organization_id));
drop policy if exists trace_inventory_movements_team_select on public.trace_inventory_movements;
create policy trace_inventory_movements_org_select on public.trace_inventory_movements for select to authenticated using (public.trace_is_org_member(organization_id));
drop policy if exists trace_inventory_recipes_team_select on public.trace_inventory_recipes;
create policy trace_inventory_recipes_org_select on public.trace_inventory_recipes for select to authenticated using (public.trace_is_org_member(organization_id));
drop policy if exists trace_anomalies_team_select on public.trace_anomalies;
create policy trace_anomalies_org_select on public.trace_anomalies for select to authenticated using (public.trace_is_org_member(organization_id));
drop policy if exists trace_business_alerts_team_select on public.trace_business_alerts;
create policy trace_business_alerts_org_select on public.trace_business_alerts for select to authenticated using (public.trace_is_org_member(organization_id));
drop policy if exists trace_health_team_select on public.trace_business_health_snapshots;
create policy trace_health_org_select on public.trace_business_health_snapshots for select to authenticated using (public.trace_is_org_member(organization_id));


create or replace function public.trace_transition_business_alert(
  p_alert_id uuid,
  p_status text,
  p_note text default null
) returns public.trace_business_alerts
language plpgsql security definer set search_path=public as $$
declare r public.trace_business_alerts;
 declare before_json jsonb;
begin
  if p_status not in ('OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED') then raise exception 'TRACE_ALERT_STATUS_INVALID'; end if;
  select * into r from public.trace_business_alerts where id=p_alert_id for update;
  if not found then raise exception 'TRACE_ALERT_NOT_FOUND'; end if;
  if not public.trace_is_org_member(r.organization_id) then raise exception 'TRACE_ALERT_ACTOR_FORBIDDEN'; end if;
  before_json:=jsonb_build_object('status',r.status,'resolution_note',r.resolution_note);
  update public.trace_business_alerts set
    status=p_status,
    resolution_note=case when p_note is null or btrim(p_note)='' then resolution_note else p_note end,
    acknowledged_by=case when p_status='ACKNOWLEDGED' then auth.uid() else acknowledged_by end,
    resolved_by=case when p_status='RESOLVED' then auth.uid() else resolved_by end,
    updated_at=now()
  where id=p_alert_id returning * into r;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data,reason)
  values(auth.uid(),'transition','business_alert',r.id::text,before_json,jsonb_build_object('status',r.status,'resolution_note',r.resolution_note),p_note);
  return r;
end; $$;
revoke all on function public.trace_transition_business_alert(uuid,text,text) from public;
grant execute on function public.trace_transition_business_alert(uuid,text,text) to authenticated;

create or replace function public.trace_record_anomaly(
  p_organization_id text, p_outlet_id text, p_category text, p_code text, p_title text,
  p_severity text, p_observed numeric, p_baseline numeric, p_ratio_pct numeric,
  p_impact_min numeric, p_impact_max numeric, p_methodology text, p_confidence text,
  p_evidence_ids jsonb default '[]'::jsonb, p_period_start timestamptz default null, p_period_end timestamptz default null
) returns public.trace_anomalies
language plpgsql security definer set search_path=public as $$
declare r public.trace_anomalies;
begin
  if not public.trace_is_org_member(p_organization_id) then raise exception 'TRACE_ANOMALY_ACTOR_FORBIDDEN'; end if;
  insert into public.trace_anomalies(organization_id,outlet_id,category,code,title,severity,observed,baseline,ratio_pct,impact_min,impact_max,methodology,confidence,evidence_ids,period_start,period_end)
  values(p_organization_id,p_outlet_id,p_category,p_code,p_title,p_severity,p_observed,p_baseline,p_ratio_pct,p_impact_min,p_impact_max,p_methodology,p_confidence,coalesce(p_evidence_ids,'[]'::jsonb),p_period_start,p_period_end)
  returning * into r;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'insert','anomaly',r.id::text,jsonb_build_object('code',r.code,'severity',r.severity,'confidence',r.confidence),'Business intelligence engine finding');
  return r;
end; $$;
revoke all on function public.trace_record_anomaly(text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,timestamptz,timestamptz) from public;
grant execute on function public.trace_record_anomaly(text,text,text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,text,jsonb,timestamptz,timestamptz) to authenticated;

create or replace function public.trace_create_business_alert(
  p_organization_id text, p_anomaly_id uuid, p_severity text, p_title text, p_what text, p_why text,
  p_impact numeric, p_confidence text, p_evidence_ids jsonb default '[]'::jsonb
) returns public.trace_business_alerts
language plpgsql security definer set search_path=public as $$
declare r public.trace_business_alerts;
begin
  if not public.trace_is_org_member(p_organization_id) then raise exception 'TRACE_ALERT_ACTOR_FORBIDDEN'; end if;
  insert into public.trace_business_alerts(organization_id,anomaly_id,severity,title,what,why,impact,confidence,evidence_ids)
  values(p_organization_id,p_anomaly_id,p_severity,p_title,p_what,p_why,p_impact,p_confidence,coalesce(p_evidence_ids,'[]'::jsonb)) returning * into r;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'insert','business_alert',r.id::text,jsonb_build_object('severity',r.severity,'title',r.title),'Business intelligence alert creation');
  return r;
end; $$;
revoke all on function public.trace_create_business_alert(text,uuid,text,text,text,text,numeric,text,jsonb) from public;
grant execute on function public.trace_create_business_alert(text,uuid,text,text,text,text,numeric,text,jsonb) to authenticated;

create or replace function public.trace_save_business_health_snapshot(
  p_organization_id text, p_outlet_id text, p_period_start date, p_period_end date,
  p_score numeric, p_dimensions jsonb, p_evidence jsonb, p_confidence_pct numeric, p_methodology text
) returns public.trace_business_health_snapshots
language plpgsql security definer set search_path=public as $$
declare r public.trace_business_health_snapshots;
begin
  if not public.trace_is_org_member(p_organization_id) then raise exception 'TRACE_HEALTH_ACTOR_FORBIDDEN'; end if;
  insert into public.trace_business_health_snapshots(organization_id,outlet_id,period_start,period_end,score,dimensions,evidence,confidence_pct,methodology)
  values(p_organization_id,p_outlet_id,p_period_start,p_period_end,p_score,coalesce(p_dimensions,'[]'::jsonb),coalesce(p_evidence,'[]'::jsonb),p_confidence_pct,p_methodology) returning * into r;
  insert into public.trace_audit_log(actor_user_id,action,entity_type,entity_id,after_data,reason)
  values(auth.uid(),'insert','business_health_snapshot',r.id::text,jsonb_build_object('score',r.score,'period_start',r.period_start,'period_end',r.period_end),'Business health snapshot');
  return r;
end; $$;
revoke all on function public.trace_save_business_health_snapshot(text,text,date,date,numeric,jsonb,jsonb,numeric,text) from public;
grant execute on function public.trace_save_business_health_snapshot(text,text,date,date,numeric,jsonb,jsonb,numeric,text) to authenticated;

