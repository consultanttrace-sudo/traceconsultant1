# Audit Fixes v73 (2026-09-26)

Perbaikan atas "Audit Total — TRACE Consultant OS (v73: Data Intake ZIP & Team Fix)", 26 September 2026, urut dari paling parah. Semua diverifikasi dengan menjalankan kode sungguhan di sandbox ini (Node 22.22.2 asli, Postgres 16 lokal, `npm audit`, `npm run test:deterministic` penuh) — bukan cuma dibaca. Bagian yang memang di luar kemampuan sandbox ini (Supabase/Netlify/browser production) ditandai jelas di bawah, sama seperti audit aslinya sendiri jujur soal itu.

## 1. CVE `xlsx` 0.18.5 — High (GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g8v-p4x9 ReDoS)
**Selesai.** Diganti `@e965/xlsx@0.20.3` — republish resmi build SheetJS ≥0.20.2 ke npm registry publik (`github.com/e965/sheetjs-npm-publisher`, homepage `sheetjs.com`), bukan fork pihak ketiga. API identik, jadi cuma import spec yang berubah, di **empat** titik pakai (audit sebelumnya hanya menyebut satu):
- `src/core/fileIntakeAdapters.ts` — jalur parsing file upload user, ini yang paling exposed ke GHSA-4r6h-8v6p-xvw6 (advisory-nya sendiri bilang jalur *export* tidak kena).
- `src/core/financeReport.ts` (x2 — export Excel & Laba Rugi).
- `src/core/consultingReportExcel.ts`.

Diverifikasi nyata: `npm install` bersih, `npm audit` sesudahnya menunjukkan 0 high/critical (sebelumnya 1 high), `npm run test:deterministic` penuh (110 baris PASS, termasuk parsing xlsx) tetap hijau.

**Temuan sampingan:** `npm audit` sesudahnya menunjukkan **2 moderate baru** (`uuid`, transitif lewat `exceljs`, GHSA-w5hq-g745-h8pq) yang sebelumnya ketutup di balik penghitungan `xlsx`. Tidak ada fix non-breaking — `npm audit fix --force` men-downgrade `exceljs` ke 3.4.0. Direkomendasikan terima risiko ini untuk saat ini (lihat DEPLOY_CHECKLIST.md).

## 2. Race condition migration 055 (Sedang → sekarang tertutup + 1 bug tambahan ketemu)
**Selesai** — migration baru `supabase/migrations/056_data_intake_race_fix_v73.sql`.

- Constraint lama `unique(actor_user_id, source_hash)` (migration 006) diganti dua partial unique index: `(client_id, source_hash) where client_id is not null` dan `(actor_user_id, source_hash) where client_id is null`.
- `trace_transition_data_intake` & `trace_commit_canonical_pos_import` ditulis ulang jadi `INSERT ... ON CONFLICT ... DO UPDATE` atomik (Postgres cuma boleh 1 conflict target per statement, jadi di-cabang berdasarkan `v_client`), bukan select-then-insert.
- Exception handler `unique_violation` → error `TRACE_IMPORT_CONCURRENT_WRITE` / `TRACE_CANONICAL_DUPLICATE_IMPORT_ROWS`, bukan error mentah Postgres.
- **Pre-flight check** ditambahkan setelah ketahuan lewat testing nyata bahwa `CREATE UNIQUE INDEX` gagal total (bukan cuma warning) kalau baris duplikat dari race ini sudah pernah terjadi — sekarang migration berhenti dengan pesan `TRACE_MIGRATION_056_PREFLIGHT` yang jelas, bukan error index Postgres yang opak.
- **Bug tambahan yang ketemu saat membaca migration 038 & fungsi commit**: closing `UPDATE` di `trace_commit_canonical_pos_import` sebelumnya cuma filter `source_hash+status='approved'` tanpa `client_id` — kalau race di atas sudah sempat bikin duplikat, commit untuk client X bisa diam-diam menimpa `client_id` baris duplikat milik client Y. Sudah ditambah filter `client_id`.
- **Bug tambahan lain (belum ada di audit asli)**: constraint lama yang unscoped juga salah memblokir kasus SAH — aktor yang sama upload file identik (hash sama) untuk 2 klien berbeda. Ini sekarang dibolehkan (dibuktikan lewat test konkurensi di bawah).

**Diverifikasi dengan cara yang tidak bisa dilakukan audit sebelumnya**: menginstall Postgres 16 di sandbox ini, membangun skema tiruan (stub `auth.uid()`, `trace_is_team_member()`, dll — bukan project Supabase sungguhan), menjalankan migration 055 **asli** (sebelum fix) dengan 2 panggilan konkuren sungguhan (bukan simulasi) — **race-nya benar-benar kejadian, 2 baris duplikat tercipta**. Lalu menjalankan file migration 056 **asli** (file yang sama persis yang ada di zip ini, bukan salinan uji), dan mengulang uji konkuren yang sama — **hasilnya 1 baris**, race tertutup. Uji cross-client (aktor sama, hash sama, klien beda) juga dibuktikan sekarang berhasil.

**Yang tidak bisa diverifikasi dari sini**: nama constraint auto-generated migration 006 di project Supabase production nyata (fix ini fail-safe lewat `IF EXISTS` kalau beda — race utamanya tetap tertutup meski begitu, cuma perbaikan cross-client-nya yang bisa jadi tidak ke-apply), RLS dengan user non-admin sungguhan, dan apakah `trace_data_intake_imports` production sudah ada duplikat dari sebelum fix ini (kalau ada, migration akan berhenti dengan pesan yang jelas, bukan korup diam-diam).

## 3. Tiga (ternyata empat) salinan file Acquisition (Sedang)
**Selesai**, dengan koreksi atas audit sebelumnya: `features/acquisition_os/index.html` **BUKAN** file yatim seperti diklaim — file `index.html` (app legacy classic, di-deploy sebagai `/legacy-classic.html`) meng-iframe file itu langsung. Yang benar-benar yatim (dibuktikan lewat checksum + grep, bukan diasumsikan): `trace-acquisition-os.html` (root) dan satu salinan lagi yang belum ketahuan di audit sebelumnya, `features/acquisition_os/trace-acquisition-os.html` (checksum beda dari 3 lainnya).

`scripts/copy-static-for-publish.mjs` diubah dari copy `features/` secara utuh (tanpa syarat) menjadi copy tepat satu file yang dibutuhkan (`features/acquisition_os/index.html`), dan berhenti copy `trace-acquisition-os.html` (root). Ini otomatis juga berhenti mempublikasikan seluruh dokumen audit internal, `schema.sql`, source code Netlify functions, dan `tests_real/` yang tadinya ikut ter-deploy tanpa perlu — bukan cuma soal duplikasi UI.

Ditambah redirect 301 di `netlify.toml` untuk `/trace-acquisition-os.html` → `/acquisition/index.html`, dan guard test permanen di `tests_core/test_total_audit_contract.mjs` (regex terhadap source `copy-static-for-publish.mjs` + pengecekan silang terhadap `index.html`, supaya kalau iframe target-nya berubah suatu saat, test ini gagal duluan sebelum jadi bug produksi).

**Bug yang ketemu lewat testing nyata (bukan cuma baca kode), 2x**: (a) helper `copyFile()` tidak `mkdir` direktori tujuan dulu — gagal total untuk path bersarang seperti `features/acquisition_os/index.html` sampai ditambahkan `mkdirSync(dirname(dest), {recursive:true})`. (b) edit pertama saya sendiri tanpa sengaja ikut menghapus logic copy `legacy-classic.html` — ketahuan dan diperbaiki setelah menjalankan skrip-nya dan membandingkan isi `dist/react` sebelum/sesudah, bukan dari membaca ulang diff.

## 4. STATUS.md usang (Rendah)
**Selesai.** 3 dari 4 poin "Masih PARTIAL" (Client CRUD, Stock opname, Labor & OPEX) dipindah ke bagian "Selesai" baru dengan rujukan migration masing-masing (042, 044–045, 046–047) — diverifikasi ulang langsung ke migration & pemanggilnya, bukan dipercaya dari audit sebelumnya begitu saja. Poin ke-4 (Marketing/ActionPlan/Acquisition/BusinessTwin) dibiarkan, memang masih akurat.

## 5. Komentar menunjuk `SECURITY_KNOWN_ISSUES.md` yang tidak ada (Rendah)
**Selesai**, disatukan dengan #1 — komentar di `fileIntakeAdapters.ts` sekarang menunjuk `DEPLOY_CHECKLIST.md` dan mencatat CVE-nya sudah selesai per tanggal ini.

## Catatan metodologi
Semua di atas dijalankan sungguhan di sandbox ini: Postgres 16 (diinstall via apt, bukan disimulasikan), Node 22.22.2 (persis versi `engines` project), `npm install` nyata ke registry npm publik, `npm audit` nyata, dan `npm run test:deterministic` penuh (chain ~70 file test + `tsc` typecheck) — hijau semua setelah seluruh perbaikan di atas digabung. Yang tetap di luar jangkauan sandbox ini, sama seperti keterbatasan yang audit aslinya sendiri sudah jujur catat: project Supabase production nyata, deployment Netlify nyata, dan browser sungguhan.
