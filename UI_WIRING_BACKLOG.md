# UI Wiring Backlog — src/core/* vs src/app/main.tsx

**Metodologi (bisa direproduksi):**
1. `find src/core -type f` → 50 file modul.
2. `grep -n "from '\.\./core/" src/app/main.tsx` → daftar import di main.tsx.
3. Untuk tiap modul yang importnya ADA, tiap simbol yang diimpor di-grep lagi
   (`grep -n "\bnamaFungsi\("`) untuk menemukan baris pemakaian aktual, lalu baris itu
   dipetakan ke komponen tab yang membungkusnya (lihat batas fungsi komponen di
   main.tsx, dan mapping `active==='id' ? <Komponen/>` + array `nav` untuk nama tab).
4. Modul yang TIDAK muncul sama sekali di daftar import main.tsx → **tidak wired**.

Snapshot: `TRACE_v72_21_UI_COMPLETE_2026-09-14.zip`, file diperiksa: `src/app/main.tsx` (2242 baris).

## Tabel

| Modul (src/core/) | Wired ke UI? | Lokasi tab/menu jika ya |
|---|---|---|
| accountSubTypeInference.ts | ya | Akuntansi (`AccountingView`, baris ~1207) |
| accounting.ts | ya | Keuangan (`FinanceEntry`, `calculateRecipeCogs` baris 934), tab **Recipe COGS** baru (`RecipeCogsView`) **dan** Akuntansi (`AccountingView`, `buildTrialBalance` baris 1205) |
| accountsPayable.ts | ya | Akuntansi (`AccountingView`, baris 1109) |
| accountsReceivable.ts | ya | Akuntansi (`AccountingView`, baris 1106) |
| acquisition.ts | tidak | — tidak ada import di main.tsx. Catatan: tab "Acquisition" (`AcquisitionView`, baris 413-423) ADA di nav, tapi isinya tidak memanggil `src/core/acquisition.ts` sama sekali |
| actionPlan.ts | tidak | — tidak ada import. Tab "Action Plan" (`ActionPlanView`, baris 2027-2123) ada di nav tapi logikanya tidak pakai file ini |
| aiDiagnostic.ts | sebagian | `summarizeDiagnostics` dipakai di Settings (`SettingsCenter`, baris 789). `diagnoseApplication` **diimpor tapi tidak pernah dipanggil di manapun** (dead import) |
| aiEvolution.ts | ya | Settings (`SettingsCenter`, baris 738) |
| aiMaintenance.ts | ya | Settings (`SettingsCenter`, baris 820) |
| aiSecurity.ts | sebagian | `securityStatus` dipakai di Settings (`SettingsCenter`, baris 820). `analyzeSecurity` **diimpor tapi tidak pernah dipanggil di manapun** (dead import) |
| alerts.ts | ya | Business Health (`BusinessHealthView`, baris 319) |
| auditGovernance.ts | ya | Governance (`GovernanceView`, baris 388) |
| balanceSheet.ts | ya | Akuntansi (`AccountingView`, baris 1207) |
| browserNetwork.ts | ya | Utilitas lintas-tab (`getReactSupabase`, baris 163) + Data Intake (baris 628, 702) + Settings (baris 735-793) |
| business.ts | tidak | — tidak ada import. Tab "Business Twin" (`BusinessTwinView`, baris 518-536) ada di nav tapi tidak pakai `src/core/business.ts` (yang dipakai di situ justru `summarizeCollaboration` dari collaboration.ts, baris 531) |
| businessHealth.ts | ya | Business Health (`BusinessHealthView`, baris 318) |
| calculation.ts | tidak | — tidak ada import di main.tsx |
| canonical.ts | tidak | — tidak ada import di main.tsx |
| canonicalImport.ts | ya | Data Intake (`DataIntake`, baris 639, 652, 694, 713) |
| cashFlowStatement.ts | ya | Tab baru **Arus Kas** (`CashFlowView`) — `buildCashFlowStatement`; `labaBersih` dari `buildIncomeStatement` (sama seperti `FinanceEntry`), `bebanPenyusutan` dari `totalMonthlyDepreciation` (sama seperti `AccountingView`), field lain dibiarkan null dan tampil di `missingInputs` |
| chartOfAccounts.ts | ya | Tab baru **Chart of Accounts** (`ChartOfAccountsView`) — `defaultChartOfAccounts` untuk preview & payload seed; ditulis ke tabel `accounts` yang sama dipakai `AccountingView` lewat RPC baru `trace_seed_chart_of_accounts_bulk` (migration 052), hanya jalan kalau klien belum punya akun sama sekali |
| chartRender.ts | tidak | — tidak ada import di main.tsx (chart pakai `recharts` langsung, bukan modul ini) |
| collaboration.ts | sebagian | `summarizeCollaboration` dipakai di Business Twin (`BusinessTwinView`, baris 531). `transitionTask` **diimpor tapi tidak pernah dipanggil di manapun** (dead import) |
| content.ts | tidak | — tidak ada import di main.tsx |
| dataIntake.ts | ya | Data Intake (`DataIntake`, baris 609-714) |
| diagnosis.ts | ya | Diagnosis (`BusinessDiagnosis`, baris 555) |
| diagnosticCenter.ts | ya | Settings (`SettingsCenter`, baris 726-834, termasuk lewat helper `startTelemetryOnce` yang dipanggil dari Settings) |
| diagnosticRepair.ts | ya | Settings (`SettingsCenter`, baris 790, 799) |
| durableRecovery.ts | ya | Data Recovery (`DataRecovery`, `deleteRecoverySnapshot` baris 575, `listRecoverySnapshots` baris 571) **dan** Data Intake (`DataIntake`, `listRecoverySnapshots` baris 599-600, `saveRecoverySnapshot` baris 600) |
| evidence.ts | tidak | — tidak ada import di main.tsx |
| fileIntakeAdapters.ts | ya | Data Intake (`DataIntake`, baris 679-683) |
| finance.ts | ya | Business Health (`summarizeFinance`, baris 310), Diagnosis (`compareFinancePeriods`, baris 555), Keuangan (`FinanceEntry`, `compareFinancePeriods`/`buildFinanceMonthlyView`/`assessFinanceQuality`, baris 929-931) |
| financeInput.ts | ya | Keuangan (`FinanceEntry`, baris 920-921) |
| financeReport.ts | ya | Keuangan (`FinanceEntry`, baris 962-983) |
| financeStatement.ts | ya | Keuangan (`FinanceEntry`, baris 968) |
| fixedAssets.ts | ya | Akuntansi (`AccountingView`, baris 1111, 1363) |
| fnbTargetPlanning.ts | ya | Target & Kapasitas (`FnbTargetPlanner`, baris 853) |
| index.ts | tidak | — barrel file; main.tsx mengimpor tiap modul langsung, bukan lewat `core/index` |
| intelligence.ts | tidak | — tidak ada import di main.tsx |
| internalDiagnosis.ts | ya | Internal Diagnosis (`InternalDiagnosisView`, baris 537) |
| inventoryIntelligence.ts | ya, tapi BUKAN di tab Inventory | Dipakai di Business Health (`BusinessHealthView`, `calculateInventoryVariance` baris 316). Tab "Inventory & Recipe" (`InventoryView`, baris 880-896) sendiri murni CRUD via RPC Supabase — tidak memanggil `calculateInventoryVariance` sama sekali |
| kpi.ts | ya | Analytics (`AnalyticsView`, baris 397) **dan** KPI Tracking (`KpiTrackingView`, baris 1874) |
| leaderCommandCenter.ts | ya | Command Center (`LeaderCommandCenterView`, baris 369) |
| marketing.ts | tidak | — tidak ada import. Tab "Marketing" (`MarketingView`, baris 2123-2242) ada di nav tapi tidak pakai `src/core/marketing.ts` |
| periodClose.ts | ya | Akuntansi (`AccountingView`, baris 1114) |
| posHealth.ts | ya | Business Health (`BusinessHealthView`, baris 312) |
| reporting.ts | tidak | — tidak ada import di main.tsx |
| salesAnalytics.ts | ya | Penjualan & Dashboard (`SalesView`, baris 1454) |
| sop.ts | ada import, TAPI dead | Modul diimpor di baris 32, tapi `nextSOPStep` dan `validateSOP` **tidak pernah dipanggil di manapun** di main.tsx (dead import). Tab "SOP" (`SopView`, baris 1921-2027) tidak memakai fungsi ini |
| taxCalculator.ts | ya | Tab baru **Pajak** (`TaxView`) — `calculatePpn`, `extractPpnFromGrossPrice`, `calculatePphFinalUmkm`, `summarizeMonthlyTax`; kalkulator input manual, bukan otomatis dari transaksi |

## Ringkasan angka
- Total modul di `src/core/`: **50**
- Ada baris import di main.tsx: **35** dari 50
- Tidak ada import sama sekali: **15** dari 50 — `acquisition, actionPlan, business, calculation, canonical, cashFlowStatement, chartOfAccounts, chartRender, content, evidence, index, intelligence, marketing, reporting, taxCalculator`
- Dari 35 yang diimpor, **4 modul punya simbol yang diimpor tapi tidak pernah dipanggil (dead import)**: `aiDiagnostic.diagnoseApplication`, `aiSecurity.analyzeSecurity`, `collaboration.transitionTask`, `sop.nextSOPStep` + `sop.validateSOP` (seluruh isi import `sop.ts` dead)
- Ditemukan 1 kasus **modul terpasang tapi di tab yang salah/tidak sesuai namanya**: `inventoryIntelligence.ts` tidak dipakai di tab "Inventory & Recipe" — hanya dipakai di ringkasan Business Health. Tab Inventory sendiri murni form CRUD ke Supabase RPC tanpa perhitungan variance.
- 4 tab yang ADA di nav (`acquisition`, `business`(partial), `marketing`, `actionplan`) punya nama yang cocok dengan modul core, tapi komponennya **tidak memanggil modul core bernama sama** — perlu dicek manual apakah logikanya sengaja inline/pakai Supabase langsung, atau memang belum di-wire.
