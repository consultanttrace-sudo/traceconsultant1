# Status pengujian (per perbaikan item 4 & 5)

## Yang sudah diperbaiki

**Item 4 -- `script_1.js` dihapus.** File itu adalah salinan lama/basi dari
script `index.html` yang tidak pernah dipanggil (`index.html` tidak
mereferensikannya sama sekali) -- ikut ter-zip ke rilis "FINAL" tanpa
sengaja. Sudah tidak ada di paket ini.

**Item 5 -- `tests_real/` (baru), 2 dari 10 file lama sudah dikonversi
penuh.** Berisi harness yang menjalankan **kode `index.html` yang
sesungguhnya** (bukan salinan tangan) di dalam jsdom. `load-app.js` membaca
`index.html` langsung setiap kali test dijalankan -- tidak ada salinan
terpisah yang bisa basi seperti kasus `script_1.js` di atas.

Cara jalankan:
```
cd tests_real
npm install
node test_reliability.js   # 12/12
node test_opex.js          # 11/11
```

- **`test_reliability.js`** -- menguji `loadData()`, `saveData()`,
  `setupModule()` (delete-safety) yang asli: key kosong vs gagal
  sungguhan, delete gagal tidak menimpa data, toast fallback cloud->local,
  JSON lokal corrupt, isolasi antar key. **12/12 lolos.**
- **`test_opex.js`** -- menguji `computeOpexProfitability()` yang asli,
  lewat seed data Klien->Company->Brand->Outlet->Produk->Sales->OPEX
  sungguhan (`seed-struktur.js`) dan mengaktifkan scope client persis
  seperti user memilih dropdown Akuntansi (`activateScope()` men-dispatch
  event `change` yang sama, bukan menimpa variabel internal langsung).
  Skenario: total revenue/COGS/opex/profit, isolasi antar klien (termasuk
  nama outlet yang sama tapi klien beda), dan OPEX bulan berbeda tidak
  saling menimpa. **11/11 lolos.**

`seed-struktur.js` dibuat sebagai helper yang bisa dipakai ulang untuk
mengonversi sisa file test -- setiap engine kalkulasi lain butuh pola
seeding yang sama (hierarki + activateScope), jadi pekerjaan berikutnya
tinggal menambah data spesifik per modul.

## Yang BELUM diperbaiki (di luar cakupan yang sempat dikerjakan)

`tests_reimpl_legacy/` (8 file tersisa: `test_target_budget.js`,
`test_forecast.js`, `test_marketing_event.js`, `test_ops_checklist_kpi.js`,
`test_efficiency.js`, `test_executive_kpi.js`, `test_charts_benchmarking.js`,
`test_integration_audit.js`) **masih pola lama** -- reimplementasi rumus
terpisah, bukan memanggil fungsi asli dari `index.html`. Statusnya sama
seperti temuan awal: menguji salinan, bukan kode produksi -- jangan
dianggap sudah membuktikan `index.html` benar. File-file lama tetap
disertakan (bukan dihapus) karena tetap memberi sinyal parsial sampai
dikonversi.

## Phase 6 truth status — 2026-09-09
- Core/static suites are passing as listed in `PHASE6_DIAGNOSTIC_AND_CODE_HEALTH_AUDIT_2026-09-09.md`.
- React typecheck is BLOCKED because `node_modules` is not installed (`vite/client` unavailable).
- React production build is BLOCKED because the `vite` executable is unavailable.
- jsdom browser tests are BLOCKED because `jsdom` is not installed.
- No production Supabase/RLS PASS claim is made until real project tests are executed.
