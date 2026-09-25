> **[DIHENTIKAN — baca STATUS.md]** Rantai `HANDOFF_NEXT_PHASES_v*.md` tidak dilanjutkan lagi mulai 2026-09-21. File ini disimpan sebagai arsip historis (keputusan desain & konteks di dalamnya tetap berlaku kecuali dikoreksi di `STATUS.md`), tapi status terkini HANYA ada di `STATUS.md` di root repo.

# TRACE Consultant OS — HANDOFF (dibuat 2026-09-21, setelah Phase 1)

Salin bagian "PROMPT UNTUK CLAUDE BERIKUTNYA" ke akun Claude lain bersama ZIP ini.

## Status
- Phase 0 (audit): SELESAI → `PHASE0_TOTAL_AUDIT_TRACE_2026-09-21.md`
- Phase 1 (runtime/build/dependency): SELESAI → `PHASE1_RUNTIME_BUILD_DEPENDENCY_2026-09-21.md`. Baseline hijau: test:deterministic 18/18, typecheck, build, preflight.
- Phase 2–20: BELUM DIKERJAKAN.
- NOT VERIFIED (butuh Supabase live): tests_real/*, RLS live, migration 037 hilang di penomoran.

## PROMPT UNTUK CLAUDE BERIKUTNYA
Kamu menerima ZIP TRACE Consultant OS (source of truth = kode aktual). Baca HANDOFF_NEXT_PHASES.md, PHASE0_*.md, PHASE1_*.md. Lanjutkan dari Phase 2 secara berurutan. Tiap phase: audit → implement → test → verify → report, lalu kirim ZIP penuh + daftar sisa phase. Jangan rewrite besar-besaran. Jangan hapus/reset data, migration, atau RLS. Jangan turunkan Node 22.22.2 / npm 10.9.2. Jangan dummy data, jangan missing = 0, jangan tombol palsu. Status hanya PASS/PARTIAL/FAIL/BLOCKED/NOT VERIFIED, BLOCKED/NOT VERIFIED tidak boleh diubah jadi PASS. Sebelum mulai jalankan: `npm ci --include=dev`, `npm run release:preflight`, `npm run test:deterministic`, `npm run typecheck:react`, `npm run build:site`. Tes statis baru harus memakai `tests_core/_react_source.mjs` (UI tersebar di main.tsx + views/*.tsx).

## Fakta kode yang perlu diketahui
- UI React: `src/app/main.tsx` (shell 78 baris, nav datar 31 item, routing `?view=` + useState) + 32 file `src/app/views/*.tsx`. Kode sangat padat (inline style, baris panjang).
- Tema: `src/styles/tokens.css` light. Banyak warna hardcode (`#fff`, `#fafaf8`, `rgba(23,23,23,.08)`) di view → migrasi ke token wajib menyentuh view.
- 20 view punya pemilih klien sendiri (`Pilih klien`); tidak ada context global.
- Belum ada: TraceDataIssue, boot screen/greeting, command palette kontekstual, breadcrumb.
- AI Center (`AICenterView.tsx`, `/api/ai-chat`): input manual name/period/evidence/question, mode `business_advisor|engineering|guardian` dalam satu chat.
- Acquisition = iframe `/acquisition/index.html`.
- BACKEND ONLY: migration 016–021 (content/social/ad/competitor/calendar); RPC tanpa UI: trace_create_inventory_item, trace_update_inventory_item, trace_delete_fnb_target_plan, trace_opname_history_report, trace_opname_item_variance_trend, trace_opname_count_discrepancies, trace_revoke_social_account, trace_transition_content_plan, trace_upsert_client_kv. POS Moka/Pawoon = HTTP 501 stub.
- Core tidak di-import view mana pun: acquisition, actionPlan, business, calculation, canonical, chartRender, content, evidence, index, intelligence, marketing, reporting.
- View tipis perlu audit isi: LeaderCommandCenter (10 baris), Team, Governance, InternalDiagnosis, BusinessTwin, Analytics.
- Bundle utama 1.19 MB, belum code-split.

## Sisa pekerjaan per phase
Definisi selesai per fitur: UI → logic → DB/API → persistence → reload → navigasi → evidence → tes.

**Phase 2 — App shell + design system**: tema premium dark lewat token (near-black, aksen oranye tertahan, status hijau/kuning/merah); hapus warna hardcode di view; komponen reusable: TracePageHeader, TraceCard, TraceMetric, TraceKPI, TraceChartCard, TraceSparkline, TraceStatusBadge, TraceEmptyState, TraceLoadingState, TraceErrorState, TraceDrawer, TraceExplainButton, TraceCommandPalette, TraceHealthCard, TraceEvidencePanel, TraceSourceBadge, TraceJumpLink, TraceToast; navigasi terkelompok (HOME/CLIENT/FINANCE/INTELLIGENCE/OPERATIONS/AI/SYSTEM, collapsible, breadcrumb); mobile bottom nav Home/Health/Clients/Finance/AI + More; motion + prefers-reduced-motion; cek responsif.
**Phase 3 — Login/boot/greeting**: boot screen (Initializing… Securing workspace… Checking session… Loading workspace…), login dark dengan transisi, greeting berdasar jam + nama dari profile/team/auth metadata (bukan hardcode), fallback "Good morning." tanpa nama; tidak menambah klik; session ada → langsung workspace.
**Phase 4 — Context global**: provider clientId, outletId, period, previousPeriod, user, role; sinkron ke URL; ganti 20 pemilih klien per-view dengan TraceClientSelector/TraceOutletSelector/TracePeriodSelector; semua deep link membawa context; tes isolasi antar klien.
**Phase 5 — Overview/Executive Command Center**: hero + ringkasan perhatian nyata; kartu health per klien (Revenue, GM, COGS, OPEX, Profit, Execution) dengan sparkline hanya dari data nyata, INSUFFICIENT DATA jika kurang; work queue dari task/aksi/diagnosis nyata; chart interaktif (hover/klik/periode 7D-30D-3M-6M-12M) dengan klik → modul + context; Three.js hero tetap tapi bukan satu-satunya isi.
**Phase 6 — Business Health + remediation**: tiap metrik: status, value, trend, why, impact, required data, action, source; skor hanya dari evidence tersedia + coverage %; dimensi Revenue/COGS/GM/Labor/OPEX/Op Profit/Cash/Inventory/Sales/Marketing/Execution/Data Quality dengan bobot terdokumentasi; komponen `TraceDataIssue` (status, reason, missingFields, impact, actionLabel, route, clientId, outletId, period, tombol Why?/Fix this) dipakai di seluruh app.
**Phase 7 — Client workspace + Business Twin**: node Company→Brand→Outlet→Revenue→COGS→Inventory→Labor→OPEX→Profit→Cash→Marketing→Execution, dapat diklik, data nyata.
**Phase 8 — Finance + Accounting**: alur Client→Period→Revenue→COGS→Labor→OPEX→Other→hasil (GP, GM, Op Profit, Net Profit), completeness %, evidence coverage, perbandingan periode, anomali; Accounting Command Center (Cash, AR, AP, Revenue, COGS, GP, OPEX, Net Profit) + Input Center 10 tab; kategori akun F&B (Revenue/COGS/Labor/OPEX) terhubung ke P&L.
**Phase 9 — Recipe COGS + Inventory + Stock Opname**: recipe (yield, waste, portion, packaging, final COGS, margin) + tombol Update Ingredient Cost; inventory (opening, purchase, transfer, consumption, waste, adjustment, return, closing, theoretical vs actual, variance value/%); UI untuk create/update inventory item dan laporan opname yang belum ada; opname → variance → approve → posting → dampak akuntansi.
**Phase 10 — Payroll, OPEX, Cash Flow, Tax**: payroll → labor cost → Finance → P&L → Health; OPEX budget vs actual, recurring, evidence, deep link.
**Phase 11 — Sales, Target & Capacity, KPI**: sales intelligence (tren, AOV, top/bottom produk, mix, daypart, channel); planner kapasitas (meja, seat, turnover, jam, AOV, parkir, delivery, dapur, labor, COGS%, OPEX, target profit) → target harian/bulanan, transaksi, covers, break-even, skenario Conservative/Base/Aggressive; KPI dengan target/actual/variance/owner/action.
**Phase 12 — Diagnosis, Action Plan, SOP**: what/why/impact/evidence/recommendation; action plan dari diagnosis/health/AI/manual (owner, baseline, target, due, evidence, status); SOP → task → eksekusi → review.
**Phase 13 — Marketing + Acquisition**: campaign→spend→reach→click→lead→revenue, CTR/CAC/ROI hanya bila evidence ada; Acquisition: tampilkan PROVIDER UNAVAILABLE, bukan 0 lead; audit alur lead→klien.
**Phase 14 — AI Business Advisor**: pilih client/outlet/period, evidence otomatis dari TRACE, output WHAT/WHY/IMPACT/EVIDENCE/CONFIDENCE/LIMITATIONS/ACTION/OPEN MODULE, tanpa angka karangan, INSUFFICIENT DATA bila kurang.
**Phase 15 — AI Guardian + System Diagnostic**: pisahkan dari Advisor; pantau konfigurasi AI, endpoint, keamanan, diagnostic; jangan klaim sehat tanpa verifikasi.
**Phase 16 — Data Intake + Data Quality**: alur upload→extract→map→review→missing→fix→approve→commit→verify→intelligence; skor completeness/freshness/consistency/evidence coverage/mapping confidence/duplicate risk.
**Phase 17 — Security/Governance/RLS**: uji live user A tidak bisa baca klien user B (butuh Supabase), audit secret di bundle, role leader vs user, audit log.
**Phase 18 — Performa/responsif/aksesibilitas**: code-split route (bundle 1.19 MB), kontras dark, keyboard, reduced-motion.
**Phase 19 — Regression penuh** + tes perilaku (kurangi string-match ke source).
**Phase 20 — Final release audit**: matrix Module × UI/Backend/DB/Persistence/Validation/Evidence/Security/Client Scope/Deep Link/Tests/Status/Remaining, plus skenario end-to-end (login → greeting → overview → pilih klien → health → isi revenue yang hilang → health berubah → recipe → inventory → AI → action → KPI → finance/accounting → reload → ganti klien tanpa kebocoran).

## Catatan kejujuran
Tidak ada satu pun requirement UI/produk di atas (selain perbaikan Phase 1) yang sudah diimplementasikan. Jangan tandai PASS tanpa eksekusi tes.
