> **[DIHENTIKAN — baca STATUS.md]** Rantai `HANDOFF_NEXT_PHASES_v*.md` tidak dilanjutkan lagi mulai 2026-09-21. File ini disimpan sebagai arsip historis (keputusan desain & konteks di dalamnya tetap berlaku kecuali dikoreksi di `STATUS.md`), tapi status terkini HANYA ada di `STATUS.md` di root repo.

# TRACE Consultant OS — HANDOFF v4 (dibuat 2026-09-21, sesi Phase 4+2: periode/outlet global)

Menggantikan v3 untuk status terbaru; v3, v2, v1 tetap dibaca untuk konteks (keputusan desain v2 §2, fakta produk v2 §5b–5d, sejarah phase). Sumber kebenaran = KODE di ZIP `traceconsultant1-main_PHASE2_redesign_v6.zip`.

## 1. YANG SELESAI SESI INI — scope global: klien + outlet + periode

### 1a. Verifikasi (dijalankan sungguhan, node v22.22.2 / npm 10.9.7)
```
npm ci                       → PASS
npm run typecheck:react      → PASS, 0 error
npm run test:deterministic   → PASS, exit 0 (termasuk test_scope.mjs baru dan test_client_scope_static.mjs yang diperbarui)
npm run build:react          → PASS (bundle utama masih >500 kB — Phase 18 belum)
npm run build:site           → PASS
npm run release:preflight    → PASS (verify:runtime + verify:dependencies ok:true)
```
TETAP BELUM diverifikasi: Supabase live (RPC 053 dari v3 juga belum), render di browser asli, kontras/keyboard/reduced-motion. Jangan tandai PASS untuk itu.

### 1b. Desain
- `src/core/scope.ts` (BARU, fungsi murni, dikompilasi ke `dist/core`): `ScopeState {clientId, outletId, period}`, `reduceScope`, `parseScope`/`writeScope` (URL `?client=&outlet=&period=`), `resolvePeriod` (fallback per modul: `current` | `latest` | `none`), `previousPeriod`/`shiftPeriod`/`recentPeriods`, `reconcileScope` (id klien/outlet basi), `outletOptionsForClient`, `scopePatchForLink`.
- Aturan: outlet milik satu klien → di-reset saat klien berganti (bug lama: outlet klien A terbawa ke klien B, sudah hilang); periode = filter waktu → bertahan saat ganti klien; periode tak valid dari URL dibuang; outlet tanpa klien dibuang; nilai periode tak valid dari input ditolak (nilai '' = hapus pilihan).
- `src/app/scopeStore.ts` (BARU): store tunggal + `useScope`, `usePeriodScope(fallback, available?)`, `useOutletScope`, `dispatchScope`, `setScope`. `clientScope.ts` kini pembungkus tipis (API `useClientScope`/`setClientScope`/`getClientScope` tidak berubah, 18 view lama tak perlu disentuh).
- `src/app/components/ScopeSelectors.tsx` (BARU): `PeriodSelector`, `OutletSelector`, `useOutletOptions`. Selector outlet = input + datalist, nilai disimpan saat pilih/Enter/blur (bukan tiap ketikan, supaya modul tidak refetch tiap huruf).

### 1c. Modul yang dimigrasi
- Periode global: BusinessDiagnosis, CashFlow, BusinessHealth (daftar periode = yang punya data; periode dipilih tanpa data → pesan "belum ada data", BUKAN angka 0; snapshot Health tidak bisa disimpan), KPI, OPEX, FnbTargetPlanner (fallback bulan berjalan), FinanceEntry & Payroll (hanya mengisi awal entri BARU).
- Outlet global: ActionPlan, KPI, Marketing, OPEX, Payroll, StockOpname, FnbTargetPlanner, FinanceEntry (isi awal).
- Overview: `filters.period` kini = periode global (bukan filter privat lagi); bulan tanpa data tetap bisa dipilih dan menghasilkan "Data belum cukup".
- Top bar: chip Periode hanya di modul yang memakai periode (`PERIOD_SCOPED` di main.tsx), chip Outlet hanya di modul yang memakai outlet dan hanya bila klien punya daftar outlet (`OUTLET_SCOPED`). Sengaja tidak dipasang di modul yang tidak memfilter apa pun (supaya chip tidak menipu).
- Klien basi di URL: dibersihkan untuk SEMUA modul (beserta outlet) setelah daftar klien LENGKAP termuat, dengan notifikasi. Dibandingkan ke daftar penuh, bukan daftar 40 klien yang ditampilkan.
- Deep link: `onOpenFor(moduleId, clientId, period?)` di Overview memakai `scopePatchForLink`; periode Overview ikut terbawa karena sudah global.
- `sw.js` cache v18 → v19.

## 2. KEPUTUSAN PRODUK / TEMUAN YANG BELUM DIPUTUSKAN
1. **Tidak ada tabel outlet di Postgres.** Hierarki Company→Brand→Outlet hanya di KV global (`trace-companies/brands/outlets`) dan tertaut ke id klien LAMA (`klienId` base36), sedangkan klien sekarang UUID dari `trace_clients` (migration 042, tanpa migrasi dari KV). Akibatnya saran outlet untuk klien baru KOSONG sampai ada tabel `trace_outlets` (client_id, nama, brand) + RPC baca/tulis — perlu keputusan dan migration (additive). Sementara: pengguna bisa mengetik id outlet; UI menampilkan petunjuknya.
2. **Outlet TIDAK memfilter analitik finance** (Diagnosis/CashFlow/Health/FinanceEntry). Belum jelas apakah baris finance tingkat klien (tanpa outlet) ikut saat satu outlet dipilih. Karena itu chip outlet tidak dipasang di modul-modul itu.
3. `trace_upsert_fnb_target_plan` memakai `p_outlet_id uuid` (RPC lain `text`). FnbTargetPlanner memblokir simpan bila outlet bukan UUID dengan pesan jelas; plan tingkat klien tetap bisa disimpan.
4. AccountingView "kunci periode" SENGAJA tidak mengikuti periode global (aksi tak bisa dibatalkan; risiko salah kunci). TaxView tidak berklien dan tidak diubah. Sales/Inventory/Recipe/SOP/Team/COA tidak memakai periode/outlet global.

## 3. Sisa pekerjaan (urutan resmi v2 §6a, diperbarui)
1. Uji RPC 053 ke Supabase live (belum, dari v3) + uji manual alur scope di aplikasi asli (ganti klien → outlet ter-reset; link `?client=&period=` dibuka ulang; klien basi).
2. Putuskan #1 dan #2 di atas (tabel outlet; aturan baris tanpa outlet).
3. **Phase 2 (lanjutan)**: komponen reusable (TracePageHeader, TraceCard, TraceEmptyState…) dan migrasi 30 view ke gaya baru — belum disentuh.
4. Sisa 5c (asesmen manual tersimpan, sinyal inventory/POS/sosial, AR/AP nyata), lalu Phase 6+8, Acquisition→Klien, Phase 9–11.
5. Sebelum data klien nyata banyak: Phase 17–20 (peran, audit log, RLS live, code-split, regresi).

## 4. Catatan kejujuran
- Perilaku aturan scope DIUJI (test_scope.mjs: 42 asersi perilaku, bukan pencocokan string); integrasi React (chip, sinkron URL, efek pengisian awal form) hanya lolos typecheck/build, BELUM diuji di browser.
- Tes `test_client_scope_static.mjs` diubah (bukan dilonggarkan): kini memeriksa bahwa store memakai `writeScope` + `useSyncExternalStore` dan pembungkus klien lewat reducer.
- Tidak ada data/migration/RLS dihapus; tidak ada migration baru sesi ini; Node/npm tidak diturunkan; tidak ada dummy data di kode produksi.
- `_diagnostic-manifest.json` dan `dist/` digenerate ulang oleh build.

## 5. PROMPT UNTUK CLAUDE BERIKUTNYA
Kamu melanjutkan aplikasi INTERNAL "TRACE Consultant OS". BACA: `HANDOFF_NEXT_PHASES_v4.md` (ini), lalu v3, v2 (keputusan desain §2, konteks produk §5b–5d), v1. Kode = ZIP `..._v6.zip`. Langkah pertama WAJIB: `npm ci && npm run typecheck:react && npm run test:deterministic && npm run build:react` di environment sendiri sebelum mengklaim apa pun; jika tidak ada jaringan, katakan terus terang.
Prioritas: (a) minta user menjalankan migration 053 lalu uji "Jadikan tugas" end-to-end; (b) tanyakan keputusan §2 poin 1–2; (c) lanjut Phase 2 (komponen reusable) atau sisa 5c sesuai arahan user.
Batasan: jangan rewrite besar; jangan hapus data/migration/RLS; jangan turunkan Node 22.22.2 / npm 10.9.2; jangan dummy data di kode produksi; nilai kosong = "Data belum cukup", bukan 0; jangan klaim PASS tanpa menjalankan tes; kirim ZIP baru (v7, …) + HANDOFF baru (tambah, jangan hapus) tiap sesi selesai. Semua tes `tests_core/*.mjs` harus lulus. Bahasa: Indonesia.
