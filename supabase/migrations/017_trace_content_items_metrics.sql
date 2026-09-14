-- TRACE Analisa Konten & Medsos — konten yang ditarik dari platform + metrik.
-- DRAFT — belum dijalankan/diverifikasi. Depends on migration 016.
--
-- trace_content_metrics sengaja time-series (captured_at per baris, bukan
-- overwrite satu baris), meniru bentuk EvidenceItem di core/evidence.ts
-- (metric, value, unit, capturedAt, source) — supaya nanti gampang di-map
-- langsung jadi EvidenceItem[] tanpa transformasi aneh, dan supaya retention
-- curve / tren dari waktu ke waktu tidak hilang (bukan cuma angka terakhir).

create table if not exists public.trace_content_items (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  social_account_id uuid not null references public.trace_social_accounts(id) on delete cascade,
  platform text not null check (platform in ('instagram','tiktok')),
  platform_post_id text not null,
  permalink text,
  content_type text check (content_type in ('reel','post','story','video','short','other')),
  caption text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(social_account_id, platform_post_id)
);

create index if not exists trace_content_items_client_idx
  on public.trace_content_items(client_id, posted_at desc);

alter table public.trace_content_items enable row level security;
revoke all on table public.trace_content_items from anon, authenticated;
grant select on table public.trace_content_items to authenticated;

drop policy if exists trace_content_items_read on public.trace_content_items;
create policy trace_content_items_read
on public.trace_content_items
for select
to authenticated
using (public.trace_is_team_member());

drop trigger if exists trg_trace_content_items_updated_at on public.trace_content_items;
create trigger trg_trace_content_items_updated_at
  before update on public.trace_content_items
  for each row execute function public.trace_set_updated_at();

-- Metrik mentah, satu baris per snapshot pengambilan data (bukan overwrite).
create table if not exists public.trace_content_metrics (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.trace_content_items(id) on delete cascade,
  client_id text not null,
  metric text not null,
  value numeric,
  unit text,
  source text not null default 'platform_api',
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists trace_content_metrics_item_idx
  on public.trace_content_metrics(content_item_id, metric, captured_at desc);

alter table public.trace_content_metrics enable row level security;
revoke all on table public.trace_content_metrics from anon, authenticated;
grant select on table public.trace_content_metrics to authenticated;

drop policy if exists trace_content_metrics_read on public.trace_content_metrics;
create policy trace_content_metrics_read
on public.trace_content_metrics
for select
to authenticated
using (public.trace_is_team_member());

-- CATATAN BELUM SELESAI:
-- 1. Nama-nama "metric" (views/reach/retention_pct/completion_rate/likes/
--    comments/shares/watch_time_seconds, dst) belum distandarkan jadi enum
--    atau lookup table — masih bebas text. Ini mengikuti masukan poin 4
--    (normalisasi metrik lintas platform) yang belum diputuskan mekanismenya,
--    jadi sengaja dibiarkan longgar dulu supaya tidak salah kunci di awal.
-- 2. Insert ke trace_content_items/trace_content_metrics diasumsikan lewat
--    job sinkronisasi backend (service role), bukan langsung dari client
--    app — makanya tidak ada policy insert untuk authenticated di sini.
