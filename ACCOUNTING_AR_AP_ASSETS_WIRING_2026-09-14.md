# Menyambungkan Piutang, Utang, Aset Tetap, Tutup Buku, dan Neraca ke Database + UI — 2026-09-14

Lanjutan dari `ACCOUNTING_CORE_ADDON_MERGE_2026-09-14.md`, yang saat itu menyebut 4 hal ini
masih murni logic `.ts` tanpa tabel Supabase maupun UI. Dokumen ini mencatat apa yang **benar-benar**
dikerjakan sekarang, dan apa yang **masih** belum, supaya tidak ada klaim "sudah jadi fitur" yang
sebenarnya belum benar — sama seperti prinsip dokumen sebelumnya.

## Yang dikerjakan

1. **Migration baru** `supabase/migrations/032_ar_ap_fixed_assets_period_close_v72.sql`:
   tabel `trace_ar_invoices`, `trace_ar_payments`, `trace_ap_bills`, `trace_ap_payments`,
   `trace_fixed_assets`, `trace_period_locks` — semua RLS fail-closed (revoke total dari
   `anon`/`authenticated`), akses hanya lewat RPC `security definer` yang mengecek
   `trace_is_team_member()` dan mencatat `trace_append_audit_event()`, mengikuti pola persis
   `028_accounting_and_cogs_v72.sql`.
2. **Celah nyata ditutup**: `trace_post_balanced_journal` (dari migration 028) di-`create or replace`
   ulang di migration 032 supaya menolak jurnal baru (`TRACE_JOURNAL_PERIOD_LOCKED`) kalau bulan
   `entry_date`-nya sudah ada di `trace_period_locks` untuk client itu. Sebelum ini,
   `assertPeriodNotLocked()` di `periodClose.ts` cuma logic yang tidak pernah benar-benar dipanggil
   dari mana pun — sekarang dipaksakan di level database, bukan cuma di kode aplikasi yang bisa
   dilewati.
3. **Tidak ada RPC untuk membuka kunci periode** — sesuai komentar asli di `periodClose.ts` bahwa
   koreksi periode terkunci harus lewat jurnal penyesuaian di periode berjalan, bukan buka kunci.
4. Migration baru `supabase/migrations/033_client_scope_ar_ap_assets_read_v72.sql`: menambahkan
   6 key baru (`ar_invoices`, `ar_payments`, `ap_bills`, `ap_payments`, `fixed_assets`,
   `period_locks`) ke `trace_read_client_dataset()` supaya ikut kebaca client-scoped, sama seperti
   dataset lain.
5. **UI React** (`src/app/main.tsx`, di dalam `AccountingView`): 4 kartu baru — Piutang & umur
   piutang, Utang & umur utang, Aset Tetap & penyusutan, Tutup Buku — masing-masing dengan form
   input yang langsung memanggil RPC di atas lewat `supabase.rpc(...)`, plus kartu **Neraca**
   (sebelumnya sama sekali tidak ada di UI) yang memanggil `buildBalanceSheet()` dan
   `withInferredSubTypes()` dari paket addon sebelumnya.
6. **Test static baru** `tests_core/test_v72_3_ar_ap_assets_period_lock.mjs` — mengecek tabel, RLS,
   nama fungsi RPC, penutupan celah period lock, dan bahwa `main.tsx` benar-benar memanggil tiap RPC
   (bukan cuma logic `.ts` yang tidak dipakai). Test ini murni baca file (`fs`/`assert`), tidak butuh
   `npm install`, dan sudah dijalankan dan **PASS** di lingkungan ini. Ditambahkan ke rantai
   `npm run test:deterministic` di `package.json`.

## Yang TIDAK bisa saya verifikasi dari sini

- **Migration 032 dan 033 belum pernah dijalankan ke Supabase project asli** (`trace.os`,
  `esxnyydagwscyokyqtxp`). SQL-nya sudah ditulis mengikuti pola migration 028–030 yang sudah ada,
  tapi belum dites jalan bersih ke skema live — ini harus dijalankan manual lewat SQL Editor
  Supabase, urut setelah migration 031.
- **`tsc -p tsconfig.react.json` / `npm run build:react` tidak bisa dijalankan** di lingkungan ini
  (tidak ada `node_modules`, tidak ada akses network untuk `npm install`). Perubahan di `main.tsx`
  sudah dicek manual (brace balance, penulisan ulang seksi per seksi) dan lolos test static di atas,
  tapi **belum lolos typecheck TypeScript sungguhan maupun browser render sungguhan**. Wajib jalankan
  `npm run typecheck:react` dan `npm run build:react` di komputer Anda sebelum deploy.
- **COGS resep** (`calculateRecipeCogs`) masih belum ada UI-nya — sama seperti disebutkan di
  `AccountingView` sebelumnya, tetap di luar cakupan pekerjaan ini.
- **Kolom `sub_type` di database** tetap belum ada — Neraca masih pakai inferensi dari kode akun
  (`accountSubTypeInference.ts`), bukan kolom database, seperti diputuskan di dokumen sebelumnya.

## Cara verifikasi ulang klaim di atas
```
node tests_core/test_v72_3_ar_ap_assets_period_lock.mjs
```
Harus `PASS`. Setelah `npm install` di komputer Anda sendiri, jalankan juga:
```
npm run test:deterministic
npm run typecheck:react
npm run build:react
```
