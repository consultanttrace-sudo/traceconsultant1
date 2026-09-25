> **[DIHENTIKAN — baca STATUS.md]** Rantai `HANDOFF_NEXT_PHASES_v*.md` tidak dilanjutkan lagi mulai 2026-09-21. File ini disimpan sebagai arsip historis (keputusan desain & konteks di dalamnya tetap berlaku kecuali dikoreksi di `STATUS.md`), tapi status terkini HANYA ada di `STATUS.md` di root repo.

# TRACE Consultant OS — HANDOFF v2 (dibuat 2026-09-21, setelah sesi redesain UI)

Menggantikan `HANDOFF_NEXT_PHASES.md` (v1). Sumber kebenaran tetap KODE di ZIP `traceconsultant1-main_PHASE2_redesign_v4.zip` (versi terbaru saat dokumen ini ditulis; nama berversi supaya tidak tertukar).

## 1. Status ringkas
| Phase | Status | Catatan |
|---|---|---|
| 0 Audit, 1 Runtime/build | SELESAI (sesi lama) | lihat PHASE0_*.md, PHASE1_*.md |
| 2 Shell + design system | SEBAGIAN | shell baru + token + komponen dashboard selesai; komponen reusable umum & migrasi warna view BELUM |
| 3 Login/boot/greeting | BELUM | |
| 4 Context global | SEBAGIAN | HANYA klien global (URL `?client=`). Periode, outlet, role, previousPeriod BELUM |
| 5 Overview | SEBAGIAN | portofolio kesehatan klien + ANTREAN KERJA lintas klien (dari `trace_collaboration_tasks`) selesai; sparkline per klien, timeline/tahapan per klien, klik kartu→modul+context penuh BELUM |
| 6–20 | BELUM | tidak disentuh |

## 2. KEPUTUSAN DESAIN (dari user, mengalahkan v1)
- Visual = 4 gambar referensi "Environmental Risk Overview" (TEMA TERANG, bukan dark seperti tertulis di v1 Phase 2): frame putih membulat di atas latar abu-hangat, kartu putih radius ~22px, judul serif (Newsreader), rail ikon kiri, tombol utama near-black, warna hanya untuk status.
- Palet status tunggal (`STATUS_META` di `components/icons.tsx`): Sehat hijau, Sedang amber, Tinggi oranye, Kritis merah, "Data belum cukup" teal. Skor ≥80 sehat, ≥60 sedang, ≥40 tinggi, <40 kritis.
- Konten referensi (risiko lingkungan) DIADAPTASI ke fitur TRACE, bukan disalin: peta relief = treemap klien (luas = revenue), dot matrix = eksposur risiko per klien, tren = operating margin portofolio.
- View lama ternyata SUDAH light (`#fff`, `#171717`, `rgba(23,23,23,.08)` inline), jadi tidak rusak di shell baru.

## 3. Yang sudah dikerjakan (file)
Baru: `src/core/portfolioHealth.ts` (model murni), `src/core/workQueue.ts` (antrean kerja: overdue/blocked/hari ini/minggu ini, klien tanpa tugas), tes `test_work_queue.mjs`, `src/app/portfolio.tsx` (provider), `src/app/clientScope.ts` (store klien global + URL), `src/app/components/{icons,dash,OverviewDashboard,TraceShell}.tsx`, `src/styles/dashboard.css`, tes `tests_core/{test_portfolio_health,test_shell_navigation,test_client_scope_static}.mjs`.
Diubah: `main.tsx` (shell baru, rail 6 grup + Data Intake + Sistem, flyout, topbar, provider lazy), `views/OverviewLive.tsx` (dashboard baru; `TraceOrbitHero` Three.js TIDAK dipakai lagi tapi masih ter-export), `styles/tokens.css` (ditulis ulang), `react-app/index.html` (Google Fonts Inter+Newsreader), `sw.js` (cache v17→v18), `package.json` (3 tes baru di `test:deterministic`), 18 view (`useState('')` klien → `useClientScope()`), `FinanceEntry.tsx` (prefill dari scope, sinkron saat pilih klien).
Catatan: `dist/core/portfolioHealth.js` dikompilasi manual; `_diagnostic-manifest.json` digenerate ulang.

## 4. Fakta penting yang ditemukan
- API `trace-data` MENOLAK data lintas klien dalam satu request → Overview memuat per klien (`loadTraceCollections([], ['finance','alerts'], clientId)`), maks 40 klien, 4 paralel. Daftar klien dimuat eager (1 request); data per klien hanya setelah Overview dibuka.
- Skor Overview = `buildBusinessHealth` dengan evidence finance saja; POS & inventory ditandai "unavailable" → confidence ±33% (bukan 100%). Skor dibulatkan integer.
- `buildBusinessHealth` LONGGAR: COGS 41% (target ≤35%) masih bisa "Sehat" → Klien Berisiko bisa 0% sementara insight bilang COGS melewati target. Rumus skor BELUM diubah (keputusan produk).
- Insight/impact = aturan (bukan AI); label "bukan analisis AI" ada di UI.
- Modul yang memakai klien global: 18 view + FinanceEntry. TIDAK ikut: DataIntake (pakai `organizationId` sendiri), TaxView (tak berklien).

## 5. NOT VERIFIED (jangan ditandai PASS)
- `npm ci`, `typecheck:react`, `build:site`, `release:preflight` TIDAK pernah dijalankan (sandbox tanpa jaringan/node_modules). Yang dijalankan: 22 tes `tests_core` (semua lulus), typecheck parsial pakai stub React, cek sintaks esbuild semua view.
- Screenshot berasal dari harness lokal dengan DATA CONTOH + ikon/label pengganti, bukan dari aplikasi utuh.
- Pemuatan per klien dari Supabase, filter via URL, sinkron klien antar halaman: belum diuji manual. `tests_real/*` butuh Supabase live.
- Kontras/keyboard/reduced-motion belum diaudit (ada `prefers-reduced-motion` global dan aria dasar).

## 5b. KONTEKS PRODUK (dijawab user 2026-09-21)
TRACE Consultant OS = aplikasi INTERNAL perusahaan TRACE Consultants (dipakai tim konsultan, BUKAN dipakai klien). Alur kerja yang harus lengkap di satu aplikasi: cari klien (Acquisition) → jadi klien → cek kesehatan klien → timeline kerja jelas per klien → semua pekerjaan/tugas tercatat di dalam aplikasi, supaya tim bisa pegang banyak klien tanpa pindah-pindah aplikasi atau mikir manual.
Konsekuensi: (1) yang paling bernilai = "apa yang harus dikerjakan berikutnya untuk tiap klien" (timeline + antrean kerja lintas klien); (2) UX harus sederhana, tidak "loncat-loncat" (umpan balik sebelumnya: terlalu rumit); tiap layar menjawab: kondisi → penyebab → tindakan; (3) tidak ada akses klien eksternal, tetapi data keuangan klien sensitif dan beberapa konsultan bisa memakai → peran leader vs staff + audit log tetap perlu, hanya bukan prioritas pertama.

## 5c. JALUR KERJA MENGIKUTI KONDISI KLIEN (dijawab user 2026-09-21)
Tidak ada template tetap. Jalur kerja tiap klien ditentukan oleh kerusakannya: pembukuan/COGS, kebocoran cashflow, OPEX, ERP/POS, sistem operasional, labor, atau pertumbuhan (sepi pelanggan, branding, media sosial tidak rapi, konten tidak jalan, feed berantakan). Bisa satu area, beberapa, atau "kerja total".
SUDAH (v3): `src/core/workstreams.ts` + `tests_core/test_workstreams.mjs` + kartu "Jalur Kerja" di Overview. 10 jalur; menyala HANYA bila ada bukti data (COGS/OPEX/Labor vs target businessHealth, margin <0 atau <10%, revenue turun ≥10% dalam 3 periode, data finance tidak lengkap). Mode: ≥4 jalur menyala = "Kerja total", 1–3 = "Fokus", 0 = "Stabil", tanpa data terukur = "Belum bisa dinilai". Pilih klien → jalur lengkap + alasan; semua klien → rollup jalur × jumlah klien.
Area TANPA data otomatis (Inventory & Purchasing, ERP/POS, Branding, Media Sosial & Konten) ditandai "perlu asesmen langsung" — tidak ditebak. Ambang tambahan ada di `WORKSTREAM_THRESHOLDS` (weakMargin 10%, revenueDrop 10%/3 periode) — konfirmasi ke user.
BELUM: (1) simpan hasil asesmen manual (feed rapi/tidak, brand dikenal/tidak) — opsi: client KV via RPC `trace_upsert_client_kv` (perlu tambah key ke allow-list `CLIENT_SCOPED_KEYS` di trace-data.js) atau tabel baru; JANGAN diuji tanpa Supabase live; (2) ubah jalur menyala → tugas di `trace_collaboration_tasks` (owner, due, evidence) = timeline per klien; (3) sinyal otomatis untuk inventory/POS (sudah ada resource pos_events, inventory_movements) dan sosial/konten (resource content_*, social_accounts sudah ada di backend, UI belum ada); (4) cashflow sebenarnya (AR/AP/kas) — jalur "Profitabilitas & Kebocoran Cashflow" saat ini hanya dari margin.

## 5d. PRINSIP: SETIAP INFORMASI BISA DIKLIK → MODUL PENGERJAAN + KONTEKS KLIEN (permintaan user 2026-09-21)
Berlaku untuk SEMUA fitur, bukan hanya Overview. Mekanisme: `onOpenFor(moduleId, clientId)` di OverviewLive = `setClientScope(clientId)` lalu navigasi (klien global lihat `clientScope.ts`).
SUDAH di Overview (v4): kartu skor/klien berisiko/alert/cakupan data → Business Health / Data Intake; baris Prioritas Klien → modul sesuai temuan (COGS→Recipe COGS, Labor→Payroll, OPEX→OPEX Detail, margin→Arus Kas, data kurang→Keuangan, alert→Business Health); Jalur Kerja (tiap jalur → modul: `WORKSTREAMS[].module`, termasuk area asesmen manual); antrean tugas → Business Twin. Tes: `test_shell_navigation.mjs` memastikan semua tujuan ada di nav.
BELUM: (1) halaman lain (30 view) belum punya tautan keluar dari angka/insight-nya (mis. dimensi di Business Health → modul perbaikannya, KPI → Action Plan); (2) tautan belum membawa PERIODE/bagian spesifik (mis. langsung ke COGS periode 2026-08) — butuh periode global (Phase 4); (3) Data Intake tidak memakai klien global sehingga tiba tanpa klien terpilih; (4) peta/dot matrix/tren: klik hanya memilih klien (fokus), belum membuka modul; (5) tombol "kembali ke Overview dengan konteks" belum ada.
ATURAN UNTUK SEMUA FITUR BARU: setiap angka/status/temuan wajib punya tujuan klik (modul + klien [+ periode]) dan tes yang memastikan tujuan itu ada.

## 6a. JALUR PENDEK (URUTAN RESMI — pakai ini, bukan 20 phase berurutan)
Keputusan user: 20 phase terlalu panjang; kerjakan jalur pendek, sisanya NANTI.
1. **Verifikasi build/deploy** hasil sekarang (6A di bawah). Tidak boleh dilewati.
2. **Phase 4 + 2 (selesaikan)**: periode/outlet global + tampilan seragam di semua halaman.
3. **Jalur kerja → tugas/timeline per klien** (jalur otomatis SUDAH ada, lihat 5c; sisa: simpan asesmen manual + ubah jalur jadi tugas)** — semula: **Timeline per klien** (Phase 5 sisa + Phase 12) — ANTREAN KERJA lintas klien sudah ada di Overview (kartu 'Antrean Kerja', klik baris → Business Twin klien tsb). Sisa: tahapan/timeline pendampingan per klien, buat/ubah tugas dari antrean (saat ini tugas hanya dibuat di Business Twin), nama pemilik tugas (saat ini hanya `owner_user_id`, belum ditampilkan), tugas dari diagnosis/health/SOP/action plan. Semula: jadwal/tahapan pendampingan tiap klien, tugas dari diagnosis/health/manual (owner, due, status), tampilan lintas klien "hari ini apa yang harus dikerjakan". Inti kebutuhan user.
4. **Phase 6 + 8**: Business Health (status, why, impact, required data, action) + Finance/Accounting; alur sederhana Revenue kotor → Revenue bersih → Net Profit.
5. **Alur Acquisition → Klien** (bagian Phase 13): audit lead→klien, PROVIDER UNAVAILABLE bukan 0 lead.
6. **Phase 9–11** (Recipe/Inventory, Payroll/OPEX, Sales/Target): urutan ditanyakan ke user.
**NANTI**: Phase 3 login/greeting; Phase 7 Business Twin; Phase 14–15 AI Advisor/Guardian; Phase 16 data intake quality (kecuali importer masih gagal membaca file user).
**Sebelum menambah anggota tim / data klien nyata banyak**: Phase 17 (peran leader vs staff, audit log, RLS live), Phase 18 (code-split), Phase 19 (regresi), Phase 20 (audit rilis).

## 6. Sisa pekerjaan (rincian; urutan resmi ada di 6a)
**A. Verifikasi dulu (wajib sebelum lanjut)**: jalankan di mesin user `npm ci && npm run typecheck:react && npm run test:deterministic && npm run build:site && npm run release:preflight`; perbaiki error tipe (mis. tipe event handler, `_ignored` di portfolio.tsx). Minta screenshot aplikasi asli dari user, bandingkan dengan referensi.
**B. Lanjut Phase 4**: periode global (+previousPeriod). TEMUAN: bukan refactor mekanis — hanya 6 view punya `useState` periode sederhana (BusinessDiagnosis, CashFlow, FnbTargetPlanner, KpiTracking, OpexDetail, Tax) dengan default berbeda (kosong vs bulan berjalan), sedangkan Finance/Health/Accounting memakai `draft.period`/periode turunan. Rancang `usePeriodScope(default)` opt-in per view + aturan default, jangan paksa satu default, outlet global (reset saat ganti klien), role/user; `TraceClientSelector/OutletSelector/PeriodSelector` menggantikan `<select>` per view; deep link membawa context; tes isolasi antar klien (perilaku, bukan string-match); validasi client id basi dari URL di modul.
**C. Lanjut Phase 2**: komponen reusable (TracePageHeader, TraceCard, TraceMetric, TraceStatusBadge, TraceEmptyState/LoadingState/ErrorState, TraceDrawer, TraceDataIssue…) dengan gaya referensi; terapkan header serif + kartu baru ke 30 view lain; migrasi warna hardcode view ke token.
**D. Lanjut Phase 5**: filter ke-4 (status), work queue dari task/aksi/diagnosis nyata, sparkline hanya dari data nyata, klik kartu → modul + context, rentang 7D/30D/3M/6M/12M jika data harian ada, orb/dot matrix lebih dekat referensi.
**E. Kemudian Phase 3, 6–20** sesuai v1 (definisi selesai: UI → logic → DB/API → persistence → reload → navigasi → evidence → tes). Phase 18: bundle utama ±1.2 MB belum di-code-split.

## 7. Catatan kejujuran
Tidak ada phase 3, 6–20 yang dikerjakan. Jangan klaim PASS tanpa eksekusi. Jangan dummy data di kode produksi (fixture hanya di tes/harness). Jangan hapus data/migration/RLS; jangan turunkan Node 22.22.2 / npm 10.9.2.

## 8. PROMPT UNTUK CLAUDE BERIKUTNYA (salin ke chat/akun baru)
Kamu melanjutkan pekerjaan di aplikasi INTERNAL "TRACE Consultant OS" (dipakai tim TRACE Consultants untuk cari klien, pegang banyak klien F&B, cek kesehatan klien, dan mengerjakan perbaikan lengkap di satu aplikasi). Kamu TIDAK punya riwayat chat sebelumnya; semua konteks ada di file yang diunggah: (1) `traceconsultant1-main_PHASE2_redesign_v4.zip` = kode aktual (sumber kebenaran), (2) `HANDOFF_NEXT_PHASES_v2.md` = BACA PERTAMA (status, keputusan, temuan, sisa kerja, bagian 5b–5d, 6a), (3) `HANDOFF_NEXT_PHASES.md` (v1, phase 0–20), (4) 4 gambar referensi dashboard "Environmental Risk Overview" = acuan visual (TEMA TERANG; jangan ubah ke dark; adaptasikan isinya ke fitur TRACE, bukan disalin).
Aturan kerja: ikuti URUTAN di bagian 6a (jalur pendek), bukan 20 phase berurutan. Langkah pertama: verifikasi build (`npm ci`, `npm run typecheck:react`, `npm run test:deterministic`, `npm run build:react`) — jika tidak ada jaringan, katakan terus terang bahwa build tidak bisa dijalankan dan JANGAN mengklaim PASS. Langkah fitur berikutnya yang disarankan: ubah jalur kerja yang menyala (`src/core/workstreams.ts`) menjadi tugas nyata di `trace_collaboration_tasks` (owner, due, evidence) = timeline per klien, memakai pola pembuatan tugas yang sudah ada di `BusinessTwinView.tsx`; lalu tautan keluar (setiap angka/insight → modul + klien [+ periode], lihat 5d) di halaman lain; lalu periode/outlet global.
Prinsip produk: jalur kerja MENGIKUTI KONDISI KLIEN (bukan template); satu area, beberapa, atau "kerja total"; area tanpa data otomatis (branding, feed, konten, ERP, inventory) = "perlu asesmen langsung", jangan ditebak; UX sederhana, tidak "loncat-loncat" (tiap layar: kondisi → penyebab → tindakan); setiap informasi bisa diklik ke modul pengerjaan dengan konteks klien.
Batasan: jangan rewrite besar-besaran; jangan hapus/reset data, migration, atau RLS; jangan turunkan Node 22.22.2 / npm 10.9.2; jangan dummy data di kode produksi (fixture hanya di tes/harness); nilai kosong tampil "Data belum cukup"/INSUFFICIENT DATA, bukan 0; skor hanya dari evidence yang tersedia; jangan klaim PASS tanpa menjalankan tes; sebutkan jelas apa yang tidak bisa diverifikasi. Tiap langkah: audit → implement → test → verify → report; kirim ZIP penuh BERNAMA VERSI BARU (v5, v6, …) + daftar sisa kerja + perbarui HANDOFF (tambahkan, jangan hapus yang masih berlaku). Semua tes `tests_core/*.mjs` harus tetap lulus (24 saat ini).
Sumber data: API `trace-data` menolak data lintas klien, jadi selalu ambil per klien. Klien terpilih dibagi lewat `src/app/clientScope.ts`. Bahasa antarmuka dan komunikasi: Indonesia.
