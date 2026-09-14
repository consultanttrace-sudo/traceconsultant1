-- TRACE Analisa Konten & Medsos — log manual inquiry/DM per konten.
-- DRAFT — belum dijalankan/diverifikasi. Depends on migration 017.
--
-- KENAPA TABEL INI ADA: Instagram Graph API (dan TikTok) tidak expose data
-- atau jumlah DM ke aplikasi pihak ketiga — dibatasi ketat oleh platform.
-- Jadi sinyal "post ini menghasilkan inquiry/lead" TIDAK BISA ditarik
-- otomatis lewat sinkronisasi API seperti trace_content_metrics. Satu-
-- satunya cara jujur (evidence-first, bukan estimasi) adalah tim Trace
-- mencatat manual tiap kali ada inquiry yang bisa ditelusuri ke sebuah
-- konten — baik dari akun Trace sendiri (calon klien baru) maupun akun
-- klien (calon pelanggan resto/cafe).
--
-- Baris di sini SENGAJA tidak otomatis membuat entri di pipeline akuisisi
-- (core/acquisition.ts) — itu keputusan produk yang belum diambil (apakah
-- setiap inquiry otomatis jadi raw_lead, atau tim yang review manual dulu).
-- Kolom `linked_lead_id` disediakan sebagai referensi longgar (text, bukan
-- foreign key) supaya tim bisa mengisinya manual setelah lead itu benar-
-- benar dibuat di sisi acquisition, tanpa memaksa skema baru yang belum jelas.

create table if not exists public.trace_content_inquiries (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  content_item_id uuid references public.trace_content_items(id) on delete set null,
  platform text not null check (platform in ('instagram','tiktok')),
  contact_channel text not null check (contact_channel in ('dm','comment','whatsapp','other')),
  logged_by uuid not null references auth.users(id) on delete restrict,
  note text,
  linked_lead_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trace_content_inquiries_client_idx
  on public.trace_content_inquiries(client_id, created_at desc);
create index if not exists trace_content_inquiries_content_idx
  on public.trace_content_inquiries(content_item_id);

alter table public.trace_content_inquiries enable row level security;
revoke all on table public.trace_content_inquiries from anon, authenticated;
grant select, insert, update on table public.trace_content_inquiries to authenticated;

drop policy if exists trace_content_inquiries_rw on public.trace_content_inquiries;
create policy trace_content_inquiries_rw
on public.trace_content_inquiries
for all
to authenticated
using (public.trace_is_team_member())
with check (public.trace_is_team_member() and logged_by = auth.uid());

drop trigger if exists trg_trace_content_inquiries_updated_at on public.trace_content_inquiries;
create trigger trg_trace_content_inquiries_updated_at
  before update on public.trace_content_inquiries
  for each row execute function public.trace_set_updated_at();

-- CATATAN BELUM SELESAI (keputusan produk, belum diambil user):
-- 1. content_item_id nullable karena kadang tim tau ada inquiry tapi tidak
--    yakin persis dari post yang mana (mis. orang bilang "saya lihat IG
--    kalian" tanpa sebut postingan spesifik) — dicatat tetap berguna untuk
--    hitung total inquiry per periode, walau tidak granular per post.
-- 2. Belum diputuskan apakah tabel ini butuh UI form ringan sendiri (mis.
--    dropdown pilih konten + channel + catatan) atau cukup diisi lewat
--    modul Acquisition/Collaboration yang sudah ada — perlu keputusan user
--    sebelum bagian UI dikerjakan.
