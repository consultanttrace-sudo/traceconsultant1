-- TRACE Analisa Konten & Medsos — performa iklan (Meta Ads / TikTok Ads).
-- DRAFT — belum dijalankan/diverifikasi. Depends on migration 018.
--
-- Akun iklan itu entitas beda dari akun Instagram/TikTok profesional biasa
-- (trace_social_accounts) — Meta Ad Account punya ID sendiri dan butuh scope
-- OAuth berbeda (ads_read/ads_management), begitu juga TikTok Ads API.
-- Makanya dibuat tabel terpisah, bukan nambah kolom di trace_social_accounts.
-- Sama seperti migration 016: bisa akun iklan Trace sendiri
-- (is_internal_account=true) atau akun iklan klien, sama-sama dikelola tim
-- Trace (bukan klien login sendiri).

create table if not exists public.trace_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  is_internal_account boolean not null default false,
  platform text not null check (platform in ('meta','tiktok')),
  ad_account_id text not null,
  display_name text,
  status text not null default 'connected' check (status in ('connected','expired','revoked')),
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  first_synced_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, platform, ad_account_id)
);

create index if not exists trace_ad_accounts_client_idx
  on public.trace_ad_accounts(client_id, platform, status);

alter table public.trace_ad_accounts enable row level security;
revoke all on table public.trace_ad_accounts from anon, authenticated;
grant select (
  id, client_id, is_internal_account, platform, ad_account_id, display_name,
  status, token_expires_at, connected_by, first_synced_at, last_synced_at,
  last_sync_error, created_at, updated_at
) on table public.trace_ad_accounts to authenticated;

drop policy if exists trace_ad_accounts_read on public.trace_ad_accounts;
create policy trace_ad_accounts_read
on public.trace_ad_accounts
for select
to authenticated
using (public.trace_is_team_member());

drop trigger if exists trg_trace_ad_accounts_updated_at on public.trace_ad_accounts;
create trigger trg_trace_ad_accounts_updated_at
  before update on public.trace_ad_accounts
  for each row execute function public.trace_set_updated_at();

-- Kampanye iklan. `promoted_content_item_id` nullable karena tidak semua
-- iklan mem-boost post organik yang sudah ada (bisa juga creative baru
-- khusus iklan) — dipakai buat menjawab pertanyaan "post organik yang sama
-- dengan iklan, mana yang lebih efisien".
create table if not exists public.trace_ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  ad_account_id uuid not null references public.trace_ad_accounts(id) on delete cascade,
  platform_campaign_id text not null,
  name text,
  objective text,
  status text not null default 'active' check (status in ('active','paused','ended','archived')),
  promoted_content_item_id uuid references public.trace_content_items(id) on delete set null,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, platform_campaign_id)
);

create index if not exists trace_ad_campaigns_client_idx
  on public.trace_ad_campaigns(client_id, status);

alter table public.trace_ad_campaigns enable row level security;
revoke all on table public.trace_ad_campaigns from anon, authenticated;
grant select on table public.trace_ad_campaigns to authenticated;

drop policy if exists trace_ad_campaigns_read on public.trace_ad_campaigns;
create policy trace_ad_campaigns_read
on public.trace_ad_campaigns
for select
to authenticated
using (public.trace_is_team_member());

drop trigger if exists trg_trace_ad_campaigns_updated_at on public.trace_ad_campaigns;
create trigger trg_trace_ad_campaigns_updated_at
  before update on public.trace_ad_campaigns
  for each row execute function public.trace_set_updated_at();

-- Metrik iklan, time-series sama seperti trace_content_metrics (bukan
-- overwrite satu baris) supaya tren spend/CTR/CPM dari waktu ke waktu tetap
-- ada, bukan cuma angka kumulatif terakhir.
create table if not exists public.trace_ad_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.trace_ad_campaigns(id) on delete cascade,
  client_id text not null,
  metric text not null,
  value numeric,
  unit text,
  currency text,
  source text not null default 'platform_api',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists trace_ad_metrics_campaign_idx
  on public.trace_ad_metrics(campaign_id, metric, captured_at desc);

alter table public.trace_ad_metrics enable row level security;
revoke all on table public.trace_ad_metrics from anon, authenticated;
grant select on table public.trace_ad_metrics to authenticated;

drop policy if exists trace_ad_metrics_read on public.trace_ad_metrics;
create policy trace_ad_metrics_read
on public.trace_ad_metrics
for select
to authenticated
using (public.trace_is_team_member());

-- CATATAN BELUM SELESAI:
-- 1. `currency` dipisah dari `unit` karena spend/CPC/CPM butuh mata uang
--    eksplisit (Meta/TikTok bisa beda currency per ad account) — belum
--    diputuskan apakah semua dinormalisasi ke IDR saat insert atau disimpan
--    apa adanya dan dikonversi saat tampil.
-- 2. Nama metrik ('spend','impressions','clicks','ctr','cpc','cpm','leads',
--    dst) belum distandarkan, sama seperti catatan di migration 017.
-- 3. Sama seperti trace_social_accounts, token di sini juga tidak pernah
--    di-grant ke authenticated — cuma boleh ditulis/dibaca backend service
--    role.
