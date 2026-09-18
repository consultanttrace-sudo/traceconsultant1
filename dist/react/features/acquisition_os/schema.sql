-- ============================================================
-- TRACE Acquisition OS V1 — Supabase / PostgreSQL schema
-- Internal sales intelligence system for TRACE Consultant
-- Scope: F&B leads in Kota Bogor & Kabupaten Bogor
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- leads
-- ------------------------------------------------------------
create table if not exists leads (
  id                uuid primary key default gen_random_uuid(),
  business_name     text not null,
  category          text,               -- coffee shop / cafe / restaurant / bakery / dessert / casual dining / other
  city              text,               -- 'Kota Bogor' | 'Kabupaten Bogor'
  regency           text,
  district          text,
  address           text,
  latitude          numeric,
  longitude         numeric,
  phone             text,
  website           text,
  instagram         text,
  rating             numeric,
  review_count      integer,
  price_range       text,
  outlet_count      integer,
  opening_hours     text,
  external_id       text,               -- provider-specific id (e.g. 'osm:node/123456') used for dedup
  social_verified   boolean not null default false, -- true only if a social handle was found directly in source data
  source            text,               -- where this record came from (manual / csv import / api name / OpenStreetMap)
  source_url        text,
  last_checked      timestamptz,
  data_quality      numeric,            -- 0-100, computed from field completeness
  status            text not null default 'new',
    -- new | analyzed | contacted | replied | meeting | not_a_fit | closed
  lead_score        numeric,            -- 0-100, null until analyzed
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_leads_city on leads (city);
create index if not exists idx_leads_status on leads (status);
create index if not exists idx_leads_score on leads (lead_score desc);
create unique index if not exists idx_leads_external_id on leads (external_id) where external_id is not null;

-- ------------------------------------------------------------
-- lead_analysis
-- ------------------------------------------------------------
create table if not exists lead_analysis (
  id                        uuid primary key default gen_random_uuid(),
  lead_id                   uuid not null references leads(id) on delete cascade,
  business_potential        numeric,     -- 0-100, AI-derived
  growth_signal             numeric,     -- 0-100, AI-derived
  operational_complexity    numeric,     -- 0-100, AI-derived
  marketing_opportunity     numeric,     -- 0-100, AI-derived
  profitability_opportunity numeric,     -- 0-100, AI-derived
  expansion_signal          numeric,     -- 0-100, AI-derived
  overall_score             numeric,     -- 0-100, weighted composite incl. data_quality
  likely_pain_points        jsonb,       -- [{text, is_hypothesis: true/false}]
  opportunity               text,
  recommended_sales_angle   text,
  reasoning                 text,
  analyzed_at               timestamptz not null default now()
);

create index if not exists idx_lead_analysis_lead_id on lead_analysis (lead_id);

-- ------------------------------------------------------------
-- outreach
-- ------------------------------------------------------------
create table if not exists outreach (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id) on delete cascade,
  channel      text not null default 'instagram',
  message      text,
  status       text not null default 'draft',
    -- draft | sent | replied | meeting_booked | no_response | declined
  sent_at      timestamptz,
  replied_at   timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_outreach_lead_id on outreach (lead_id);

-- ------------------------------------------------------------
-- updated_at trigger for leads
-- ------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at
before update on leads
for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Scoring weights (documented, enforced in application layer):
--   business_potential        20%
--   growth_signal              20%
--   operational_complexity     15%
--   marketing_opportunity      15%
--   profitability_opportunity  15%
--   expansion_signal           10%
--   data_quality                5%
-- lead_score = weighted sum of the above (0-100)
-- ============================================================

-- ------------------------------------------------------------
-- V1 discovery metadata additions
-- ------------------------------------------------------------
alter table leads add column if not exists source_ids jsonb;
alter table leads add column if not exists is_demo boolean not null default false;
alter table leads add column if not exists instagram_status text not null default 'unknown';
create index if not exists idx_leads_source_ids on leads using gin (source_ids);
create index if not exists idx_leads_last_checked on leads (last_checked);

-- Legacy schema safety: production live data is now stored in trace_kv,
-- but this standalone schema is protected if ever deployed independently.
alter table public.leads enable row level security;
alter table public.lead_analysis enable row level security;
alter table public.outreach enable row level security;

drop policy if exists "acquisition authenticated leads" on public.leads;
drop policy if exists "acquisition authenticated lead_analysis" on public.lead_analysis;
drop policy if exists "acquisition authenticated outreach" on public.outreach;
create policy "acquisition authenticated leads" on public.leads for all to authenticated using (true) with check (true);
create policy "acquisition authenticated lead_analysis" on public.lead_analysis for all to authenticated using (true) with check (true);
create policy "acquisition authenticated outreach" on public.outreach for all to authenticated using (true) with check (true);
revoke all on table public.leads, public.lead_analysis, public.outreach from anon;
grant select, insert, update, delete on table public.leads, public.lead_analysis, public.outreach to authenticated;
