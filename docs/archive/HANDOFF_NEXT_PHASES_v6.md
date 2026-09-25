> **[DIHENTIKAN — baca STATUS.md]** Rantai `HANDOFF_NEXT_PHASES_v*.md` tidak dilanjutkan lagi mulai 2026-09-21. File ini disimpan sebagai arsip historis (keputusan desain & konteks di dalamnya tetap berlaku kecuali dikoreksi di `STATUS.md`), tapi status terkini HANYA ada di `STATUS.md` di root repo.

# TRACE Consultant OS — HANDOFF v6 (dibuat 2026-09-21, sesi lanjutan Phase 2: migrasi header ke TraceUI SELESAI untuk 22/23 view)

Menggantikan v5 untuk status terbaru; v5, v4, v3, v2, v1 tetap dibaca untuk konteks (keputusan desain v2 §2, fakta produk v2 §5b–5d, sejarah phase, keputusan v4 §2 yang sudah disetujui user — lihat v5 §0). Sumber kebenaran = KODE di ZIP `traceconsultant1-main_PHASE2_redesign_v8.zip`.

## 1. YANG SELESAI SESI INI — Phase 2 (migrasi header), TUNTAS untuk 22 dari 23 view

### 1a. Ringkasan
Melanjutkan dari v5 (baru 2/23 view: KpiTrackingView, BusinessHealthView). Sesi ini memigrasikan **20 view tambahan** ke `TracePageHeader` per batch kecil (3 batch: 10 + 8 + 4 view), dengan `typecheck:react` + `test:deterministic` + `build:react` dijalankan sungguhan di antara TIAP batch — semua PASS di tiap titik verifikasi, tidak ada batch yang gagal lalu di-rollback.

### 1b. View yang SUDAH dimigrasi (22 dari 23)
Batch dari v5 (2): `KpiTrackingView`, `BusinessHealthView`.
Batch 1 sesi ini (10): `AccountingView`, `ActionPlanView`, `AnalyticsView`, `FinanceEntry`, `FnbTargetPlanner`, `InternalDiagnosisView`, `MarketingView`, `OpexDetailView`, `SopView`, `StockOpnameView`.
Batch 2 sesi ini (6): `PayrollView`, `SalesView`, `TeamView`, `LeaderCommandCenterView`, `GovernanceView`, `InventoryView`.
Batch 3 sesi ini (4): `CashFlowView`, `ChartOfAccountsView`, `RecipeCogsView`, `TaxView`.

Semua migrasi di atas HANYA menyentuh blok header (`TracePageHeader`), kecuali `KpiTrackingView` yang tambahan juga memakai `TraceCard`+`TraceEmptyState` untuk filter bar & pesan kosong (lihat v5 §1c) — body view lain BELUM disentuh/dimigrasi ke `TraceCard`/`TraceEmptyState`.

### 1c. View yang SENGAJA TIDAK dimigrasi: `DataIntake.tsx`
Header `DataIntake` beda struktur dari 22 view lain: ada banner kondisional `{recovered&&<div className="trace-recovery-banner">↻ Draft lokal dipulihkan otomatis · <button ...>tutup</button></div>}` yang terselip DI ANTARA `<h1>` judul dan `<div className="trace-muted">` deskripsi — bukan cuma kicker+title+description tetap seperti view lain. `TracePageHeader` saat ini hanya punya 3 slot tetap (kicker/title/description) dan tidak punya slot untuk elemen kondisional di tengah. Memaksakan banner itu masuk ke slot `description` akan mengubah struktur DOM (banner jadi ikut terbungkus div `trace-muted` yang salah, atau urutan berubah) — risiko regresi visual pada satu-satunya alur upload data klien di aplikasi ini dianggap tidak sepadan dengan manfaat migrasi kosmetik. **Keputusan: dibiarkan pakai markup lama.** Kalau nanti mau dimigrasi juga, opsinya: (a) tambah prop opsional `extra?: ReactNode` ke `TracePageHeader` yang dirender antara title dan description, atau (b) biarkan DataIntake permanen jadi pengecualian karena kasusnya memang unik (satu-satunya view dengan banner recovery).

Catatan tambahan: `ComingSoonPanel` di `_shared.tsx` (fungsi placeholder untuk view yang belum dibangun, BUKAN salah satu dari 23 view) juga masih pakai markup manual yang mirip `TracePageHeader` — belum direfactor, bukan blocker, disebut di v5 §1d.

### 1d. Detail teknis migrasi yang perlu diketahui sesi berikutnya
- **Karakter yang perlu dikonversi saat pindah dari JSX children ke atribut string** (`title="..."`, `description="..."`): `&amp;` di teks asli (karena ditulis sebagai JSX text) HARUS jadi `&` biasa kalau dipindah ke atribut string JS — kalau tetap `&amp;` di dalam string, akan tampil literal "&amp;" di layar (regresi visual). Ditemukan di `PayrollView` ("THR &amp; lembur") dan `RecipeCogsView` ("Inventory &amp; Recipe") — sudah dikonversi dengan benar.
- **Teks yang mengandung tanda kutip ganda** (`"kata"`) tidak bisa langsung jadi `description="...ada "kutip" di tengah..."` (rusak sintaks JSX). Solusi dipakai: bungkus jadi `description={'...ada "kutip" di tengah...'}` (kutip tunggal sebagai delimiter JS string). Ditemukan di `ActionPlanView`, `SopView`, `SalesView`, `CashFlowView`.
- **Teks yang mengandung ekspresi dinamis** (mis. `{previewRows.length||28}`) atau tag inline (mis. `<strong>...</strong>`) TIDAK BISA jadi string atribut biasa — harus `description={<>...teks... {expr} ...tag...</>}` (JSX fragment). Ditemukan di `ChartOfAccountsView` (ekspresi dinamis) dan `TaxView` (tag `<strong>`).
- Sebelum migrasi tiap view, selalu cek dulu apakah kicker-nya `trace-muted` (default `kickerVariant="muted"`) atau `trace-section-kicker` (`kickerVariant="section"`) — jangan asumsikan. Semua 20 view batch ini pola muted; hanya `BusinessHealthView` (dari v5, dan 3 lainnya yang TIDAK ada di 23 daftar view: `BusinessDiagnosis`, `BusinessTwinView`, `DataRecovery` — belum dimigrasi karena bukan bagian dari daftar 23 view utama, cek relevansinya nanti) yang pakai varian section.

### 1e. Verifikasi (dijalankan sungguhan tiap akhir batch, node v22.22.2 / npm 10.9.7)
```
npm run typecheck:react      → PASS (0 error) — di setiap dari 3 batch
npm run test:deterministic   → PASS (semua assertion) — di setiap dari 3 batch
npm run build:react          → PASS — di setiap dari 3 batch
npm run build:site           → PASS (final, setelah batch 3)
npm run release:preflight    → PASS (verify:runtime + verify:dependencies ok:true, final)
```
TETAP BELUM diverifikasi: render browser asli (jadi zero-visual-diff untuk 22 view yang dimigrasi BELUM dibuktikan visual, baru "lolos tipe & build" — sama seperti catatan v5), Supabase live (RPC 053 dari v3), kontras/keyboard/reduced-motion.

## 2. Rencana lanjutan Phase 2
- Migrasi body view (bukan cuma header) ke `TraceCard`/`TraceEmptyState` — baru `KpiTrackingView` yang disentuh di luar header sejauh ini. 21 view lain masih pakai `<div className="trace-card">` manual untuk seksi kontennya.
- Opsional: tangani `DataIntake` (lihat §1c opsi a/b) dan `ComingSoonPanel` di `_shared.tsx` kalau dianggap perlu.
- Cek apakah `BusinessDiagnosis`, `BusinessTwinView`, `DataRecovery` termasuk scope Phase 2 (mereka bukan bagian dari 23 view yang disebut v4 §3.3, tapi punya pola header serupa — kicker section) — klarifikasi ke user kalau perlu.
- Setelah body semua view beres, baru render manual di browser asli untuk konfirmasi zero visual diff (item ini sudah 2 sesi berturut belum dikerjakan — jangan biarkan menumpuk terus tanpa kepastian).

## 3. Sisa pekerjaan (urutan resmi v2 §6a, diperbarui)
1. Uji RPC 053 ke Supabase live (belum, dari v3) + uji manual alur scope di aplikasi asli (ganti klien → outlet ter-reset; link `?client=&period=` dibuka ulang; klien basi) + verifikasi visual migrasi TraceUI di browser asli (baru ditambahkan sesi ini — makin menumpuk, prioritaskan kalau ada akses browser nyata).
2. Keputusan v4 §2 poin 1–2 sudah disetujui user (lihat v5 §0); implementasinya (migration `trace_outlets`, aturan baris finance tanpa outlet) BELUM dikerjakan.
3. **Phase 2**: header 22/23 view SELESAI. Sisa: body view ke TraceCard/TraceEmptyState (opsional/lanjutan), DataIntake (opsional, lihat §1c).
4. Sisa 5c (asesmen manual tersimpan, sinyal inventory/POS/sosial, AR/AP nyata), lalu Phase 6+8, Acquisition→Klien, Phase 9–11.
5. Sebelum data klien nyata banyak: Phase 17–20 (peran, audit log, RLS live, code-split, regresi).

## 4. Catatan kejujuran
- 22 dari 23 header view dimigrasi dan lolos `typecheck`/`test:deterministic`/`build:react`/`build:site`/`release:preflight` — TAPI belum dirender di browser asli. Jangan klaim "migrasi visual terverifikasi" sampai itu dilakukan.
- `DataIntake` sengaja TIDAK dimigrasi (lihat §1c) — ini keputusan desain, bukan terlewat.
- Semua poin "Catatan kejujuran" v5 §4 dan v4 §4 tetap berlaku (scope rules diuji perilaku; integrasi React chip/URL/isian awal form belum diuji browser; tidak ada data/migration/RLS dihapus; tidak ada migration baru sesi ini; Node/npm tidak diturunkan; tidak ada dummy data produksi).
- `dist/` di ZIP ini digenerate ulang dari `npm run build:react && npm run build:site` setelah SEMUA migrasi sesi ini (bukan per-batch).

## 5. PROMPT UNTUK CLAUDE BERIKUTNYA
Kamu melanjutkan aplikasi INTERNAL "TRACE Consultant OS". BACA: `HANDOFF_NEXT_PHASES_v6.md` (ini), lalu v5, v4, v3, v2 (keputusan desain §2, konteks produk §5b–5d), v1. Kode = ZIP `..._v8.zip`. Langkah pertama WAJIB: `npm ci && npm run typecheck:react && npm run test:deterministic && npm run build:react` di environment sendiri sebelum mengklaim apa pun; jika tidak ada jaringan, katakan terus terang.
Prioritas: (a) kalau ada akses browser nyata, verifikasi visual 22 view yang sudah dimigrasi ke TraceUI (lihat §1b) — ini sudah menumpuk 2 sesi; (b) migrasi body view (bukan cuma header) ke TraceCard/TraceEmptyState kalau user minta lanjut Phase 2 lebih dalam; (c) minta user menjalankan migration 053 lalu uji "Jadikan tugas" end-to-end (masih belum, dari v3/v4/v5); (d) migration `trace_outlets` (v4 §2 poin 1, sudah disetujui user) atau sisa 5c sesuai arahan user.
Batasan: jangan rewrite besar; jangan hapus data/migration/RLS; jangan turunkan Node 22.22.2 / npm 10.9.7; jangan dummy data di kode produksi; nilai kosong = "Data belum cukup", bukan 0; jangan klaim PASS tanpa menjalankan tes; jangan klaim "teruji visual" untuk migrasi TraceUI tanpa render browser asli; saat memigrasi teks JSX ke atribut string, ikuti aturan konversi di §1d (entity &amp;→&, kutip ganda→bungkus kutip tunggal, ekspresi dinamis/tag inline→JSX fragment); kirim ZIP baru (v9, …) + HANDOFF baru (tambah, jangan hapus) tiap sesi selesai. Semua tes `tests_core/*.mjs` harus lulus. Bahasa: Indonesia.
