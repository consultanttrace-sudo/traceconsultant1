# Perbaikan yang dikerjakan — 14 Sep 2026

Dikerjakan langsung di `src/app/main.tsx` berdasarkan `daftar-total-perbaikan-trace-os.md`.
**Belum di-`npm install` / build / test** — jaringan tidak tersedia di sesi ini (lihat
"Yang perlu kamu jalankan sendiri" di bawah).

## Selesai

1. **Poin 3 — Login (gap keamanan)**: dipasang auth gate asli di komponen `App`.
   - Hook `useSupabaseSession()` memantau session via `getSession()` + `onAuthStateChange`.
   - Komponen `LoginGate` (sign in / sign up dengan email+password Supabase Auth).
   - Kalau belum ada session → tampilkan form login, bukan langsung sidebar+konten.
   - Tombol "Keluar" ditambahkan di sidebar.

2. **Poin 4 — Bug CSS Acquisition**: parent iframe diganti dari `display:'grid'` ke
   `display:'flex',flexDirection:'column'`, iframe pakai `flex:'1 1 auto',minHeight:0`.
   Ini persis bug yang didiagnosis di daftar (flex:1 tidak berlaku di luar flex container).

3. **Poin 5 — Command Center & Internal Diagnosis** (cangkang → data nyata):
   - Hook baru `useLeaderSnapshots(clients)` yang loop tiap klien dan hitung Business
     Health-nya (finance + POS + inventory, evidence-first — mesin yang sama dengan
     halaman Business Health) lewat `loadTraceCollections` per-klien.
   - `LeaderCommandCenterView` sekarang memanggil `buildLeaderCommandCenter(snapshots)`
     dengan data asli, menampilkan counts (healthy/attention/critical/unknown) dan daftar
     klien terprioritas dengan alasan health masing-masing.
   - `InternalDiagnosisView` sekarang memanggil `diagnoseInternalSystem({commandCenter})`
     dengan Command Center asli di atas, jadi finding "action blocked" / "data gap per
     klien" muncul dari evidence nyata — bukan lagi selalu kosong.
   - **Catatan jujur**: field `diagnostics` (source-level Security Guard / static
     analysis) di `diagnoseInternalSystem` masih belum diisi — itu poin 6 (sensor belum
     ada), scope-nya lebih besar (butuh kirim source file ke `window.__traceSecurityFiles`
     / `window.__traceUsageSignals`). Belum dikerjakan di pass ini.

4. **Poin 1 (sebagian) — Tambah Klien manual**: form "+ Tambah Klien" di halaman Klien
   (nama, kategori, area, kontak, sumber Manual/Acquisition), pakai mekanisme KV yang
   sama dengan `createClientFromLead` yang sudah ada (`trace_upsert_global_kv`).
   **Ini BUKAN migrasi ke tabel relasional** (bullet pertama poin 1) — itu masih blob KV
   `trace_os::trace-clients`, cuma sekarang bisa diisi manual dari UI, bukan cuma dari
   Acquisition. Migrasi ke tabel `clients` relasional + RLS per baris + Client Switcher
   global belum dikerjakan — itu perubahan skema database + refactor ~12 tempat yang
   baca `trace-clients`, risikonya tinggi kalau dikerjakan tanpa bisa dites di sini.

## Belum dikerjakan (scope-nya besar / butuh keputusan atau akses yang saya tidak punya)

- **Poin 10 (env var check)** — saya tidak punya akses ke Netlify dashboard. Cek dulu:
  site `traceconsultantnew` → Environment Variables → `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` harus menunjuk ke project Supabase yang sama dengan app lama
  (`esxnyydagwscyokyqtxp.supabase.co`).
- **Poin 1 (fondasi penuh)** — tabel `clients` relasional + Client Switcher global di
  topbar. Perubahan skema + migrasi data dari KV blob, sebaiknya dikerjakan sebagai
  langkah terpisah dengan migration SQL baru.
- **Poin 2** — Data Intake & Penjualan masih field teks bebas untuk client, belum ikut
  Client Switcher (karena Client Switcher globalnya sendiri belum ada — poin 1).
- **Poin 6** — sensor Security Guard / Evolution Advisor (`window.__traceSecurityFiles`,
  `window.__traceUsageSignals`) belum dipasang.
- **Poin 7** — layar isi Bahan Baku/Resep (HPP) di app baru; mesinnya sudah ada
  (`calculateRecipeCogs`) tapi belum ada UI. App lama sudah punya tab "Bahan & Resep"
  yang bisa jadi referensi.
- **Poin 8** — tombol download PDF/Excel di Business Health, Diagnosis, Akuntansi,
  Analytics (saat ini cuma ada di halaman Keuangan).
- **Test suite** (`tests_core/`, `tests_real/`) belum saya jalankan — butuh
  `npm install` + jaringan yang tidak tersedia di sesi ini.

## Yang perlu kamu jalankan sendiri sebelum deploy

```bash
npm install
npm run build   # atau perintah build yang biasa kamu pakai (cek package.json)
```
Kalau ada TypeScript/build error dari perubahan di atas, paling mungkin di sekitar
`App`, `LoginGate`, `useSupabaseSession`, `useLeaderSnapshots`, `LeaderCommandCenterView`,
`InternalDiagnosisView`, `ClientsView`, `AcquisitionView` di `src/app/main.tsx` — semua
perubahan saya ada di file itu saja, gampang di-grep.

Setelah itu jalankan test suite (`tests_core/`, `tests_real/`) sebelum push ke repo
GitHub lama.
