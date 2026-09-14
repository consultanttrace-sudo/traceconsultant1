# Prompt: Fitur Analisa Konten & Medsos untuk TRACE Consultants OS

Gunakan prompt ini di Claude Code (atau sesi Claude lain) yang punya akses ke repo
`trace-consultant-os` untuk mulai membangun fitur ini.

---

## Konteks project

TRACE Consultants OS adalah aplikasi internal Trace Consultants (bisnis konsultan
F&B) berbasis TypeScript/React + Supabase, dengan modul-modul yang sudah ada:
`core/diagnosis.ts`, `core/evidence.ts`, `core/aiDiagnostic.ts`,
`core/diagnosticCenter.ts`, `core/acquisition.ts`, `core/finance.ts`,
`core/dataIntake.ts`, `core/marketing.ts`, `core/kpi.ts`. Sistem role sudah ada
untuk "ordinary authenticated user" vs "leader/team". Filosofi inti codebase ini:
**tidak ada klaim AI tanpa bukti data yang bisa diverifikasi user** (lihat pola
"React truthfulness guard" dan "Diagnostic live bridge/redaction" di tests_core).

## Fitur yang diminta

Modul baru: **Analisa Konten & Medsos** — menganalisis performa konten media sosial
(Instagram/TikTok/YouTube) dan menghubungkannya ke leads dan omset riil, dipakai
oleh dua jenis user:

1. **Internal Trace Consultants** — tim consultant, butuh lihat semua klien,
   detail teknis lengkap, reasoning AI mentah, untuk meracik strategi.
2. **Klien konsultan Trace** — tiap klien F&B yang jadi pelanggan Trace, cuma
   boleh lihat data akun medsos miliknya sendiri, dalam bentuk laporan yang lebih
   ringkas/dipoles (bukti hasil kerja + ROI jasa konsultan).

## Arsitektur yang harus diikuti

### 1. Data layer
- Tarik data lewat API resmi platform: Instagram Graph API, TikTok API, YouTube
  Data API. Jangan scraping.
- Simpan metrik mentah (views, retention curve, completion rate, waktu posting,
  engagement) di tabel Supabase baru, migration menyusul nomor setelah migration
  014 yang sudah ada.
- Setiap baris data terikat ke `client_id`, bukan cuma `user_id` — lihat poin
  multi-tenant di bawah.

### 2. Attribution layer (konten → lead → omset)
- Setiap konten dapat UTM link/tracking unik.
- Klik dari link ini masuk sebagai lead baru lewat lifecycle yang sudah ada di
  `core/acquisition.ts` (pola `none → draft → reviewed → approved` yang sudah
  dipakai Data Intake — reuse pola yang sama, jangan bikin lifecycle baru).
- Lead yang closing tertaut ke `core/finance.ts` supaya bisa dihitung kontribusi
  omset per konten.

### 3. Evidence-first AI analysis (WAJIB, ini bukan opsional)
- AI TIDAK BOLEH mengeluarkan kesimpulan yang tidak tertaut ke angka yang
  ditampilkan ke user di layar yang sama.
- Urutan render selalu: tampilkan data mentah (chart retention, tabel
  perbandingan) DULU, baru narasi AI di bawah/sampingnya, dengan setiap klaim
  merujuk ke elemen data spesifik (mis. "retention drop 40% di detik ke-3" harus
  ada chart retention yang menunjukkan angka itu).
- Ikuti pola `core/evidence.ts` dan `core/aiDiagnostic.ts` yang sudah ada —
  jangan bikin engine evidence baru dari nol, extend yang sudah ada kalau bisa.

### 4. Feedback loop / kalibrasi
- Simpan histori: rekomendasi AI apa yang diberikan (misal "posting jam 20:00")
  vs hasil aktual setelah rekomendasi itu dijalankan.
- Tampilkan skor akurasi historis rekomendasi ke user (mis. "rekomendasi jam
  posting akurat 78% dari 40 percobaan") sebagai bentuk trust jangka panjang,
  bukan janji semata.

## Multi-tenant — WAJIB

- Tambah kolom `client_id` di semua tabel baru fitur ini. Terapkan RLS per
  `client_id`, extend pola role yang sudah ada (jangan bikin sistem role
  paralel).
- **Koneksi akun medsos dilakukan per klien via OAuth**, bukan lewat API key
  milik Trace. Klien harus bisa revoke akses sendiri kapan saja.
- Dua mode tampilan atas data yang sama:
  | | Internal (Trace) | Klien |
  |---|---|---|
  | Scope | Semua klien, bisa switch/bandingkan | Cuma akun sendiri |
  | Detail | Reasoning AI mentah + semua angka | Laporan ringkas: leads, closing rate, kontribusi omset |
- Tim Trace (role leader/team) bisa lihat lintas klien; klien biasa tidak bisa
  lihat data klien lain — ini harus diuji lewat test RLS yang eksplisit, ikuti
  pola test RLS yang sudah ada di `tests_real/`.

## Constraint teknis tambahan

- Rate limit API tiap platform per akun. Kalau banyak klien connect bersamaan,
  perlu job queue/antrian (cek dulu apakah `core/dataIntake.ts` sudah punya pola
  job/checkpoint yang bisa direuse sebelum bikin baru).
- Semua kode baru harus lolos pola test yang sudah ada di project ini: real
  test (bukan reimplementasi terpisah) yang memanggil fungsi produksi asli via
  `tests_real/load-app.js`-style harness kalau menyentuh `index.html`, atau
  `tests_core/*.mjs` kalau modul TypeScript murni.
- Jangan ubah logic auth/session/save-load yang sudah ada di `index.html` /
  `src/core` kecuali benar-benar diperlukan fitur ini.

## Yang diminta dari kamu (Claude Code)

1. Baca dulu `core/acquisition.ts`, `core/evidence.ts`, `core/aiDiagnostic.ts`,
   `core/dataIntake.ts`, dan skema migration Supabase yang ada, supaya paham
   pola yang harus di-reuse.
2. Usulkan skema tabel Supabase baru (dengan `client_id` + RLS policy) sebelum
   mulai coding — konfirmasi dulu ke user.
3. Bangun data layer + attribution layer dulu, baru evidence-first AI layer,
   baru feedback loop — dalam urutan itu, incremental, dengan test di setiap
   tahap sebelum lanjut ke tahap berikutnya.

---

## Masukan tambahan (hasil review sebelum eksekusi, 2026-09-12)

Ditambahkan setelah review konteks bisnis Trace Consultants (klien F&B). Wajib
dibaca sebelum mulai coding, karena mengubah beberapa asumsi di bagian
"Attribution layer" dan "Feedback loop" di atas.

1. **Atribusi klik-only tidak cukup untuk F&B.** Banyak konversi resto terjadi
   lewat WA langsung atau kunjungan setelah lihat story, bukan klik link UTM.
   Tambahkan jalur atribusi sekunder: field manual "tau dari mana" di alur
   intake yang sudah ada (`core/dataIntake.ts`), atau tag manual oleh
   konsultan yang menghubungkan lead ke konten tanpa klik tercatat. Laporan
   ROI ke klien harus jelas membedakan "omset dari klik tercatat" vs "omset
   dari atribusi manual/estimasi" — jangan digabung tanpa keterangan sebagai
   satu angka yang seolah presisi.
2. **Cakupan historis dibatasi oleh API platform.** IG Graph API, TikTok API,
   dan YouTube Data API rata-rata hanya expose beberapa bulan data ke
   belakang. Simpan `first_synced_at` per akun agar UI tidak menampilkan skor
   akurasi rekomendasi sebagai "final" padahal sample size-nya masih kecil di
   awal pemakaian.
3. **Siklus hidup token OAuth harus eksplisit, bukan silent-fail.** Tambahkan
   status per akun: `connected` / `expired` / `revoked`, dengan notifikasi ke
   klien DAN tim Trace saat token expired/revoked. Ikuti pelajaran dari audit
   sebelumnya soal `saveDataUnlocked()` yang pernah gagal diam-diam tanpa
   fallback yang jelas — jangan ulangi pola itu di modul ini.
4. **Normalisasi metrik lintas platform.** Reach (IG), views (TikTok), watch
   time (YouTube) beda satuan. Sebelum extend `core/evidence.ts`, tentukan
   dulu lapisan normalisasi/mapping supaya perbandingan lintas platform oleh
   AI tidak membandingkan hal yang tidak sepadan.
5. **Rollout bertahap.** Mulai dari Instagram dulu (paling relevan untuk
   klien F&B Indonesia), baru TikTok, baru YouTube — jangan bangun 3
   integrasi OAuth sekaligus di iterasi pertama.
6. **Risiko timeline dari app review platform.** Meta App Review untuk scope
   Graph API tertentu bisa memakan waktu berminggu-minggu. Masukkan ini
   sebagai risiko timeline eksplisit di rencana fase, bukan ditemukan telat
   saat development sudah jalan.

Nomor migration Supabase yang tersedia berikutnya di repo ini per
2026-09-12: **016** (migration terakhir yang ada: `015_trace_data_intake_commit_transition_fix.sql`).
