# TRACE v72.1 — Status Integrasi Jujur (2026-09-14)

Dokumen ini ada karena permintaan sebelumnya adalah "perbaiki semua temuan, tanpa kecuali, kirim
zip final" — dan sebagian dari temuan itu punya blocker eksternal yang tidak bisa diselesaikan
dari sandbox mana pun, bukan cuma dari sandbox ini. Menyatakan itu "selesai" akan jadi klaim palsu.
Di bawah ini status per item, apa yang benar-benar dikerjakan di paket ini, dan apa yang masih
butuh tindakan dari kamu di luar sandbox.

## ✅ Selesai di paket ini (bisa diverifikasi lewat kode + tes)

**Akuntansi (Chart of Accounts, Jurnal, Trial Balance) — sekarang punya UI.**
Koreksi atas klaim audit sebelumnya: backend-nya ternyata SUDAH lebih lengkap dari yang saya
laporkan — RPC `trace_seed_default_chart` dan `trace_post_balanced_journal`, plus endpoint baca
`trace_read_client_dataset`, sudah ada dan sudah di-whitelist di `netlify/functions/trace-data.js`
sebelum saya sentuh. Yang betul-betul hilang cuma layar React-nya. Sudah ditambahkan:
`AccountingView` di `src/app/main.tsx` (tab "Akuntansi" baru) — bikin chart of accounts default,
posting jurnal berpasangan (validasi balance di client SEBELUM kirim ke RPC, RPC juga validasi
ulang di server), dan tampilan trial balance real-time dari `buildTrialBalance`. Diverifikasi lewat
`npm run typecheck:react`, `npm run build:core`, dan 4 assertion baru di
`tests_core/react-production-wiring.mjs` — semuanya PASS.
Belum ada di layar ini: UI untuk `calculateRecipeCogs` (COGS resep) — butuh data resep per produk
dari modul inventory yang belum dipetakan ke layar ini. Ditandai jelas di dalam UI-nya sendiri,
bukan disembunyikan.

**xlsx vulnerability — mitigasi parsial, BUKAN patch penuh.**
Versi xlsx yang sudah dipatch (≥0.19.3 untuk prototype pollution, ≥0.20.2 untuk ReDoS) tidak pernah
dipublikasikan ulang ke npm registry publik — SheetJS hanya mendistribusikannya lewat
`cdn.sheetjs.com`. `npm view xlsx versions` dari sandbox ini cuma sampai 0.18.5, dan domain CDN itu
tidak ada di allowlist jaringan saya, jadi saya tidak bisa memasang versi yang sudah dipatch dari
sini. Yang saya lakukan: batas ukuran file (15MB) di `parseWorkbook()`
(`src/core/fileIntakeAdapters.ts`) untuk mengecilkan permukaan serangan ReDoS. Ini TIDAK menutup
celah prototype pollution. **Tindakan yang kamu perlu lakukan sendiri:** dari mesin dengan akses
internet penuh, jalankan `npm install https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz` (cek
versi terbaru di sheetjs.com/xlsx dulu), lalu jalankan ulang `npm audit` untuk konfirmasi.

**Skrip tes RLS nyata — disiapkan, belum dijalankan.**
`tests_real/test_rls_live.mjs` baru: probe RLS terhadap Supabase project SUNGGUHAN (bukan mock),
mengecek user di luar scope client benar-benar ditolak (bukan cuma dapat array kosong tanpa error)
saat baca langsung, baca lewat RPC, maupun posting jurnal. Saya tidak bisa menjalankannya karena
tidak punya kredensial project kamu dan jaringan sandbox ini tidak mengizinkan domain
`*.supabase.co`. **Tindakan kamu:** siapkan staging project + 2 user tes, isi env var yang
disebutkan di kepala file, jalankan `node tests_real/test_rls_live.mjs`.

## 🔴 Scaffold saja — sengaja TIDAK berfungsi sampai kamu isi kredensial

**POS Moka/Pawoon** (`netlify/functions/pos-adapter-moka.js`,
`netlify/functions/pos-adapter-pawoon.js`): mengembalikan HTTP 501 sampai `MOKA_API_KEY` /
`PAWOON_API_KEY` diisi. Ini bukan bug. Approval partner API dari Moka/Pawoon adalah proses bisnis
eksternal dengan perusahaan tersebut — tidak ada kode yang bisa mem-bypass itu. Bahkan setelah
kredensial ada, mapping field di file itu masih placeholder dan HARUS diverifikasi ulang terhadap
dokumentasi resmi mereka (saya tidak punya akses ke dokumentasi partner mereka untuk memverifikasi
bentuk response sungguhan).

**Social media health check (Instagram/TikTok API resmi):** tidak disentuh di paket ini. Akses ke
Graph API (Meta) dan TikTok Business API mensyaratkan app review dan OAuth token dari akun bisnis
milik klien TRACE — dua hal yang tidak bisa saya buat atau palsukan dari sini. Catatan: modul
Acquisition (`acq-social-intel.js`) sudah melakukan fetch nyata ke halaman publik Instagram
(scraping HTML publik, bukan API resmi) — itu tetap berjalan seperti sebelumnya dan tidak diklaim
sebagai pengganti API resmi.

## ✅ Ditambahkan setelah dokumen ini pertama ditulis (2026-09-14, sesi lanjutan)

**Download Dashboard Excel dengan chart (gambar statis) — sudah jalan, bukan mock.**
Tombol baru "Download Dashboard Excel (chart gambar)" di tab Keuangan → `exportFinanceDashboardExcel`
(`src/core/financeReport.ts`). Pakai `exceljs`, BUKAN `xlsx` — README `xlsx` sendiri menyebut
"images/graphs" sebagai fitur SheetJS Pro (berbayar), jadi library lama tidak bisa menulis gambar
sama sekali. `exceljs.addImage()` diverifikasi nyata: ditulis lalu dibaca ulang file .xlsx-nya, dan
gambar terbukti selamat round-trip (bukan cuma asumsi dari dokumentasi).
Pemisahan sengaja dibuat: `computePieSlices()` (matematika persentase/sudut) murni dan sudah
di-unit-test (`tests_core/test_chart_render.mjs`, masuk `npm run test:deterministic`).
`renderPieChartPng()` menggambar ke `<canvas>` — ini **hanya bisa jalan di browser**, dan sandbox
saya tidak punya browser untuk menjalankannya. Jadi: matematikanya terverifikasi lewat tes,
`exceljs` writeBuffer+addImage terverifikasi lewat round-trip nyata, tapi langkah canvas-menggambar
itu sendiri baru lolos `tsc` (typecheck), belum pernah benar-benar dijalankan sampai sekarang.
**Yang perlu kamu cek manual sekali** setelah `npm run build:react`: buka tab Keuangan, isi minimal
satu record COGS/Labor/OPEX untuk satu periode, klik tombolnya, lalu buka file .xlsx yang terunduh
dan pastikan gambar pie chart-nya benar-benar muncul di sheet "Dashboard" — itu satu-satunya bagian
yang belum saya buktikan jalan di browser sungguhan.
Chart-nya gambar statis (PNG), bukan native Excel chart yang bisa di-"Edit Data" — ini pilihan yang
kamu setujui sendiri (opsi 1 dari 3 yang saya tawarkan), bukan keterbatasan yang saya sembunyikan.

Item di atas bukan soal urutan prioritas — itu tergantung akses yang tidak saya miliki: kredensial
API pihak ketiga, approval dari Moka/Pawoon/Meta/TikTok, dan kredensial Supabase project kamu.
Mengklaim ini "selesai semua" di zip ini berarti saya mengarang. Yang bisa saya pastikan: setiap
baris di atas bisa kamu cek sendiri (jalankan test, baca kode, lihat status HTTP 501), bukan cuma
klaim di dokumen ini.
