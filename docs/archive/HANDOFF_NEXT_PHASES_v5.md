> **[DIHENTIKAN — baca STATUS.md]** Rantai `HANDOFF_NEXT_PHASES_v*.md` tidak dilanjutkan lagi mulai 2026-09-21. File ini disimpan sebagai arsip historis (keputusan desain & konteks di dalamnya tetap berlaku kecuali dikoreksi di `STATUS.md`), tapi status terkini HANYA ada di `STATUS.md` di root repo.

# TRACE Consultant OS — HANDOFF v5 (dibuat 2026-09-21, sesi Phase 2 lanjutan: komponen reusable, dihentikan di tengah atas permintaan user)

Menggantikan v4 untuk status terbaru; v4, v3, v2, v1 tetap dibaca untuk konteks (keputusan desain v2 §2, fakta produk v2 §5b–5d, sejarah phase). Sumber kebenaran = KODE di ZIP `traceconsultant1-main_PHASE2_redesign_v7.zip`.

## 0. Keputusan dari v4 §2 — SUDAH DISETUJUI USER sesi ini
User menyetujui KEDUA butir v4 §2 poin 1 dan 2 apa adanya (tetap sebagai perilaku sementara, bukan diperbaiki sekarang):
1. Tidak ada tabel `trace_outlets` per klien di Postgres — id outlet tetap diketik manual, saran outlet kosong untuk klien baru. Migration `trace_outlets` (client_id, nama, brand) + RPC baca/tulis MASIH BELUM DIBUAT — ini bukan "selesai", cuma "diterima untuk sekarang".
2. Outlet tetap TIDAK memfilter analitik finance (Diagnosis/CashFlow/Health/FinanceEntry) — chip outlet tetap sengaja tidak dipasang di modul-modul itu. Aturan baris finance tanpa outlet saat satu outlet dipilih MASIH BELUM DIPUTUSKAN detailnya.
Poin 3 dan 4 di v4 §2 tidak dibahas ulang — statusnya tetap seperti di v4 (sudah merupakan keputusan desain final, bukan pertanyaan terbuka).

## 1. YANG SELESAI SESI INI — Phase 2 (komponen reusable), BARU MULAI, BELUM SELESAI

### 1a. Verifikasi ulang v4 (dijalankan sungguhan sebelum kerja apapun, node v22.22.2 / npm 10.9.7)
```
npm ci                       → PASS
npm run typecheck:react      → PASS, 0 error
npm run test:deterministic   → PASS (semua PASS termasuk test_scope.mjs, v72 scope static)
npm run build:react          → PASS
```
Ini mengonfirmasi klaim v4 masih valid di kode v6 sebelum sesi ini menambah apapun.

### 1b. Komponen baru: `src/app/components/TraceUI.tsx`
- `TracePageHeader({kicker, kickerVariant?, title, description?})` — pengganti blok `<div className="trace-card" style={{padding:26}}>...</div>` yang berulang di tiap view. **Dua varian kicker dipertahankan apa adanya** (BUKAN diseragamkan — ini refactor struktural, bukan redesign visual): `kickerVariant="muted"` (default, class `trace-muted`, dipakai ~18 view) dan `kickerVariant="section"` (class `trace-section-kicker`, dipakai 4 view: BusinessDiagnosis, BusinessHealthView, BusinessTwinView, DataRecovery — huruf lebih kecil+bold+uppercase, BEDA dari varian muted).
- `TraceCard({children, style?, className?})` — pembungkus tipis untuk `.trace-card` biasa (bukan header), untuk seksi konten di dalam view.
- `TraceEmptyState({message?})` — pesan "Belum ada data." seragam. Sebelumnya wording bervariasi antar view ("Belum ada data" / "belum ada data" / kalimat lain) — komponen ini TIDAK memaksa migrasi semua wording lama, hanya dipakai di tempat yang sudah dimigrasi sesi ini.
- Markup di dalam ketiga komponen ini SENGAJA disalin persis dari markup lama (dicek: tidak ada test yang menguji markup mentah `trace-card`/kicker/`padding:26`, lihat `grep -rl "trace-card\|padding:26" tests_core tests_real` = kosong), jadi migrasi per view seharusnya zero visual diff — TAPI ini belum diverifikasi di browser asli (lihat §3 catatan kejujuran).

### 1c. View yang SUDAH dimigrasi ke TraceUI (2 dari 23 total)
- `KpiTrackingView.tsx` — header → `TracePageHeader` (varian muted), filter bar → `TraceCard`, pesan "Belum ada nilai..." → `TraceEmptyState`.
- `BusinessHealthView.tsx` — header → `TracePageHeader` (varian section). Hanya header yang dimigrasi di file ini; body-nya (kpi cards, dimensi, alert) belum disentuh.
- Diverifikasi ulang setelah kedua migrasi: `typecheck:react` PASS, `test:deterministic` PASS (semua), `build:react` PASS.

### 1d. View yang BELUM dimigrasi (21 dari 23, masih pakai pola lama `<div className="trace-card" style={{padding:26}}>`)
```
AccountingView, ActionPlanView, AnalyticsView, CashFlowView, ChartOfAccountsView, DataIntake,
FinanceEntry, FnbTargetPlanner, GovernanceView, InternalDiagnosisView, InventoryView,
LeaderCommandCenterView, MarketingView, OpexDetailView, PayrollView, RecipeCogsView, SalesView,
SopView, StockOpnameView, TaxView, TeamView
```
Plus: `ComingSoonPanel` di `_shared.tsx` punya markup header yang mirip TracePageHeader (fungsi terpisah, bukan view) — belum direfactor untuk pakai TracePageHeader, cek dulu apa manfaatnya sebelum menyentuh (dipakai oleh view placeholder, bukan blocker).

**Alasan berhenti di sini**: user diminta memilih lanjut migrasi semua sekarang vs paketkan progress dulu — user pilih paketkan dulu. Jadi 21 view di atas SENGAJA belum disentuh, bukan lupa.

## 2. Rencana lanjutan Phase 2 (untuk sesi berikutnya)
- Migrasi 21 view sisanya per BATCH KECIL (mis. 3–5 view per batch), jalankan `typecheck:react` + `test:deterministic` + `build:react` di antara tiap batch — JANGAN migrasi semua sekaligus tanpa verifikasi di tengah, supaya kalau ada pola markup yang ternyata beda dari asumsi (lihat kasus `kickerVariant="section"` yang baru ketahuan pas migrasi BusinessHealthView), gampang dilacak batch mana penyebabnya.
- Sebelum migrasi tiap view: cek dulu kicker-nya pakai class apa (`trace-muted` vs `trace-section-kicker` vs kemungkinan varian lain yang belum ketemu) — jangan asumsikan semua "muted".
- Setelah body TracePageHeader semua view beres, baru pertimbangkan migrasi `TraceCard`/`TraceEmptyState` untuk seksi-seksi lain di tiap view (baru KpiTrackingView yang disentuh sejauh ini di luar header).

## 3. Sisa pekerjaan (urutan resmi v2 §6a, diperbarui)
1. Uji RPC 053 ke Supabase live (belum, dari v3) + uji manual alur scope di aplikasi asli (ganti klien → outlet ter-reset; link `?client=&period=` dibuka ulang; klien basi).
2. ~~Putuskan #1 dan #2 v4 §2~~ — SUDAH disetujui user sesi ini (lihat §0 di atas), tapi implementasinya (migration `trace_outlets`, aturan baris finance tanpa outlet) BELUM dikerjakan.
3. **Phase 2 (lanjutan)**: 21 dari 23 view masih perlu dimigrasi ke TraceUI (lihat §1d–§2 di atas).
4. Sisa 5c (asesmen manual tersimpan, sinyal inventory/POS/sosial, AR/AP nyata), lalu Phase 6+8, Acquisition→Klien, Phase 9–11.
5. Sebelum data klien nyata banyak: Phase 17–20 (peran, audit log, RLS live, code-split, regresi).

## 4. Catatan kejujuran
- Migrasi TraceUI baru diverifikasi lewat `typecheck`/`test:deterministic`/`build:react` (semua PASS) — BELUM dirender di browser asli untuk membuktikan zero visual diff. Jangan tandai "migrasi selesai" untuk 2 view yang sudah disentuh sebagai "teruji visual" — baru "teruji tipe & build".
- Semua poin "Catatan kejujuran" v4 §4 tetap berlaku (scope rules diuji perilaku via test_scope.mjs; integrasi React chip/URL/isian awal form belum diuji browser; tidak ada data/migration/RLS dihapus; tidak ada migration baru sesi ini; Node/npm tidak diturunkan; tidak ada dummy data produksi).
- `dist/` di ZIP ini digenerate ulang dari `npm run build:react && npm run build:site` setelah kedua migrasi view di atas.

## 5. PROMPT UNTUK CLAUDE BERIKUTNYA
Kamu melanjutkan aplikasi INTERNAL "TRACE Consultant OS". BACA: `HANDOFF_NEXT_PHASES_v5.md` (ini), lalu v4, v3, v2 (keputusan desain §2, konteks produk §5b–5d), v1. Kode = ZIP `..._v7.zip`. Langkah pertama WAJIB: `npm ci && npm run typecheck:react && npm run test:deterministic && npm run build:react` di environment sendiri sebelum mengklaim apa pun; jika tidak ada jaringan, katakan terus terang.
Prioritas: (a) lanjutkan migrasi 21 view sisanya ke `TraceUI.tsx` per batch kecil dengan verifikasi di antara batch (lihat §1d–§2); (b) minta user menjalankan migration 053 lalu uji "Jadikan tugas" end-to-end (masih belum, dari v3/v4); (c) setelah Phase 2 selesai, lanjut ke migration `trace_outlets` (v4 §2 poin 1, sudah disetujui user) atau sisa 5c sesuai arahan user.
Batasan: jangan rewrite besar; jangan hapus data/migration/RLS; jangan turunkan Node 22.22.2 / npm 10.9.7; jangan dummy data di kode produksi; nilai kosong = "Data belum cukup", bukan 0; jangan klaim PASS tanpa menjalankan tes; jangan klaim "teruji visual" untuk migrasi TraceUI tanpa render browser asli; kirim ZIP baru (v8, …) + HANDOFF baru (tambah, jangan hapus) tiap sesi selesai. Semua tes `tests_core/*.mjs` harus lulus. Bahasa: Indonesia.
