# UI Wiring Backlog — src/core/* vs src/app/views/*

**Metodologi (bisa direproduksi):**
1. `find src/core -maxdepth 1 -name "*.ts"` → daftar modul core.
2. Untuk tiap modul, `grep -rl "core/<nama>['\"]" src/app --include=*.tsx --include=*.ts` →
   file mana saja di `src/app/` (views, components, portfolio.tsx, main.tsx, scopeStore.ts)
   yang mengimpornya.
3. Modul yang tidak muncul di manapun → **tidak wired**.
4. Untuk modul yang dulu (snapshot 2026-09-14) tercatat punya *dead import* (simbol
   diimpor tapi tak pernah dipanggil), dicek ulang satu per satu apakah masih dead.

Snapshot kode: ZIP `traceconsultant1-main_PHASE2_redesign_v14.zip` (`src/app/main.tsx`
sudah dipecah jadi `src/app/views/*.tsx` + `src/app/views/_shared.tsx` sejak 2026-09-17 —
tabel di bawah menggantikan versi lama yang masih merujuk baris `main.tsx` 2242-baris).

## Ringkasan angka (update dari snapshot lama)
- Total modul di `src/core/`: **55** (naik dari 50 — modul baru: `cashFlowStatement`,
  `chartOfAccounts`, `portfolioHealth`, `scope`, `taxCalculator` sekarang wired; `workQueue`,
  `workstreams` juga baru).
- Tidak ada import sama sekali di `src/app/`: **12** dari 55 — `acquisition, actionPlan,
  business, calculation, canonical, chartRender, content, evidence, index, intelligence,
  marketing, reporting`. (`workstreamSignals`, modul baru 2026-09-22, sudah diimpor `portfolio.tsx`.)
  (Catatan: snapshot lama juga menandai `cashFlowStatement`, `chartOfAccounts`,
  `taxCalculator` "tidak ada import" di baris ringkasannya — itu SUDAH SALAH bahkan saat
  snapshot lama ditulis, karena tabelnya sendiri di baris lain sudah mencatat ketiganya
  "ya, wired". Ringkasan ini sudah dikoreksi.)
- **Dead import yang tercatat di snapshot lama SUDAH DIBERESKAN** (dicek ulang di kode
  v14): `aiDiagnostic.diagnoseApplication`, `aiSecurity.analyzeSecurity`,
  `collaboration.transitionTask`, `sop.nextSOPStep`, `sop.validateSOP` — kelima simbol ini
  TIDAK ADA LAGI di baris import manapun (dibersihkan di sesi antara snapshot lama dan v14,
  tidak diketahui sesi persis mana). `sop.ts` sekarang hanya diimpor untuk tipe `SOP` (type
  import, bukan dead code).
- Kasus "modul terpasang tapi bukan di tab yang namanya cocok" masih sama seperti snapshot
  lama: `inventoryIntelligence.ts` hanya dipakai di Business Health
  (`calculateInventoryVariance`), BUKAN di `InventoryView.tsx` sendiri (yang murni CRUD ke
  RPC Supabase tanpa hitungan variance).
- **4 tab yang namanya cocok modul core tapi TIDAK memanggilnya — SUDAH DIVERIFIKASI sesi
  2026-09-22** (baca kode + migration SQL langsung, bukan tebakan):
  - **`ActionPlanView` vs `actionPlan.ts` — BUKAN gap.** View memanggil RPC
    `trace_upsert_action_item` (`supabase/migrations/050_action_plan_v72.sql`) yang menegakkan
    ATURAN YANG SAMA PERSIS dengan `validateActionItem`: prioritas P0 wajib target≠baseline
    (SQL baris ~101-103), status `completed` wajib evidence tidak kosong (SQL baris ~104). View
    menduplikasi cek yang sama di client (baris 46-47) cuma untuk UX instan, RPC tetap jadi
    source of truth. Fungsi run-time `actionPlan.ts` hanya dipanggil oleh test-nya sendiri
    (`action-plan-kpi-sop.mjs`); `leaderCommandCenter.ts`/`internalDiagnosis.ts`/`reporting.ts`
    cuma import TIPE `ActionPlan`-nya (`import type`, bukan panggilan fungsi) — jadi bukan
    "wired" dalam arti run-time meski lolos grep. Pola ini disengaja: `actionPlan.ts` = spesifikasi
    tereksekusi/test mirror, SQL = penegak produksi. Catatan risiko (bukan bug): tidak ada
    pengecekan otomatis yang menjaga TS mirror dan SQL RPC ini tetap sinkron kalau salah satu
    diubah — sesi ini keduanya dikonfirmasi cocok, tapi itu manual.
  - **`MarketingView` vs `marketing.ts` — BUKAN gap, pola sama.** Rumus `marketingRoiPct` =
    `(revenue-cost)/cost*100` dicek sama persis dengan `roi_pct` di
    `supabase/migrations/051_marketing_campaigns_v72.sql` (baris 162 & 176). View memanggil RPC
    `trace_marketing_channel_summary`/`trace_marketing_campaign_performance` langsung; `marketing.ts`
    run-time-nya cuma dipanggil `test_marketing.mjs` (spec mirror, sama seperti actionPlan).
  - **`AcquisitionView` vs `acquisition.ts` — KOREKSI (temuan sesi sebelumnya SALAH di satu
    poin penting, diperbaiki sesi ini setelah baca lebih dalam).** Klaim sebelumnya "datanya
    disimpan di localStorage browser, BUKAN Supabase" **TIDAK AKURAT** — sudah ada
    `window.TRACE_ACQUISITION_BRIDGE` (dipasang `main.tsx` baris ~133 lewat
    `installAcquisitionBridge()` di `_shared.tsx`) yang menghubungkan `trace-acquisition-os.html`
    ke Supabase sungguhan: `loadLeads`/`saveLeads` → RPC `trace_read_global_kv`/
    `trace_upsert_global_kv` (key `trace_os::acquisitionLeads`, sudah di-whitelist sejak migration
    031/036), `saveDiscoveryJob`/`updateDiscoveryJob`/`saveDiscoveryCheckpoint` → RPC job-tracking
    khusus (`trace_create_acquisition_job` dkk.), dan `createClientFromLead` → RPC `trace_create_client`
    asli (bukan blob terpisah). `localStorage` cuma fallback kalau sesi Supabase belum ada
    (`getTraceBridge` timeout 800ms lalu balik ke `localStorage.getItem`) — bukan jalur utama.
    Tool ini juga SUDAH punya dedup sendiri (`recordsLikelySame`, key: external_id/phone/
    Instagram/website/nama+jarak, dipakai saat discovery) dan scoring sendiri
    (`computeOverallScore`, dari `lead.analysis` — metrik AI/Instagram intelligence: brand
    presence, content/reach/conversion opportunity), BUKAN stub kosong.
    **Yang MASIH akurat dari temuan sebelumnya:** `core/acquisition.ts` (`qualifyLead`/
    `deduplicateLeads`/`buildPipelineMetrics`/`ACQUISITION_STAGES` 13-stage) memang nol pemanggil
    run-time di `src/app/` — cuma dipakai `tests_core/test_acquisition_phase9.mjs`. Tapi ini BUKAN
    tool yang "lepas dari Supabase" seperti diklaim sebelumnya — ini kode yang genuinely tidak
    terpakai (mirip kasus `business.ts`), CUMA fungsinya secara konsep TIDAK duplikat dengan yang
    sudah ada di tool: `qualifyLead` menilai fit bisnis (kategori F&B, jumlah outlet, review count,
    kelengkapan digital presence) — dimensi berbeda dari `computeOverallScore` yang menilai peluang
    konten/digital dari analisis AI. Berpotensi saling melengkapi (skor fit + skor peluang konten),
    bukan saling menggantikan. Keputusan yang masih perlu user (versi terkoreksi, lihat STATUS.md):
    apakah `qualifyLead`/`buildPipelineMetrics` mau dipakai sebagai sinyal TAMBAHAN (additive, tidak
    mengubah `computeOverallScore`/dedup yang sudah jalan), atau `acquisition.ts` dihapus saja
    sebagai dead code seperti `business.ts`.
  - **`BusinessTwinView` vs `business.ts` — dead code terkonfirmasi, aman dihapus kapan saja
    user minta.** Diverifikasi: `business.ts` NOL import di manapun (`src/`, `tests_core/`),
    termasuk type-only import (beda dari `actionPlan.ts` di atas). Modul ini memodelkan hierarki
    lama `Client → Company → Brand → Outlet` yang menurut catatan sesi 2026-09-21 di STATUS.md
    memang sengaja ditinggalkan: migration outlet (054) membuat `outletOptionsForClient` match
    langsung via `clientId`, "tanpa perlu rantai company/brand lama yang memang tak pernah
    terisi". `BusinessTwinView.tsx` hari ini adalah papan tugas/kolaborasi ber-scope klien (pakai
    `core/collaboration.ts`) — tidak ada hubungannya lagi dengan hierarki lama itu meski nama
    "Business Twin" masih sama. Tidak dihapus sesi ini (perubahan destruktif menunggu user minta
    eksplisit), cuma dikonfirmasi statusnya.

## Tabel — modul yang WIRED, dan ke file src/app/ mana

| Modul (`src/core/`) | File `src/app/` yang mengimpor |
|---|---|
| accountSubTypeInference | `views/AccountingView.tsx` |
| accounting | `views/AccountingView.tsx`, `views/FinanceEntry.tsx`, `views/RecipeCogsView.tsx` |
| accountsPayable | `views/AccountingView.tsx` |
| accountsReceivable | `views/AccountingView.tsx` |
| aiDiagnostic | `views/SettingsCenter.tsx` (hanya `summarizeDiagnostics`, type; `diagnoseApplication` sudah tidak diimpor) |
| aiEvolution | `views/SettingsCenter.tsx` |
| aiMaintenance | `views/SettingsCenter.tsx` |
| aiSecurity | `views/SettingsCenter.tsx` (hanya `securityStatus`; `analyzeSecurity` sudah tidak diimpor) |
| alerts | `views/BusinessHealthView.tsx` |
| auditGovernance | `views/GovernanceView.tsx` |
| balanceSheet | `views/AccountingView.tsx` |
| browserNetwork | `views/AICenterView.tsx`, `views/DataIntake.tsx`, `views/SettingsCenter.tsx`, `views/_shared.tsx` |
| businessHealth | `views/BusinessHealthView.tsx` |
| canonicalImport | `views/DataIntake.tsx` |
| cashFlowStatement | `views/CashFlowView.tsx` |
| chartOfAccounts | `views/ChartOfAccountsView.tsx` |
| collaboration | `views/BusinessTwinView.tsx` (hanya `summarizeCollaboration`; `transitionTask` sudah tidak diimpor) |
| dataIntake | `views/DataIntake.tsx`, `views/DataRecovery.tsx` |
| diagnosis | `views/BusinessDiagnosis.tsx` |
| diagnosticCenter | `views/SettingsCenter.tsx` |
| diagnosticRepair | `views/SettingsCenter.tsx` |
| durableRecovery | `views/DataIntake.tsx`, `views/DataRecovery.tsx` |
| fileIntakeAdapters | `views/DataIntake.tsx` |
| finance | `portfolio.tsx`, `views/BusinessDiagnosis.tsx`, `views/BusinessHealthView.tsx`, `views/CashFlowView.tsx`, `views/FinanceEntry.tsx` |
| financeInput | `views/FinanceEntry.tsx` |
| financeReport | `views/FinanceEntry.tsx` |
| financeStatement | `views/CashFlowView.tsx`, `views/FinanceEntry.tsx` |
| fixedAssets | `views/AccountingView.tsx`, `views/CashFlowView.tsx` |
| fnbTargetPlanning | `views/FnbTargetPlanner.tsx` |
| internalDiagnosis | `views/InternalDiagnosisView.tsx` |
| inventoryIntelligence | `views/BusinessHealthView.tsx` (BUKAN `InventoryView.tsx` — lihat catatan di atas) |
| kpi | `views/AnalyticsView.tsx`, `views/KpiTrackingView.tsx` |
| leaderCommandCenter | `views/LeaderCommandCenterView.tsx` |
| periodClose | `views/AccountingView.tsx` |
| portfolioHealth | `components/OverviewDashboard.tsx`, `components/dash.tsx`, `components/icons.tsx`, `portfolio.tsx`, `views/OverviewLive.tsx` |
| posHealth | `views/BusinessHealthView.tsx` |
| salesAnalytics | `views/SalesView.tsx` |
| scope | `components/ScopeSelectors.tsx`, `main.tsx`, `portfolio.tsx`, `scopeStore.ts`, `views/OverviewLive.tsx` — reducer periode/klien/outlet terpusat (lihat STATUS.md) |
| sop | `main.tsx`, `views/BusinessTwinView.tsx`, `views/SopView.tsx` (hanya tipe `SOP`) |
| taxCalculator | `views/TaxView.tsx` |
| workQueue | `components/OverviewDashboard.tsx`, `portfolio.tsx` |
| workstreams | `components/OverviewDashboard.tsx`, `portfolio.tsx` |
| workstreamSignals | `portfolio.tsx` (sinyal inventory/POS/sosial/AR-AP, hanya untuk klien terpilih) |

## Modul yang TIDAK wired sama sekali
`acquisition, actionPlan, business, calculation, canonical, chartRender, content, evidence, index, intelligence, marketing, reporting`

`index.ts` adalah barrel file (bukan bug — `src/app` tetap impor tiap modul langsung, bukan lewat `core/index`).

**Status per 2026-09-22** (lihat rincian audit di atas, bagian "4 tab..."):
`actionPlan` dan `marketing` — bukan gap, spec-mirror yang diuji lewat test masing-masing sambil
production logic-nya ada di RPC/SQL (cocok, sudah dicek baris-per-baris). `business` — dead code
terkonfirmasi (nol import di mana pun), aman dihapus kalau user minta. `acquisition` — gap arsitektur
nyata (tool legacy `localStorage` vs modul pipeline 13-stage yang tak pernah dipanggil), butuh
keputusan user, belum dikerjakan. Sisa 7 modul (`calculation, canonical, chartRender, content,
evidence, intelligence, reporting`) masih belum diverifikasi ulang sesi manapun — perlu klarifikasi
user kalau mau dikerjakan.
