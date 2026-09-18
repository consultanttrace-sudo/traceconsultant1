# STATUS.md — TRACE Consultant OS

**Ini SATU-SATUNYA file status yang dipelihara mulai sekarang.**
Jangan buat `PHASE_*.md`, `ROOT_CAUSE_AUDIT_*.md`, `AUDIT_*_baru.md`, atau laporan
kerja markdown baru lainnya — update file ini dan `UI_WIRING_BACKLOG.md` saja,
ditimpa (overwrite bagian yang relevan), bukan ditambah file baru.
Snapshot sumber: `TRACE_v72_21_UI_COMPLETE_2026-09-14.zip`.

## Verdict saat ini
**RELEASE CANDIDATE — belum production-verified.** Build/typecheck/test lokal
lolos di environment yang benar (Node sesuai `engines`), tapi Supabase RLS,
deploy Netlify sungguhan, dan browser E2E belum dijalankan terhadap project
production nyata.

## Terverifikasi PASS (dijalankan nyata, bukan diklaim)
Sumber: `FIX_NOTES_V72_12_2026-09-14.md` (audit independen terbaru, mtime
paling akhir di antara file laporan lama).
- 57/57 file `tests_core` exit 0 satu per satu.
- `npm run typecheck:core` (tsc --noEmit) PASS.
- Dependency lock 258 package resolved, cocok dengan `scripts/verify-dependency-policy.mjs`.
- Setelah 2 fix di sesi itu (`exceljs` ditambahkan ke `package.json`, param
  `canvas` ditambahkan ke `pdfjs-dist` render call di `fileIntakeAdapters.ts`):
  `npm run typecheck:react` bersih dan `npm run build:react` (Vite) sukses
  end-to-end.
- `ClientsView` memang read-only murni ke tabel `trace-clients` (tidak ada
  RPC insert/update/delete client di manifest migrations manapun) — akurat.

## Wiring UI ke src/core/* — hasil grep (lihat UI_WIRING_BACKLOG.md)
Dibuat 2026-09-16 dengan membaca tiap file `src/core/*` dan grep import di
`src/app/main.tsx`. Ini **mengoreksi** klaim di `FIX_NOTES_V72_12` yang
menyebut "Marketing/KPI/SOP/Action Plan cuma dipakai sebagai import logic di
layar lain (KPI di dashboard, SOP di Business Twin board) — bukan layar
mandiri". Bukti grep menunjukkan:
- `marketing.ts` dan `actionPlan.ts`: **nol** import di `main.tsx` — tidak
  dipakai di layar manapun, mandiri atau tidak.
- `sop.ts`: ada baris import, tapi `nextSOPStep` dan `validateSOP` **tidak
  pernah dipanggil** di manapun (dead import). Yang benar-benar dipakai di
  Business Twin adalah `collaboration.summarizeCollaboration`, bukan `sop.ts`.
- `kpi.ts` klaim "dipakai di dashboard" **benar** — dipakai di
  `AnalyticsView` dan `KpiTrackingView`.
- Total: 35/50 modul `src/core/*` ada importnya di main.tsx, 15 modul nol
  import sama sekali (daftar lengkap + 4 dead-import lain +
  `inventoryIntelligence.ts` yang wired ke tab salah: lihat
  `UI_WIRING_BACKLOG.md`).

## Masih PARTIAL / butuh keputusan desain (bukan bugfix kecil)
Sumber: `FIX_NOTES_V72_12_2026-09-14.md`.
- **Client CRUD**: belum ada RPC/migration insert/update/delete `trace-clients`
  dengan RLS scope.
- **Stock opname/reconciliation Inventory**: belum ada tabel/RPC selisih
  stok fisik vs sistem. (Selaras dengan temuan grep: tab Inventory murni
  CRUD RPC, tidak pakai `inventoryIntelligence.ts`.)
- **Labor & OPEX detail** (payroll, subledger): masih level kategori record.
- **Marketing/Action Plan sebagai layar aktif**: berdasarkan grep, ini bukan
  "logic ada tapi UI belum" — modul core-nya **tidak dipanggil sama sekali**
  dari `main.tsx`. Perlu diverifikasi ulang: apakah UI-nya sepenuhnya
  hardcoded/dummy, atau memang logic ditulis inline di komponen tanpa
  memanggil `src/core/marketing.ts` / `src/core/actionPlan.ts`.

## External blockers (bukan bug kode, tercatat apa adanya)
1. Real Supabase migrations/RLS/tenant-isolation belum dites terhadap
   project production nyata.
2. Real Netlify deployment smoke test belum dijalankan.
3. Environment Node harus `>=22.22.2 <23` sesuai `engines` — build gagal di
   Node 22.16.0 karena dependency (`exceljs`, `pdfjs-dist`) yang memang
   dibutuhkan, bukan karena versi Node itu sendiri (root cause sudah
   dikoreksi di `FIX_NOTES_V72_12`, bukan Node version seperti klaim
   sebelumnya).

## Refactor src/app/main.tsx → src/app/views/* (2026-09-17)
`main.tsx` (2242 baris) dipecah murni-lokasi (tanpa ubah logika/JSX) menjadi:
- `src/app/views/_shared.tsx` — infra lintas-view: `TraceAuthGate`, `TraceErrorBoundary`,
  `getReactSupabase`, `useTraceCollections`, `loadTraceCollections`,
  `installAcquisitionBridge`, `asArray`, `fmtFieldAmount`, `money`, `inputStyle`,
  `ComingSoonPanel`, dll.
- 25 file `src/app/views/<Nama>.tsx`, satu per tab nav (mis. `BusinessHealthView.tsx`,
  `FinanceEntry.tsx`, `AccountingView.tsx`, dst).
- `main.tsx` tersisa 66 baris: cuma `App()`, array `nav`, dan import.

**Metode verifikasi (bukan klaim tanpa bukti):**
1. Ekstraksi dilakukan lewat script Python yang memotong berdasarkan baris-persis lalu
   membuktikan **programatik** bahwa isi tiap file baru byte-for-byte identik dengan baris
   aslinya — satu-satunya tambahan tekstual adalah kata kunci `export` di baris deklarasi
   dan baris `import` baru (wajib untuk split file, bukan perubahan logika).
2. `npx tsc -p tsconfig.react.json`: baseline (sebelum refactor ini) sudah punya **36 error
   TS pre-existing** (bukan dari refactor). Sesudah refactor: **tetap persis 36 error,
   pesan identik** (diverifikasi diff teks pesan error, bukan cuma hitung jumlah) — cuma
   lokasi file yang berubah. Nol error baru, nol "cannot find module/name".
3. `npm run build:react` (vite): sukses sebelum & sesudah, ukuran bundle akhir nyaris sama
   (1.153.738 → 1.153.766 byte). Diff biner hasil build: satu-satunya beda ada di internal
   React minified (rename variabel minifier, artefak bundler biasa), bukan di kode TRACE.
   Semua string UI Indonesia yang dicek (termasuk yang muncul 8x lintas-tab) cocok persis
   jumlah kemunculannya di kedua bundle.
4. **Belum bisa dibuktikan**: screenshot browser before/after sungguhan — sandbox tempat
   saya bekerja tidak punya browser (Playwright diblokir allowlist jaringan, `apt install
   chromium` cuma stub snap tanpa snapd). Script `screenshot-all-tabs.mjs` disertakan di
   root project untuk dijalankan sendiri oleh user di mesin dengan akses browser penuh.

## Belum diverifikasi di sesi ini (bukan diam-diam dianggap PASS)
- Isi 1 modul lama (`tests_real/test_opex.js`, `test_reliability.js`) dan
  status kontradiksi 11B vs kode aktual (lihat memori TRACE untuk detail
  root cause) belum dicek ulang terhadap snapshot v72.21 ini.
- README.md (1536 baris) dan puluhan file `PHASE_*`/`AUDIT_*`/`RELEASE_*`
  lama di root **tidak dihapus** (bukan wewenang saya untuk hapus tanpa
  diminta), tapi mulai sekarang tidak ditambah lagi — histori ada di
  file-file lama itu, status terkini hanya di sini.
