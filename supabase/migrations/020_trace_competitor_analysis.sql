-- TRACE Analisa Konten & Medsos — analisa akun kompetitor.
-- DRAFT — belum dijalankan/diverifikasi. Depends on migration 016.
--
-- BATASAN PENTING (baca sebelum implementasi Claude Code):
-- Kompetitor adalah akun MILIK ORANG LAIN — tidak ada OAuth yang bisa
-- dipakai. Data yang bisa ditarik jauh lebih terbatas dibanding akun
-- sendiri/klien:
--   - Instagram: lewat Business Discovery API (akun Trace/klien yang sudah
--     terhubung bisa query data PUBLIK akun Business/Creator lain —
--     follower_count, media_count, like_count/comments_count per post
--     publik). TIDAK BISA dapat reach/impressions/saves (itu privat, cuma
--     kelihatan oleh pemilik akun), dan biasanya cuma beberapa post
--     terakhir yang bisa diakses, bukan histori panjang.
--   - TikTok: nyaris tidak ada API resmi untuk intip akun orang lain.
--     Kemungkinan besar field TikTok di sini akan diisi manual oleh tim
--     (dicatat dari observasi langsung), bukan sinkron otomatis.
-- Jadi tabel ini menampung campuran data semi-otomatis (IG) dan manual
-- (TikTok, atau IG kalau Business Discovery gagal/dibatasi rate limit).
-- `source` di trace_competitor_snapshots dipakai untuk membedakan mana yang
-- API dan mana yang catatan manual — jangan sampai keduanya tercampur tanpa
-- keterangan (melanggar prinsip evidence-first).

create table if not exists public.trace_competitor_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  platform text not null check (platform in ('instagram','tiktok')),
  handle text not null,
  display_name text,
  niche text,
  note text,
  added_by uuid references auth.users(id) on delete set null,
  tracked_since timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, platform, handle)
);

create index if not exists trace_competitor_accounts_client_idx
  on public.trace_competitor_accounts(client_id, platform);

alter table public.trace_competitor_accounts enable row level security;
revoke all on table public.trace_competitor_accounts from anon, authenticated;
grant select, insert, update on table public.trace_competitor_accounts to authenticated;

drop policy if exists trace_competitor_accounts_rw on public.trace_competitor_accounts;
create policy trace_competitor_accounts_rw
on public.trace_competitor_accounts
for all
to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member());

drop trigger if exists trg_trace_competitor_accounts_updated_at on public.trace_competitor_accounts;
create trigger trg_trace_competitor_accounts_updated_at
  before update on public.trace_competitor_accounts
  for each row execute function public.trace_set_updated_at();

-- Snapshot berkala (follower count, media count, rata-rata engagement) —
-- bukan time-series granular seperti trace_content_metrics, karena datanya
-- memang cuma bisa diambil sesekali (rate limit + keterbatasan API di atas).
create table if not exists public.trace_competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.trace_competitor_accounts(id) on delete cascade,
  client_id text not null,
  follower_count integer,
  following_count integer,
  media_count integer,
  avg_like_count numeric,
  avg_comment_count numeric,
  source text not null check (source in ('platform_api','manual')),
  logged_by uuid references auth.users(id) on delete set null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists trace_competitor_snapshots_competitor_idx
  on public.trace_competitor_snapshots(competitor_id, captured_at desc);

alter table public.trace_competitor_snapshots enable row level security;
revoke all on table public.trace_competitor_snapshots from anon, authenticated;
grant select, insert on table public.trace_competitor_snapshots to authenticated;

drop policy if exists trace_competitor_snapshots_rw on public.trace_competitor_snapshots;
create policy trace_competitor_snapshots_rw
on public.trace_competitor_snapshots
for all
to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member());

-- Post publik kompetitor yang sempat terlihat (via Business Discovery, atau
-- dicatat manual). Tidak ada jaminan post lama tetap bisa diakses lagi
-- setelah beberapa waktu — makanya caption/metrik disimpan di sini saat
-- pertama kali terlihat, bukan cuma nyimpen permalink dan fetch ulang nanti.
create table if not exists public.trace_competitor_posts (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.trace_competitor_accounts(id) on delete cascade,
  client_id text not null,
  permalink text,
  content_type text check (content_type in ('reel','post','video','other')),
  caption text,
  like_count integer,
  comment_count integer,
  posted_at timestamptz,
  source text not null check (source in ('platform_api','manual')),
  logged_by uuid references auth.users(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists trace_competitor_posts_competitor_idx
  on public.trace_competitor_posts(competitor_id, posted_at desc);

alter table public.trace_competitor_posts enable row level security;
revoke all on table public.trace_competitor_posts from anon, authenticated;
grant select, insert on table public.trace_competitor_posts to authenticated;

drop policy if exists trace_competitor_posts_rw on public.trace_competitor_posts;
create policy trace_competitor_posts_rw
on public.trace_competitor_posts
for all
to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member());

-- ============================================================================
-- KEPUTUSAN (2026-09-12): resolusi 3 poin "CATATAN BELUM SELESAI" di atas.
-- ============================================================================
-- Dipilih: kacamata PER-CLIENT (bukan satu akun Trace pusat), dengan
-- fallback eksplisit (bukan silent-fail), prioritas antrian refresh, dan
-- cap jumlah kompetitor per klien. Semua tabel/fungsi baru di bawah ini
-- hanya menyentuh objek yang dibuat migration 020 ini sendiri — tidak
-- mengubah migration 001-019 maupun trace_social_accounts.

-- 1. Kacamata per klien — satu baris per client_id, menunjuk ke salah satu
--    trace_social_accounts milik client_id yang sama. Validasi lintas kolom
--    (harus milik client_id yang sama, bukan akun internal, dan berstatus
--    connected) dilakukan di trigger karena tidak bisa murni pakai FK/CHECK.
create table if not exists public.trace_competitor_discovery_lens (
  client_id text primary key,
  discovery_account_id uuid references public.trace_social_accounts(id) on delete set null,
  max_competitors integer not null default 5,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.trace_competitor_discovery_lens enable row level security;
revoke all on table public.trace_competitor_discovery_lens from anon, authenticated;
grant select, insert, update on table public.trace_competitor_discovery_lens to authenticated;

drop policy if exists trace_competitor_discovery_lens_rw on public.trace_competitor_discovery_lens;
create policy trace_competitor_discovery_lens_rw
on public.trace_competitor_discovery_lens
for all
to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member());

drop trigger if exists trg_trace_competitor_discovery_lens_updated_at on public.trace_competitor_discovery_lens;
create trigger trg_trace_competitor_discovery_lens_updated_at
  before update on public.trace_competitor_discovery_lens
  for each row execute function public.trace_set_updated_at();

create or replace function public.trace_validate_discovery_lens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.trace_social_accounts%rowtype;
begin
  if new.discovery_account_id is null then
    return new;
  end if;

  select * into v_account
  from public.trace_social_accounts
  where id = new.discovery_account_id;

  if not found then
    raise exception 'TRACE_DISCOVERY_LENS_ACCOUNT_NOT_FOUND';
  end if;
  if v_account.client_id <> new.client_id then
    raise exception 'TRACE_DISCOVERY_LENS_CLIENT_MISMATCH';
  end if;
  if v_account.is_internal_account then
    raise exception 'TRACE_DISCOVERY_LENS_MUST_BE_CLIENT_ACCOUNT';
  end if;
  if v_account.status <> 'connected' then
    raise exception 'TRACE_DISCOVERY_LENS_ACCOUNT_NOT_CONNECTED';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trace_validate_discovery_lens on public.trace_competitor_discovery_lens;
create trigger trg_trace_validate_discovery_lens
  before insert or update on public.trace_competitor_discovery_lens
  for each row execute function public.trace_validate_discovery_lens();

-- 2. Cap jumlah kompetitor per klien — enforced di trigger, bukan cuma
--    disiplin tim, supaya kualitas data per kompetitor terjaga (kompetitor
--    sedikit tapi sering di-refresh > kompetitor banyak tapi data basi).
--    Cap dibaca dari trace_competitor_discovery_lens.max_competitors kalau
--    sudah ada baris untuk client_id itu; default 5 kalau belum ada.
create or replace function public.trace_enforce_competitor_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap integer;
  v_count integer;
begin
  select coalesce(
    (select max_competitors from public.trace_competitor_discovery_lens where client_id = new.client_id),
    5
  ) into v_cap;

  select count(*) into v_count
  from public.trace_competitor_accounts
  where client_id = new.client_id;

  if v_count >= v_cap then
    raise exception 'TRACE_COMPETITOR_CAP_REACHED: client % sudah punya % kompetitor (batas %)', new.client_id, v_count, v_cap;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_trace_enforce_competitor_cap on public.trace_competitor_accounts;
create trigger trg_trace_enforce_competitor_cap
  before insert on public.trace_competitor_accounts
  for each row execute function public.trace_enforce_competitor_cap();

-- 3. Status kacamata eksplisit per klien — view, BUKAN silent gap. UI wajib
--    query ini sebelum render halaman kompetitor, supaya klien yang belum
--    punya kacamata tampil dengan status jelas ('no_lens_configured'), bukan
--    cuma daftar kosong tanpa keterangan (evidence-first, konsisten dengan
--    prinsip di core/evidence.ts).
-- PENTING: driven dari UNIVERSE client_id (akun klien + kompetitor + lens
-- yang sudah ada), BUKAN cuma dari trace_competitor_discovery_lens. Kalau
-- driven dari tabel lens saja, klien yang belum pernah punya baris lens sama
-- sekali akan hilang total dari hasil view (0 baris) alih-alih tampil
-- dengan status 'no_lens_configured' — persis silent gap yang ingin
-- dihindari. (Ketahuan lewat functional test sebelum migration ini
-- difinalkan — lihat catatan pengujian.)
create or replace view public.trace_competitor_discovery_status as
with known_clients as (
  select distinct client_id from public.trace_social_accounts where is_internal_account = false
  union
  select distinct client_id from public.trace_competitor_accounts
  union
  select distinct client_id from public.trace_competitor_discovery_lens
)
select
  kc.client_id,
  l.discovery_account_id,
  case
    when l.discovery_account_id is null then 'no_lens_configured'
    when sa.status = 'connected' then 'lens_active'
    when sa.status = 'expired' then 'lens_expired'
    when sa.status = 'revoked' then 'lens_revoked'
    else 'unknown'
  end as lens_status,
  coalesce(l.max_competitors, 5) as max_competitors,
  (select count(*) from public.trace_competitor_accounts ca where ca.client_id = kc.client_id) as current_competitor_count
from known_clients kc
left join public.trace_competitor_discovery_lens l on l.client_id = kc.client_id
left join public.trace_social_accounts sa on sa.id = l.discovery_account_id;

-- security_invoker supaya RLS trace_competitor_discovery_lens dan
-- trace_social_accounts tetap berlaku lewat view ini — bukan security
-- definer view yang diam-diam melewati RLS.
alter view public.trace_competitor_discovery_status set (security_invoker = true);
grant select on public.trace_competitor_discovery_status to authenticated;

-- 4. Prioritas antrian refresh — kompetitor yang paling lama tidak
--    di-refresh (atau belum pernah sama sekali) diprioritaskan duluan.
--    SENGAJA TANPA security definer supaya RLS tetap jalan lewat hak akses
--    pemanggil (team member) — dipanggil oleh job sync (belum dibuat),
--    bukan endpoint bebas dipanggil client-side sembarangan.
create or replace function public.trace_next_competitor_refresh(p_client_id text, p_limit integer default 5)
returns table(competitor_id uuid, handle text, last_captured_at timestamptz)
language sql
stable
set search_path = public
as $$
  select
    ca.id as competitor_id,
    ca.handle,
    (select max(cs.captured_at) from public.trace_competitor_snapshots cs where cs.competitor_id = ca.id) as last_captured_at
  from public.trace_competitor_accounts ca
  where ca.client_id = p_client_id
  order by last_captured_at asc nulls first
  limit p_limit;
$$;

revoke all on function public.trace_next_competitor_refresh(text, integer) from public;
grant execute on function public.trace_next_competitor_refresh(text, integer) to authenticated;

-- CATATAN BELUM SELESAI (sisa, di luar scope keputusan 2026-09-12 di atas):
-- 1. Edge Function/job sync yang benar-benar MEMANGGIL
--    trace_next_competitor_refresh() dan menulis ke trace_competitor_snapshots
--    belum dibuat — fungsi ini baru menyediakan urutan prioritas, belum ada
--    yang mengeksekusinya secara terjadwal.
-- 2. UI untuk tim mengisi/mengubah trace_competitor_discovery_lens (pilih
--    akun kacamata per klien) belum dibuat.
-- 3. max_competitors default 5 adalah asumsi awal berdasarkan kapasitas tim
--    3 orang — belum divalidasi dengan beban kerja nyata setelah beberapa
--    bulan pemakaian.
