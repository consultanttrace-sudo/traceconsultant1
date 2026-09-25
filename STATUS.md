# STATUS.md — TRACE Consultant OS

**Ini SATU-SATUNYA file status yang dipelihara.**
Jangan buat `PHASE_*.md`, `ROOT_CAUSE_AUDIT_*.md`, `AUDIT_*_baru.md`, `HANDOFF_NEXT_PHASES_v*.md`,
`CHANGES_v*.md` di dalam repo, atau laporan kerja markdown baru lainnya — update file ini dan
`UI_WIRING_BACKLOG.md` saja, ditimpa (overwrite bagian yang relevan), bukan ditambah file baru.
Ringkasan perubahan per sesi tetap boleh disampaikan ke user sebagai pesan/file terpisah
di luar repo (tidak di-zip) — itu bukan pelanggaran aturan ini.

**Rantai `HANDOFF_NEXT_PHASES_v*.md` (v1–v6) resmi DIHENTIKAN per 2026-09-21** (keputusan
user). File-filenya TIDAK dihapus (nilai historis: keputusan desain, alasan produk) dan sudah
diberi banner "DIHENTIKAN" di baris pertama masing-masing — tapi jangan buat `_v7.md` dst.
Semua status terkini mulai sekarang HANYA di sini.

Snapshot sumber terakhir yang benar-benar diverifikasi end-to-end: ZIP
`traceconsultant1-main_PHASE2_v18_cleaned.zip` (v16 → v17 → v18, lihat "Gap v17→v18 DITUTUP" di
bawah untuk kapan/bagaimana v18 genuinely dikonfirmasi). Catatan: bagian-bagian di bawah yang
menyebut "v14" ditulis sebelum v15/v16/v17/v18; perbedaan isi baris-per-baris v14→v18 TIDAK
pernah di-diff manual — yang diverifikasi adalah HASIL AKHIR v18 (typecheck/test/build genuinely
PASS, lihat "Terverifikasi PASS"), bukan histori perubahan tiap versi. Riwayat sebelumnya:

**Sesi 2026-09-23 (dari `traceconsultant1-main_PHASE2_v18_verified.zip`) — 3 keputusan dieksekusi:**
- `core/business.ts` **dihapus** (dikonfirmasi 0 caller aplikasi). Koreksi atas premis awal: 0
  caller aplikasi TIDAK berarti 0 caller sama sekali — ada 1 unit test murni,
  `tests_core/test_business_core.mjs`, yang jadi rusak begitu file dihapus. Test itu dihapus juga
  (tidak ada lagi yang diuji) dan dilepas dari chain `test:deterministic` di `package.json`.
  Barrel `src/core/index.ts` juga dibersihkan (`export * from './business.js'` dihapus).
- `core/acquisition.ts` — `qualifyLead` dijadikan **sinyal tambahan (additive)**, bukan
  dikonsumsi ulang oleh `core/acquisition.ts` sendiri: seluruh modul ini (bukan cuma
  `qualifyLead`) ternyata 0 caller di React app manapun. Lead scoring produksi sesungguhnya
  hidup di sub-app legacy terpisah, dan sub-app itu punya **dua kopi yang sudah divergen**:
  `react-app/public/acquisition/index.html` (yang genuinely di-serve iframe-nya, sudah punya fix
  server-proxy AI) vs `features/acquisition_os/index.html` (basi, masih ada dead AI stub lama).
  Ditambahkan `computeCoreFitSignal()` — replikasi 1:1 logika `qualifyLead` — HANYA ke kopi yang
  di-serve, ditampilkan sebagai blok baru "Sinyal Fit F&B (Rule-Based)" di detail panel lead.
  Tidak menyentuh `fit_score`/`priority`/`acquisition_stage`/sorting/CSV export yang sudah ada.
  Kopi basi di `features/acquisition_os/` TIDAK disentuh — divergensinya sudah ada sebelum sesi
  ini, bukan hasil perubahan ini; jadi kalau memang harus disamakan, itu keputusan terpisah.
- `core/reporting.ts` — **wired ke UI** (sebelumnya 0 tombol) di `BusinessDiagnosis.tsx`: tombol
  "Unduh CSV" (pakai `reportToCSV` yang sudah ada) dan "Unduh Excel (.xlsx)" (baru, file baru
  `src/core/consultingReportExcel.ts`, multi-sheet Ringkasan/Finance/KPI/Evidence, pakai `xlsx`
  — pola sama seperti `exportFinanceExcel` di `financeReport.ts`, dikeluarkan dari
  `tsconfig.json` core karena browser-only sama seperti `financeReport.ts`/
  `fileIntakeAdapters.ts`). `ConsultingReport` dibangun dari data asli (finance comparison +
  diagnosis yang sudah dihitung view ini) plus KPI organization-level yang di-fetch nyata lewat
  RPC `trace_list_kpi_values` (pola sama dengan `KpiTrackingView.tsx`) → `calculateKPIs`
  (mesin sama, bukan duplikat). KPI kosong dilabeli "belum tercatat", bukan dianggap 0.
- **Terverifikasi PASS genuinely dijalankan sesi ini:** `npm run typecheck:core` (0 error),
  `npx tsc -p tsconfig.react.json` (0 error), `npm run test:deterministic` (**65 file** — 66
  dikurangi `test_business_core.mjs` yang dihapus — SEMUA PASS, termasuk
  `react-truthfulness.mjs` yang tadinya sempat gagal karena refactor `BusinessDiagnosis.tsx`
  menghapus substring literal yang dituntut guard-nya; sudah diperbaiki dengan mengembalikan
  ekspresi literalnya, bukan mengedit test), `npm run build:react`, `npm run build:site`,
  `npm run release:preflight` (`node_runtime` & `dependency_policy` `ok:true` keduanya).
`TRACE_v72_21_UI_COMPLETE_2026-09-14.zip` (snapshot lama yang jadi dasar bagian-bagian di
bawah sebelum diperbarui sesi ini).

**Gap v17→v18 DITUTUP (sesi lanjutan 2026-09-22, sandbox berbeda dengan akses npm registry):**
sesi sebelumnya tidak bisa `npm ci` (403, sandbox tanpa akses registry) jadi v17→v18 cuma dibaca
statis. Sesi ini menjalankan `npm ci` dari `traceconsultant1-main_PHASE2_v18_cleaned.zip` (v18
pasca-cleanup sesi sebelumnya) sampai tuntas: `npm ci` → `typecheck:react` (0 error) →
`test:deterministic` (66 file, SEMUA PASS) → `build:react` → `build:site` →
`release:preflight` (`node_runtime` & `dependency_policy` `ok:true`) — genuinely dijalankan,
lihat "Terverifikasi PASS" di bawah. Nol regresi ditemukan dari v16 ke v18. Tambahan sesi ini:
audit statis 4 tab yang namanya cocok modul core (`Acquisition/ActionPlan/Marketing/Business
Twin` vs `acquisition.ts/actionPlan.ts/marketing.ts/business.ts`) — hasil lengkap ada di
`UI_WIRING_BACKLOG.md`, ringkasan di bagian "Masih PARTIAL" di bawah.

**Kebersihan repo (sesi ini, di luar isi kode):** 96 file `.md` audit/phase/handoff historis
di root (semua yang bukan `STATUS.md`/`UI_WIRING_BACKLOG.md`/`README.md`/beberapa panduan
setup aktif) dipindah ke `docs/archive/` — tidak dihapus, hanya dirapikan sesuai kebijakan di
atas ("file-filenya TIDAK dihapus"). `dist/` (build output, 6.8MB) dan `.core-test-dist/`
dihapus dari snapshot ini dan ditambahkan ke `.gitignore` — keduanya dibangun ulang otomatis
oleh `npm run build:site` (lihat `netlify.toml`), jadi tidak perlu ikut di-commit/zip.

## Verdict saat ini
**RELEASE CANDIDATE — belum production-verified.** Build/typecheck/test lokal lolos di
environment yang benar (Node sesuai `engines`), tapi Supabase RLS/RPC baru terhadap database
live, deploy Netlify sungguhan, dan browser E2E/visual belum pernah dijalankan terhadap
project production nyata dari sandbox manapun sejauh ini.

## Arsitektur saat ini (berubah dari snapshot 2026-09-14)
- **`src/app/main.tsx` sudah dipecah** (2026-09-17) dari 2242 baris jadi 159 baris (App(),
  array `nav`, import) + `src/app/views/_shared.tsx` (infra lintas-view: `TraceAuthGate`,
  `TraceErrorBoundary`, `getReactSupabase`, `useTraceCollections`, `loadTraceCollections`,
  `asArray`, `money`, `inputStyle`, dll) + 25 file `src/app/views/<Nama>.tsx` satu per tab.
  Verifikasi programatik refactor ini (byte-diff, tsc error count identik, bundle size
  hampir sama) — detail metode ada di histori git/HANDOFF v-lama kalau perlu dicek ulang.
- **Scope klien/periode/outlet terpusat** lewat `src/core/scope.ts` (reducer murni, dites di
  `tests_core/test_scope.mjs`) + `src/app/scopeStore.ts` (state React + mirror URL
  `?client=&period=&outlet=`) + `src/app/clientScope.ts` (wrapper tipis, dipertahankan
  supaya view lama tidak perlu ganti import) + `src/app/components/ScopeSelectors.tsx`
  (komponen dropdown/selector siap pakai). Ganti klien otomatis reset outlet (satu outlet
  milik satu klien). ArsitekturNYA LEBIH BAIK dari draft awal (dua store terpisah
  `clientScope.ts`/`periodScope.ts` tanpa reducer) — sudah dikonsolidasi di sesi antara
  2026-09-21 pagi dan ZIP v14, sesi persisnya tidak diketahui (tidak ada HANDOFF yang
  mencatatnya).
- **Design system**: `src/app/components/TraceUI.tsx` (komponen `TracePageHeader`, dst) +
  `src/app/components/TraceShell.tsx`. **Koreksi sesi ini (cek kode langsung):**
  `DataIntake.tsx` TIDAK lagi dikecualikan — sudah memakai `TracePageHeader` lewat slot
  `extra` yang memang dibuat untuk kasusnya (banner recovery kondisional), jadi hitungannya
  bukan "22 dari 23" tapi seluruh view utama sudah pakai `TracePageHeader`, KECUALI yang
  sengaja tidak butuh (lihat poin Fitur di bawah untuk daftar & alasannya per view).

## Terverifikasi PASS (2026-09-22, dijalankan sungguhan di sandbox, Node v22.22.2 / npm 10.9.7 —
dikonfirmasi ulang genuinely terhadap ZIP v18 di sesi lanjutan yang sandbox-nya punya akses npm registry)
```
npm ci                     → PASS
npm run typecheck:react    → PASS, 0 error
npm run test:deterministic → PASS — 66 file test dalam rantai (63 + 3 test sinyal jalur kerja baru)
npm run build:react        → PASS (bundle utama masih besar, belum code-split — Phase 18)
npm run build:site         → PASS
npm run release:preflight  → PASS (node_runtime + dependency_policy, ok:true keduanya)
(Angka 282 packages / 3 kerentanan dari sesi 2026-09-21 tidak diukur ulang sesi ini.)
```

## Cakupan tes — RAPIH per 2026-09-21 (sebelumnya cuma 26/70 file jadi gerbang otomatis)
Temuan sesi sebelumnya: dari 70 file `.mjs` di `tests_core/`, cuma 26 yang jalan lewat
`npm run test:deterministic`. Sudah dibereskan sesi ini:
- **37 file yang PASS saat dicek manual** (mis. `test_marketing.mjs`, `test_content.mjs`,
  `test_business_core.mjs`, `test_intelligence_core.mjs`, dll — modul core yang tidak wired
  ke UI tapi logikanya tetap dites) sekarang **resmi masuk rantai `test:deterministic`**.
- **7 file yang tadinya GAGAL diinvestigasi satu per satu — SEMUANYA ternyata basi karena
  jalur file, BUKAN regresi sungguhan**: semua merujuk `src/app/main.tsx` untuk string yang
  sudah pindah ke `src/app/views/<Nama>.tsx` sejak refactor 2026-09-17 (mis.
  `test_diagnostic_silent_ui.mjs` cari teks yang sekarang ada di `SettingsCenter.tsx`,
  `test_phase9_audit_hardening.mjs`/`v58-production-evidence.mjs` cari teks yang sekarang di
  `DataIntake.tsx`, `test_v72_full_repairs.mjs` cari RPC acquisition yang sekarang di
  `_shared.tsx`, `test_total_audit_v72_11.mjs` cari nama fungsi komponen yang sekarang
  tersebar di file per-view) — SATU pengecualian nyata: `test_release_environment_policy.mjs`
  menuntut file `.nvmrc` dan `.node-version` yang memang belum pernah dibuat; kedua file itu
  sudah ditambahkan (isi `22.22.2`, sama seperti `engines` di `package.json` dan
  `NODE_VERSION` di `netlify.toml`). Semua 7 file diperbaiki (bukan dihapus) lalu
  dikonfirmasi PASS, dan sekarang juga masuk rantai `test:deterministic`.
- **Hasil akhir**: `npm run test:deterministic` sekarang menjalankan **63 file test**
  (26 lama + 37 yang baru diwire), genuinely PASS semua, dijalankan sungguhan sesi ini.
  Sisa 7 file tidak masuk hitungan: `_react_source.mjs` (helper, bukan tes berdiri sendiri)
  — itu satu-satunya file `tests_core/*.mjs` yang sengaja tidak dipanggil langsung.
- **Nol regresi sungguhan ditemukan** dari proses investigasi 7 file yang gagal — semua
  fitur yang dicek tiap file masih benar-benar ada dan berfungsi di kode v14, cuma lokasi
  filenya yang berubah karena refactor lama.

## Fitur yang sudah selesai (state per ZIP v16 + sesi 2026-09-22)
1. **Jalur kerja → tugas nyata** (`src/core/workstreams.ts::taskDraftFromFinding`,
   RPC `trace_create_workstream_task` di `supabase/migrations/053_workstream_task_creation_v72.sql`,
   tombol "Jadikan tugas" di Overview). Diuji lewat `test_workstream_tasks.mjs`.
   **BELUM diverifikasi ke Supabase live** — RPC 053 belum pernah benar-benar dipanggil ke
   database sungguhan dari sandbox manapun.
2. **Klien/periode/outlet global** (lihat "Arsitektur" di atas). Migration
   `supabase/migrations/054_trace_outlets.sql` (tabel `trace_outlets`) sudah ada di kode.
3. **Outlet memfilter analitik finance** — `filterFinanceRecordsByOutlet()` di
   `src/core/finance.ts` (diuji, 4 assertion di `finance.test.mjs`), dipakai di
   `CashFlowView`, `BusinessDiagnosis`, `BusinessHealthView` (hanya bagian finance-nya —
   POS/inventory/sales di Business Health **belum** difilter per outlet, dicatat eksplisit
   di UI), dan `FinanceEntry` (dashboard/ringkasan/laba-rugi/export; histori record mentah
   sengaja TIDAK difilter supaya konsultan bisa edit record outlet manapun dari satu layar).
   Aturan: outlet kosong = semua record ikut (tak berubah); outlet dipilih = HANYA record
   yang persis bertanda outlet itu (record level-klien tanpa outlet tidak ikut ke outlet
   manapun, untuk mencegah dobel-hitung). **BELUM diverifikasi ke Supabase live.**
4. **Migrasi header** ke `TracePageHeader` (`src/app/components/TraceUI.tsx`). **Koreksi sesi
   ini** — klaim lama "22 dari 23, DataIntake dikecualikan" sudah basi (lihat "Arsitektur").
   Klaim lama "body view BELUM dimigrasi kecuali KpiTrackingView" JUGA basi: grep `TraceCard`
   di `src/app/views/*.tsx` sesi ini menunjukkan body sudah dimigrasi secara substansial di
   ~20 view (mis. `AccountingView`, `FinanceEntry`, `OpexDetailView`, `FnbTargetPlanner`,
   `BusinessHealthView`, `StockOpnameView`, `MarketingView`, `SalesView`, `PayrollView`, dst
   — bukan cuma `KpiTrackingView`). Belum dicek satu per satu: `AICenterView`,
   `BusinessDiagnosis`, `BusinessTwinView`, `ClientsView`, `SettingsCenter` — nol pemakaian
   `TraceCard`/`TracePageHeader` di grep, tapi belum diverifikasi apakah itu gap sungguhan
   atau (seperti `DataRecovery`/`AcquisitionView`/`OverviewLive`) sudah punya treatment
   custom yang sengaja beda. Perlu dicek satu-satu, idealnya visual di browser.
   **BELUM diverifikasi visual di browser asli** — lolos tipe & build saja, sesi ini juga
   cuma baca kode (grep/view), tidak ada browser nyata dari sandbox manapun.

5. **Sinyal otomatis jalur kerja (sisa 5c: inventory, POS, sosial, AR/AP)**
   - Core: `src/core/workstreamSignals.ts` — `inventorySignal`, `posSignal`, `socialSignal`,
     `cashSignal`; adapter baris mentah `signalsFromRows` (kolom snake_case dari
     `trace_read_client_dataset`), `signalWindow` (jendela periode), `failedSignals`;
     `SIGNAL_RESOURCES` (10 resource) dan ambang di `SIGNAL_THRESHOLDS`. `diagnoseClient(row,
     records, signals?)` di `workstreams.ts` menerima sinyal opsional (tanpa sinyal = perilaku lama).
   - Wiring: `src/app/portfolio.tsx` memuat 10 resource itu lewat `loadTraceCollections(...,
     clientId)` HANYA saat satu klien dipilih (bukan untuk semua klien), lalu menghitung sinyal
     dengan periode global. Kartu "Jalur Kerja" di Overview tidak diubah — ia sudah menampilkan
     status flagged/ok/nodata/manual, jadi hasil sinyal muncul lewat findings yang sama.
     `TraceResource` di `_shared.tsx` ditambah `social_accounts` dan `content_items`
     (sudah ada di `trace-data.js` dan `trace_read_client_dataset`, migration 033).
   - Aturan perilaku: sinyal `nodata` = jalur tetap "manual" dengan alasan spesifik (tidak pernah
     dianggap sehat); resource `unavailable` (timeout/terlalu besar) ≠ kosong → nodata, dengan nama
     resource di alasan; gagal muat total → `failedSignals` (semua manual + pesan error); `cash`
     (AR/AP) hanya bisa menaikkan jalur `profit` atau menambah alasan; klien tanpa data finance
     terbaca tidak pernah berstatus "Stabil" walau sinyal operasional ok (`summarizePlan`).
   - Periode: POS & inventory mengikuti periode global (bulan itu vs bulan sebelumnya; tanpa periode
     = 30 hari terakhir vs 30 hari sebelumnya; data basi hanya dihukum bila periode = bulan berjalan).
     Sosial dan AR/AP selalu "per hari ini" — tidak mengikuti periode.
   - Tes: `test_workstream_signals.mjs`, `test_workstream_signal_rows.mjs`,
     `test_workstream_signals_wiring_static.mjs` (mengecek tiap resource sinyal terdaftar di
     `TraceResource`, `RESOURCES` trace-data.js, dan migration 033; sinyal per-klien; anti respons basi).
     Dicek gagal bila logika dirusak (6 mutasi manual di `dist/`, dipulihkan).
   - **BELUM diverifikasi**: query 10 resource terhadap Supabase live (RPC `trace_read_client_dataset`
     hanya dibaca dari SQL, tidak pernah dipanggil), tampilan kartu Jalur Kerja di browser, dan
     performa (payload dataset satu klien bisa besar; batas `value_too_large` ditangani sebagai nodata).
   - **Ambang BELUM dikonfirmasi user** (default sementara dipakai atas persetujuan "lanjutkan"):
     inventory HIGH_VARIANCE ≥30% item terukur = tinggi; POS data basi >7 hari; sosial 0 posting/30 hari =
     sedang, <4 = rendah, sinkron harus ≤7 hari; piutang >60 hari ≥30% total = sedang, ≥50% atau >90 hari
     ≥25% = tinggi; utang supplier telat >30 hari ≥30% = sedang.
   - Yang TETAP manual: rapi/tidaknya feed, daya tarik konten, branding. Asesmen manual tersimpan
     (feed rapi, brand dikenal) BELUM dikerjakan — butuh keputusan penyimpanan (client KV vs tabel)
     dan Supabase live.

## Wiring UI ke src/core/* (lihat UI_WIRING_BACKLOG.md untuk detail per-modul)
55 modul di `src/core/`, 43 di antaranya diimpor dari `src/app/` (naik dari 35/50 di snapshot
lama; `workstreamSignals` baru dan sudah diimpor `portfolio.tsx`). 12 modul nol import sama sekali: `acquisition, actionPlan,
business, calculation, canonical, chartRender, content, evidence, index, intelligence,
marketing, reporting`
(`index.ts` adalah barrel file, bukan gap). Dead-import lama (`aiDiagnostic.diagnoseApplication`,
`aiSecurity.analyzeSecurity`, `collaboration.transitionTask`, `sop.nextSOPStep`,
`sop.validateSOP`) SUDAH DIBERESKAN di kode v14. `inventoryIntelligence.ts` masih hanya
dipakai di Business Health, bukan di tab Inventory sendiri (tab Inventory murni CRUD RPC).

## Masih PARTIAL / butuh keputusan desain (belum dicek ulang sesi ini, dibawa dari snapshot lama)
- **Client CRUD**: belum ada RPC/migration insert/update/delete `trace-clients` dengan RLS scope.
- **Stock opname/reconciliation Inventory**: belum ada tabel/RPC selisih stok fisik vs sistem
  (konsisten dengan `inventoryIntelligence.ts` yang tidak dipakai di tab Inventory).
- **Labor & OPEX detail**: masih level kategori record.
- **Marketing/Action Plan/Acquisition/Business Twin vs modul core bernama sama — SUDAH
  DIAUDIT sesi 2026-09-22** (rincian di `UI_WIRING_BACKLOG.md`): `ActionPlanView`/`MarketingView`
  BUKAN gap (RPC/SQL — migration 050 & 051 — menegakkan aturan yang sama persis dengan
  `actionPlan.ts`/`marketing.ts`, dicek baris-per-baris; kedua modul core itu spec-mirror yang
  hanya dipanggil oleh test-nya sendiri). `BusinessTwinView` vs `business.ts`: `business.ts`
  dead code terkonfirmasi (nol import di mana pun) — sisa hierarki Client→Company→Brand→Outlet
  lama yang memang ditinggalkan (lihat migration 054 di atas); aman dihapus kapan user minta.
  **`AcquisitionView` vs `acquisition.ts` — KOREKSI dari temuan sesi sebelumnya (rincian &
  bukti lengkap di `UI_WIRING_BACKLOG.md`).** Klaim sebelumnya "data lead di localStorage
  browser, bukan Supabase" SALAH — `window.TRACE_ACQUISITION_BRIDGE` sudah menghubungkan tool
  ke Supabase sungguhan (RPC `trace_read_global_kv`/`trace_upsert_global_kv`, key
  `trace_os::acquisitionLeads`, plus RPC job-tracking discovery & `trace_create_client` asli
  untuk convert-lead-to-client) — dipasang otomatis saat app boot (`main.tsx`). `localStorage`
  cuma fallback kalau belum ada sesi. Tool ini juga sudah punya dedup (`recordsLikelySame`) dan
  scoring (`computeOverallScore`, dari analisis AI/Instagram) sendiri yang sudah jalan — bukan
  stub. Yang MASIH benar: `core/acquisition.ts` (`qualifyLead`/`deduplicateLeads`/
  `buildPipelineMetrics`) nol pemanggil run-time — tapi ini kode tidak terpakai yang isinya
  BEDA dimensi (fit bisnis F&B vs peluang konten AI), bukan tool yang "lepas dari Supabase".
  Keputusan yang perlu user: pakai sebagai sinyal tambahan (additive), atau hapus sebagai dead
  code seperti `business.ts`.

## External blockers (bukan bug kode)
1. Supabase migrations/RLS/tenant-isolation & RPC baru (053, 054) belum dites terhadap
   project production nyata. Sama untuk pemuatan 10 resource sinyal jalur kerja per klien (fetch
   `/api/trace-data?resources=...&client_id=...` dari Overview) — belum pernah dipanggil sungguhan.
2. Real Netlify deployment smoke test belum dijalankan.
3. Environment Node harus `>=22.22.2 <23` sesuai `engines` (terverifikasi genuinely PASS
   sesi ini, lihat "Terverifikasi PASS" di atas).
4. Browser E2E/visual (termasuk verifikasi migrasi header TraceUI 22 view, dan render
   `screenshot-all-tabs.mjs`) belum pernah dijalankan dari sandbox manapun — sandbox
   Claude tidak punya browser sungguhan.

## Sisa pekerjaan — urutan (dibawa dari rantai HANDOFF lama, masih berlaku)
1. Uji RPC 053 + 054 ke Supabase live, lalu uji manual alur scope (ganti klien → outlet
   reset, filter outlet di 4 modul finance, link `?client=&period=&outlet=` dibuka ulang).
   Tambahan (PC): pilih satu klien di Overview → kartu Jalur Kerja harus memuat sinyal tanpa error,
   klien tanpa data POS/stok/sosial/AR-AP harus tampil "perlu asesmen langsung" (bukan "aman"),
   ganti klien cepat tidak boleh menampilkan sinyal klien sebelumnya.
2. Verifikasi visual browser asli untuk 22 view yang sudah migrasi TraceUI header.
3. Lanjutan Phase 2: migrasi body view ke `TraceCard`/`TraceEmptyState` (baru
   `KpiTrackingView` yang disentuh di luar header).
4. Sisa 5c: sinyal inventory/POS/sosial + cashflow AR/AP nyata SELESAI dan sudah di-wire ke Overview
   untuk klien terpilih (Fitur poin 5; belum diverifikasi live/visual). Tersisa: (a) konfirmasi ambang ke
   user, (b) asesmen manual tersimpan (butuh keputusan penyimpanan + Supabase live), (c) sinyal untuk
   tampilan semua klien (rollup) — sengaja belum, karena memuat semua klien menambah beban query.
   Lalu Phase 6+8 (Business Health lengkap + Finance Revenue→Net Profit),
   Acquisition→Klien, Phase 9–11.
5. Sebelum onboarding data klien nyata banyak: Phase 17–20 (peran/RLS live, audit log,
   code-split, regresi visual penuh).
6. **Dikoreksi (2026-09-22):** `AcquisitionView`/`trace-acquisition-os.html` TERNYATA sudah
   tersambung ke Supabase (bukan gap seperti klaim sesi sebelumnya) — lihat "Masih PARTIAL" di
   atas. Yang masih perlu jawaban user: apakah `core/acquisition.ts` (`qualifyLead`/
   `buildPipelineMetrics`) dipakai sebagai sinyal fit-bisnis TAMBAHAN, atau dihapus sebagai dead
   code.

## Koreksi kesalahan sesi ini (2026-09-22, putaran lanjutan setelah user minta migrasi)
- User memilih opsi "migrasikan AcquisitionView ke Supabase" berdasarkan temuan sesi sebelumnya
  yang menyatakan lead tersimpan di localStorage, bukan Supabase — klaim itu SALAH, ditemukan
  saat mulai investigasi implementasi. `window.TRACE_ACQUISITION_BRIDGE` (`_shared.tsx`,
  dipasang `main.tsx`) sudah menyambungkan tool ke RPC Supabase asli sejak sebelum sesi ini;
  `localStorage` cuma fallback tanpa sesi. Root cause kesalahan: grep awal cuma cek
  `core/acquisition.ts` (modul core) diimpor `src/app/` atau tidak (memang tidak) — belum cek
  apakah `trace-acquisition-os.html` (file terpisah, bukan modul core) punya jalur Supabase
  sendiri lewat bridge. Kesimpulan "localStorage bukan Supabase" ditarik dari itu tanpa
  verifikasi langsung ke file HTML-nya.
- Dikoreksi SEBELUM mengerjakan "migrasi" apa pun yang berbasis premis salah tadi — tidak ada
  perubahan destruktif/berisiko yang sempat dibuat berdasarkan kesimpulan salah tersebut.
- Rincian koreksi lengkap ada di "Masih PARTIAL" di atas dan `UI_WIRING_BACKLOG.md`.

## Catatan kejujuran sesi lanjutan 2026-09-22 (sandbox dengan akses npm registry)
- Input: `traceconsultant1-main_PHASE2_v18_cleaned.zip` (hasil cleanup sesi sebelumnya).
- Dijalankan genuinely, bukan disalin dari klaim sesi lain: `npm ci` (282 packages, 3
  kerentanan — sama seperti angka lama, tidak diukur ulang detailnya), `typecheck:react`
  (0 error), `test:deterministic` (66 file, semua PASS, output lengkap dilihat baris demi
  baris), `build:react`, `build:site`, `release:preflight` (kedua check `ok:true`).
- Kerja lain sesi ini murni pembacaan kode statis (tidak ada perubahan ke `src/`, tidak ada
  migration baru, tidak ada data dihapus): audit 4 tab (`Acquisition/ActionPlan/Marketing/
  BusinessTwin`) vs modul core bernama sama — metodologi & bukti lengkap (baris file, baris SQL
  yang dibandingkan) ada di `UI_WIRING_BACKLOG.md`. Satu gap arsitektur nyata ditemukan
  (`acquisition.ts` vs tool legacy `trace-acquisition-os.html`) — sengaja TIDAK diperbaiki
  sepihak sesi ini karena butuh keputusan produk dari user (migrasi vs pisahkan tool), bukan
  bug yang bisa "diperbaiki" tanpa mengubah arsitektur.
- Tidak ada akses Supabase/Netlify/browser sesi ini juga (external blockers di atas masih
  berlaku sama seperti sesi-sesi sebelumnya) — tidak diklaim diverifikasi.
- File yang diubah sesi ini: HANYA `STATUS.md` dan `UI_WIRING_BACKLOG.md` (sesuai aturan file
  ini sendiri di baris paling atas — tidak ada file laporan baru dibuat).

## Catatan kejujuran sesi 2026-09-22
- Putaran 2 (wiring): `portfolio.tsx`, `_shared.tsx` (tipe), `workstreamSignals.ts` (adapter), `workstreams.ts`
  (perbaikan `summarizePlan`), 2 test baru + `package.json`. Tidak ada migration baru; SQL 033 hanya dibaca.
  Bug edge-case yang saya temukan sendiri saat merancang tes: klien dengan finance gagal dimuat + sinyal
  operasional ok akan tampil "Stabil" — diperbaiki dan diuji. Enam mutasi manual semuanya membuat tes gagal.
- Yang dikerjakan: 1 file core baru (`workstreamSignals.ts`), `workstreams.ts` diubah (tipe sinyal
  + parameter opsional), 1 test baru + wiring di `package.json`, dan file ini + `UI_WIRING_BACKLOG.md`.
  Tidak ada perubahan `src/app/`, tidak ada migration baru, tidak ada data/RLS dihapus.
- Satu kesalahan ekspektasi di test saya sendiri (hitungan hari POS 21 vs 20, pembulatan ke bawah)
  ditemukan saat pertama dijalankan dan diperbaiki di test, bukan di kode.
- Tes sinyal diuji dengan mutasi manual (dua mutasi di `dist/` sementara, dipulihkan): keduanya
  membuat test gagal. Ini bukan pengganti uji dengan data klien nyata.
- Semua sinyal diuji dengan data sintetis di dalam test (bukan data dummy di aplikasi).
- Node 22.22.2 / npm 10.9.x tidak diturunkan.

## Catatan kejujuran sesi 2026-09-21
- Semua angka "Terverifikasi PASS" di atas genuinely dijalankan di sandbox ini hari ini,
  bukan disalin dari klaim sesi sebelumnya.
- Temuan "cuma 26 dari 70 test file yang jadi gerbang" ditemukan sesi sebelumnya, LALU
  dibereskan sesi ini: 37 file diwire ke `test:deterministic` apa adanya (sudah PASS), 7
  file yang gagal diinvestigasi SATU PER SATU sebelum diperbaiki (bukan langsung
  dihapus/diskip) — hasilnya 6 dari 7 murni jalur file basi peninggalan refactor
  2026-09-17, 1 file (`test_release_environment_policy.mjs`) menunjukkan gap nyata
  (`.nvmrc`/`.node-version` belum ada) yang sudah ditutup. Nol regresi produk sungguhan
  ditemukan dari proses ini.
- Tidak ada data/migration/RLS dihapus. Tidak ada migration baru ditulis sesi ini. File
  kode yang diubah sesi ini murni 8 file test (7 diperbaiki jalurnya + `package.json`
  untuk wiring) plus `.nvmrc`/`.node-version` baru — tidak ada perubahan ke `src/` produksi.
- Node 22.22.2 / npm 10.9.x tidak diturunkan.
- Semua 6 perintah verifikasi di "Terverifikasi PASS" (termasuk `build:site` dan
  `release:preflight`) dijalankan ulang dan genuinely PASS sesi ini — tidak ada yang
  dibiarkan tidak terkonfirmasi.
