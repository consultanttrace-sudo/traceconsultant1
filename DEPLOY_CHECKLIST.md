# TRACE — Status Perbaikan & Checklist Sebelum Deploy Production

Dokumen ini dibuat pada 2026-09-13 setelah sesi audit/perbaikan atas
`TRACE_v67_FIXED_2026-09-13.zip`. Tujuannya: catatan jujur
tentang apa yang SUDAH diperbaiki & diverifikasi nyata (bukan cuma diklaim),
dan apa yang MASIH harus dikerjakan sebelum ini benar-benar aman dipakai
production dengan data klien asli.

## ✅ Sudah diperbaiki & diverifikasi ulang (dites nyata, bukan asumsi)

1. **jspdf 2.5.2 → 4.2.1** + **jspdf-autotable 3.8.4 → 5.0.8**
   Menutup 1 kerentanan CRITICAL (HTML Injection/XSS, CVSS 9.6) dan
   kerentanan lain yang mengikutinya. Upgrade ini awalnya MEMATAHKAN fitur
   export PDF (`autoTable is not a function` — breaking API change di
   jspdf-autotable v5), sudah diperbaiki di `src/core/financeReport.ts`.
   Diverifikasi: typecheck bersih, build sukses, dan keempat tombol export
   (PDF/Excel Finance + PDF/Excel Laba Rugi) dites ulang via browser
   sungguhan — semua menghasilkan file yang valid.

2. **`npm audit`**: dari 4 kerentanan (1 kritis, 2 high, 1 moderate) →
   tinggal **1 high** (`xlsx` — lihat bagian "Belum bisa diperbaiki" di
   bawah).

3. **Bug mock Supabase di test suite legacy** (`tests_real/make-supa-mock.js`)
   — mock tidak implement `.abortSignal()` yang dipakai kode produksi
   asli, menyebabkan `test_opex.js` FAIL dengan false-positive. Sudah
   ditambal. Hasil: **test_opex.js 11/11 PASS**.

4. **`test_reliability.js` — bukan bug, tapi test yang ketinggalan zaman.**
   Kode produksi (`index.html`, fungsi `saveDataUnlocked`) sudah sengaja
   diubah dari `toast()` ke `alert()` untuk kasus "cloud sync gagal,
   fallback ke localStorage" — alasannya didokumentasikan langsung di kode:
   `alert()` wajib di-klik sehingga tidak mungkin terlewat saat memantau
   proses besar (mis. Discovery) yang berjalan tanpa diawasi. Kontrak
   `saveData()` mengembalikan `false` (bukan `true`) untuk kasus ini juga
   sudah benar dan disengaja ("truthful contract" — salinan lokal BUKAN
   berarti sudah tersimpan di database tim). Test-nya sendiri sudah
   diperbarui agar sesuai perilaku production yang disengaja ini.
   Hasil: **test_reliability.js 12/12 PASS**. Juga dikonfirmasi:
   `test_auth.js` 7/7 PASS, `test_release_static.js` 25/25 PASS.

5. **Bug parsing JS nyata di `features/acquisition_os/index.html`**
   (file yang benar-benar dipakai lewat iframe, baik oleh monolith lama
   maupun integrasi React baru). Satu baris `document.write(...)`
   menyisipkan tag `<script>...</script>` mentah di dalam string —
   membuat parser HTML browser memotong SELURUH sisa kode JS di file itu
   begitu ketemu `</script>` literal tersebut. Akibatnya: dashboard
   Acquisition hanya menampilkan hero section, seluruh render kartu
   statistik/flow-strip/dst tidak pernah jalan. Sudah diperbaiki, dan
   fungsi tombol flow-strip yang sempat ikut hilang (karena nyasar di
   dalam string yang sama) sudah dikembalikan ke lokasi yang benar.
   Diverifikasi lewat browser sungguhan: 0 JavaScript error, seluruh
   bagian dashboard (termasuk flow-strip "1·Cari → 2·Validasi →
   3·Prioritaskan → 4·Tindak lanjut") sekarang benar-benar render.

6. **Acquisition ditambahkan ke navigasi React** (`src/app/main.tsx`).
   Sebelumnya Acquisition sama sekali tidak ada di versi React yang
   sedang di-redesign — hanya ada di monolith lama. Sekarang muncul
   sebagai tab "Acquisition" di sidebar React, di-embed via iframe ke
   `features/acquisition_os/index.html` (dicopy ke
   `react-app/public/acquisition/index.html` sehingga ikut ter-build).
   **Catatan v67**: saat dibuka dari TRACE production shell, Acquisition kini
   memakai authenticated `TRACE_ACQUISITION_BRIDGE`: lead disimpan melalui
   Supabase `trace_kv`, discovery jobs/checkpoints memakai `trace_jobs` dan
   `trace_job_checkpoints`, dan konversi lead memakai shared `trace-clients`.
   localStorage tetap hanya fallback untuk standalone/file usage. Real
   Supabase/RLS execution tetap harus diverifikasi terhadap project nyata.

7. Bug kecil: `?view=sales` di URL tidak berfungsi (reset ke Overview)
   karena `'sales'` tidak ada di whitelist initial-view. Sudah ditambahkan.

8. Ditambahkan `.env.example` (daftar lengkap semua environment variable
   yang dibaca kode — hasil audit langsung ke source, bukan tebakan) dan
   `.gitignore` (mencegah `node_modules`, `dist/`, dan file `.env` asli
   ikut ter-commit/ter-deploy tidak sengaja — sebelumnya tidak ada
   `.gitignore` sama sekali di proyek ini).

## ⚠️ Belum bisa diperbaiki di sesi ini — perlu tindakan dari Anda

1. **`xlsx` versi 0.18.5 — kerentanan High (prototype pollution + ReDoS)
   belum tertutup.** Versi yang sudah dipatch (≥0.20.2) TIDAK tersedia di
   npm registry — SheetJS (pembuat `xlsx`) memindahkan distribusi versi
   baru ke CDN mereka sendiri (`cdn.sheetjs.com`), dan environment saya
   tidak punya akses ke domain itu. **Tindakan yang perlu Anda lakukan**:
   dari komputer Anda sendiri, jalankan
   `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
   (cek versi terbaru di https://sheetjs.com/), lalu jalankan
   `npm run test:deterministic` dan `npm run test:react-production-wiring`
   untuk pastikan tidak ada breaking change di API-nya sebelum deploy.

2. **RLS (Row Level Security) Supabase belum pernah diverifikasi ke
   project nyata.** Saya tidak punya kredensial Supabase Anda, jadi ini
   sama sekali belum bisa saya tes. Anon key yang ada di kode itu memang
   didesain untuk publik, tapi keamanan datanya 100% bergantung pada RLS
   policy di `supabase/migrations/*.sql` benar-benar diterapkan (`supabase
   db push` atau lewat dashboard) DAN diuji pakai user non-admin
   sungguhan — bukan diasumsikan benar dari membaca file SQL saja.

3. **Environment variables belum diisi** — lihat `.env.example` yang baru
   dibuat. Tanpa ini diisi di Netlify dashboard, situs akan online tapi
   kosong/non-fungsional untuk bagian yang butuh Supabase, Google Maps,
   dan AI endpoint.

4. **Acquisition persistence bridge belum diverifikasi terhadap Supabase
   production nyata.** Source-level wiring dan regression contract sudah PASS;
   real authenticated read/write masih membutuhkan project Supabase yang
   dapat diakses.

## Cara deploy setelah item di atas selesai

1. `npm install` di root project (dan di `tests_real/` kalau mau jalankan
   test legacy lagi).
2. Isi semua env var dari `.env.example` di Netlify Site settings.
3. Apply semua migration ke project Supabase Anda, verifikasi RLS dengan
   user non-admin sungguhan.
4. (Opsional tapi direkomendasikan) Upgrade `xlsx` sesuai instruksi di
   atas.
5. `git push` / trigger deploy — Netlify akan otomatis menjalankan
   `npm run build:site` sesuai `netlify.toml` yang sudah ada.
6. Setelah live, cek ulang tiap section (termasuk export PDF/Excel dan
   tab Acquisition) dengan data klien sungguhan, bukan cuma data dummy
   seperti yang saya pakai untuk verifikasi di sesi ini.

## TRACE v72.4 — AI / Diagnostic / Acquisition runtime variables

For the AI Engineer Chat to become CONNECTED, configure these **server-side Netlify environment variables** (never put API keys in React/browser code):

- `TRACE_AI_ENDPOINT` — OpenAI-compatible chat-completions endpoint, if using a custom provider.
- `TRACE_AI_MODEL` — provider model identifier.
- Or `OPENAI_API_KEY` + `OPENAI_MODEL` when using the built-in OpenAI-compatible endpoint in `netlify/functions/ai-chat.js`.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` — required by authenticated Netlify functions.
- `ACQ_ALLOWED_ORIGINS` — comma-separated production origins when cross-origin embedding requires it.

After deployment, verify:
1. Settings → AI Engineer Chat → **Tes koneksi** reports CONNECTED.
2. Settings → Security Guard → **Jalankan security scan** returns server-side findings, not an empty browser-local scan.
3. Settings → AI Diagnostic Center → **Run full diagnostic** returns a source manifest and telemetry status.
4. Acquisition → Discovery creates a durable job without direct `trace_jobs` browser INSERT.

## v72.9 — F&B Target & Capacity Planner
- Apply `supabase/migrations/039_fnb_target_capacity_planner.sql` before using the new Target & Kapasitas module.
- Module supports manual operational assumptions: seats, tables, seats/table, turns, occupancy, average ticket, operating days/hours, parking capacity/conversion, takeaway capacity, fixed cost, variable cost, desired profit, and actual revenue.
- Calculation separates break-even revenue, profit-target revenue, theoretical capacity revenue, daily target, target transaction volume, required effective turns, and capacity/current gaps.
- Saved plans are client-scoped in `trace_fnb_target_plans` with manual provenance and versioning.
