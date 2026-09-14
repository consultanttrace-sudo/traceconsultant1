-- TRACE Analisa Konten & Medsos — koneksi akun sosmed (OAuth) Instagram & TikTok.
-- DRAFT — belum dijalankan/diverifikasi. Depends on migration 001.
--
-- KOREKSI SCOPE (2026-09-12): TRACE Consultants OS murni internal untuk
-- tim Trace sendiri — TIDAK ADA klien yang login sendiri ke aplikasi ini.
-- Tabel ini menampung DUA jenis akun sekaligus, dibedakan lewat
-- `is_internal_account`:
--   - is_internal_account = true  -> akun Instagram/TikTok Trace Consultants
--     sendiri (dipakai buat cari klien lewat konten), client_id di sini
--     boleh diisi konstanta tetap mis. 'trace-internal'.
--   - is_internal_account = false -> akun klien F&B, dikelola/dikonek oleh
--     TIM TRACE atas nama klien (lewat akses admin/collaborator yang
--     diberikan klien di luar aplikasi, atau OAuth yang dilakukan tim
--     Trace) — bukan klien connect sendiri lewat portal.
-- Makanya RLS di bawah cuma mengenal satu jenis akses: trace_is_team_member().
-- client_id di sini murni untuk mengelompokkan data di dalam kerja tim,
-- bukan untuk membatasi akses klien (klien memang tidak pernah masuk ke
-- sistem ini sama sekali, baik akun sendiri maupun akun Trace).
--
-- Token TIDAK PERNAH boleh dibaca lewat PostgREST bahkan oleh tim Trace —
-- hanya boleh ditulis/dibaca oleh backend tepercaya (mis. Edge Function
-- pakai service role) saat proses OAuth callback dan refresh token. Makanya
-- kolom token di-exclude dari grant select secara eksplisit (column-level
-- grant), bukan cuma "jangan ditampilkan di UI" — ini proteksi di level
-- database, supaya token tidak bocor lewat DevTools/network tab tim sendiri.

create table if not exists public.trace_social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  is_internal_account boolean not null default false,
  platform text not null check (platform in ('instagram','tiktok')),
  platform_account_id text not null,
  display_name text,
  status text not null default 'connected' check (status in ('connected','expired','revoked')),
  scopes text[] not null default '{}',
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  first_synced_at timestamptz,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, platform, platform_account_id)
);

create index if not exists trace_social_accounts_client_idx
  on public.trace_social_accounts(client_id, platform, status);
create index if not exists trace_social_accounts_internal_idx
  on public.trace_social_accounts(is_internal_account);

alter table public.trace_social_accounts enable row level security;
revoke all on table public.trace_social_accounts from anon, authenticated;

-- Kolom non-token boleh dibaca tim internal (lintas semua klien). Kolom
-- token TIDAK di-grant sama sekali ke authenticated — sengaja tidak ada di
-- daftar kolom berikut, termasuk untuk tim Trace sendiri (lihat catatan
-- proteksi token di atas).
grant select (
  id, client_id, is_internal_account, platform, platform_account_id,
  display_name, status, scopes, token_expires_at, connected_by,
  first_synced_at, last_synced_at, last_sync_error, created_at, updated_at
) on table public.trace_social_accounts to authenticated;

drop policy if exists trace_social_accounts_read on public.trace_social_accounts;
create policy trace_social_accounts_read
on public.trace_social_accounts
for select
to authenticated
using (public.trace_is_team_member());

-- Update status (mis. tim Trace klik "revoke" saat akses klien dicabut)
-- diberikan lewat function security definer di bawah, BUKAN lewat UPDATE
-- langsung ke tabel — supaya token tetap tidak bisa diutak-atik langsung
-- lewat client-side call walau grant select-nya sudah dibatasi. Tidak ada
-- policy "for update" untuk authenticated.

create or replace function public.trace_revoke_social_account(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.trace_social_accounts%rowtype;
begin
  select * into v_row from public.trace_social_accounts where id = p_account_id;
  if not found then
    raise exception 'TRACE_SOCIAL_ACCOUNT_NOT_FOUND';
  end if;
  if not public.trace_is_team_member() then
    raise exception 'TRACE_SOCIAL_ACCOUNT_ACCESS_DENIED';
  end if;

  update public.trace_social_accounts
  set status = 'revoked',
      access_token_ciphertext = null,
      refresh_token_ciphertext = null,
      token_expires_at = null
  where id = p_account_id
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

revoke all on function public.trace_revoke_social_account(uuid) from public;
grant execute on function public.trace_revoke_social_account(uuid) to authenticated;

drop trigger if exists trg_trace_social_accounts_updated_at on public.trace_social_accounts;
create trigger trg_trace_social_accounts_updated_at
  before update on public.trace_social_accounts
  for each row execute function public.trace_set_updated_at();

-- CATATAN BELUM SELESAI:
-- 1. Penulisan access_token_ciphertext/refresh_token_ciphertext saat OAuth
--    callback pertama kali HARUS lewat service role (Edge Function), tidak
--    ada jalur untuk authenticated menulis kolom ini sama sekali di
--    migration ini (sengaja) — perlu Edge Function terpisah, belum dibuat.
-- 2. "Ciphertext" mengasumsikan enkripsi terjadi di application layer
--    sebelum insert (mis. lewat pgsodium/vault atau KMS eksternal) — skema
--    ini TIDAK mengimplementasikan enkripsinya sendiri, cuma menyediakan
--    kolomnya. Keputusan mekanisme enkripsi belum diambil.
