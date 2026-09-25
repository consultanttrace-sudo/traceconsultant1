# TRACE Consultant OS — PHASE 0 Total Audit + Baseline
Tanggal: 2026-09-21 · Sumber: ZIP `traceconsultant1-main` (v3.2.4-total-audit-hardening-v72.11) · Runtime: Node v22.22.2 (sesuai lock), npm 10.9.7

Status: PASS / PARTIAL / FAIL / BLOCKED / NOT VERIFIED. Tidak ada file di repo yang diubah pada Phase 0.

## 1. Baseline yang benar-benar dijalankan

| Check | Hasil | Catatan |
|---|---|---|
| `verify:runtime` | PASS | Node 22.22.2 terpenuhi. npm aktual 10.9.7 (range `<11` OK, tapi `packageManager` pin 10.9.2 tidak diverifikasi oleh script) |
| `verify:dependencies` | **FAIL** | `exceljs ^4.4.0` dan `playwright ^1.63.0` floating; policy script menolak. Lockfile sendiri lengkap (333 entry, 0 missing) |
| `typecheck:core` | PASS | |
| `typecheck:react` | PASS | |
| `tsc -p tsconfig.core-platform.json` + `test_business_health_platform` | PASS | |
| `build:site` (Vite, production) | PASS | Chunk `index` 1.19 MB (gzip 337 KB), exceljs 930 KB, three 520 KB: belum code-split |
| `test:deterministic` (chain) | **FAIL** | Berhenti di tes pertama. Dijalankan satu-satu: 12 PASS, 6 FAIL (lihat §2) |
| `tests_real/*` (RLS live, auth, opex) | NOT VERIFIED | Butuh Supabase live/kredensial; tidak tersedia |

Klaim "PASS" di dokumen lama (STATUS.md, V72_FINAL_AUDIT, dst.) tidak dipakai. Tidak diverifikasi ulang satu per satu → NOT VERIFIED.

## 2. Enam tes gagal: akar masalah

Lima dari enam gagal karena tes membaca `src/app/main.tsx`, sementara UI sudah dipecah ke `src/app/views/*` (main.tsx kini 78 baris). Stringnya masih ada di view; tes yang stale, bukan fitur hilang. [Pasti untuk 5 ini, tiap string ditemukan via grep]

| Tes | String yang dicari | Lokasi aktual |
|---|---|---|
| react-truthfulness | "Audit data belum terhubung" | GovernanceView.tsx |
| test_platform_static | "Commit canonical data" | DataIntake.tsx |
| test_v72_global_kv_boundary | `supabase.rpc('trace_read_global_kv'` | views/_shared.tsx |
| test_v72_3_ar_ap_assets_period_lock | import `buildArAging…` di main | AccountingView.tsx (import ada, path `../../core/…`) |
| test_data_intake_p0_hardening | `const BATCH_SIZE=1000` | DataIntake.tsx  |

Satu yang perlu keputusan: `test_v72_scope_static` mencari "ACQUISITION · INTERNAL", string itu **tidak ada di mana pun** di `src/`. Acquisition sekarang hanya `<iframe src="/acquisition/index.html">` (14 baris). Label internal-scope hilang atau pindah ke sub-app. [Kemungkinan Besar regresi label, bukan keamanan; perlu dicek di `features/acquisition_os`]

## 3. Peta routing
- 31 item nav, 30 punya cabang render; `overview` jatuh ke default (OverviewLive). Tidak ada view yatim.
- Routing lewat `?view=` + `useState`; tidak ada router, breadcrumb, atau deep-link dengan `clientId/outletId/period`.
- Mobile nav memuat `overview, health, clients, finance, target, ai, settings` (spesifikasimu: Home, Health, Clients, Finance, AI + More).

## 4. Peta 32 view → core → API/RPC (ringkas)

| Status | Modul |
|---|---|
| Tersambung RPC (UI→RPC→DB) | Accounting (8 RPC), ActionPlan, Clients, Inventory, KPI, Marketing, OPEX (9), Payroll (8), Sales, SOP, StockOpname (11), FinanceEntry, ChartOfAccounts, FnbTarget, DataIntake, BusinessHealth, BusinessTwin |
| Hanya baca/kalkulasi (tanpa write) | CashFlow, Tax, Analytics, Diagnosis, InternalDiagnosis, Governance, DataRecovery |
| Tipis (≤26 baris; perlu audit isi) | Leader Command Center (10), Team (15), Governance (10), InternalDiagnosis (12), BusinessTwin (25), Analytics (28) |
| Embed iframe | Acquisition |
| AI | AICenter → `/api/ai-chat` (input evidence manual, lihat §6) |

RPC: 87 dipanggil aplikasi/function, 118 didefinisikan di migration, **0 dipanggil tapi tidak ada** di migration. [Pasti] Dari 31 yang tidak dipanggil, sebagian besar trigger/guard sah. Yang benar-benar tanpa UI (BACKEND ONLY): `trace_create_inventory_item`, `trace_update_inventory_item`, `trace_delete_fnb_target_plan`, `trace_opname_history_report`, `trace_opname_item_variance_trend`, `trace_opname_count_discrepancies`, `trace_revoke_social_account`, `trace_transition_content_plan`, `trace_upsert_client_kv`.

## 5. Core module yang tidak di-import React view mana pun (NOT WIRED di React)
`acquisition, actionPlan, business, calculation, canonical, chartRender, content, evidence, index, intelligence, marketing, reporting`.
Sebagian dipakai tes/Netlify/iframe, jadi ini "tidak tersambung ke React", bukan "dead code" terbukti. Perlu penelusuran per modul di Phase 1/akhir.
Migration 016–021 (content, social, ad performance, competitor, calendar): **BACKEND ONLY**, tidak ada view.
POS adapter Moka & Pawoon: mengembalikan HTTP 501 `not_implemented` → stub.

## 6. Gap terhadap requirement (kode aktual)

| Requirement | Kondisi | Status |
|---|---|---|
| Global client/outlet/period context | Tidak ada. 20 view masing-masing punya state pemilih klien sendiri. Tidak ada `createContext` | FAIL |
| `TraceDataIssue` + Why?/Fix this | Tidak ada komponen | FAIL |
| Greeting personal, boot screen | Tidak ada | FAIL |
| Tema dark | `tokens.css` light (`--trace-bg:#f4f5f9`, surface `#fff`); banyak inline style hardcode `#fff`/`#fafaf8` di view → tidak bisa diganti lewat token saja | FAIL |
| AI Center otomatis membaca evidence | Masih form manual name/period/evidence/question; tidak memakai data klien | FAIL |
| Guardian terpisah dari Advisor | Mode `guardian` ada di satu chat yang sama | PARTIAL |
| Navigasi terkelompok | Daftar datar 31 item | FAIL |
| Command palette | Ada (Ctrl/Cmd+K), filter label saja | PARTIAL |
| Reduced-motion | Ada di hero Three.js; sistem lain belum diaudit | PARTIAL |
| Data hilang ≠ 0 | Ada disiplin "tidak ada event contoh" di beberapa view; belum diaudit per angka | NOT VERIFIED |
| Dummy/`Math.random` | Tidak ditemukan di `src/` | PASS (untuk scan ini saja) |
| Hardcode nama (Irwan dsb.) | Tidak ditemukan | PASS |

## 7. Migration & keamanan
- 51 migration: 001–052 tanpa **037** (celah penomoran; belum diketahui disengaja atau file hilang → NOT VERIFIED).
- RLS/isolasi klien: ada migration 026/027/029/031/033 dan tes statis; uji live (`tests_real/test_rls_live.mjs`) NOT VERIFIED.
- Audit secret/service-role di bundle browser belum dijalankan → NOT VERIFIED (Phase 17).

## 8. Temuan struktural
1. Kode ditulis sangat padat (baris panjang, inline style). `main.tsx` 78 baris, total 32 view ≈ 377 KB dalam ≈ 2.950 baris. Refactor tema dan komponen akan menyentuh hampir semua view.
2. Tes memakai string-match ke file sumber → rapuh terhadap refactor. Setiap phase yang memindahkan UI akan mematahkan tes serupa kecuali tes dipindah ke assertion perilaku.
3. Bundle utama 1.19 MB, tanpa route-level code splitting.

## 9. Usulan Phase 1 (belum dikerjakan)
1. Pin `exceljs` dan `playwright` ke versi yang sudah terkunci di lockfile agar `verify:dependencies` PASS (tanpa mengubah Node/npm requirement).
2. Perbaiki 5 tes stale agar membaca file view yang benar. Tidak melonggarkan assertion.
3. Putuskan soal "ACQUISITION · INTERNAL" (kembalikan label atau ubah tes) setelah cek `features/acquisition_os`.
4. Ulang baseline: `test:deterministic` harus 18/18 sebelum Phase 2.
