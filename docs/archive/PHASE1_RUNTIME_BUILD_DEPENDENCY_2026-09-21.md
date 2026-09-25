# PHASE 1 — Runtime / Build / Dependency (2026-09-21)

Runtime: Node v22.22.2, npm 10.9.7 (requirement proyek TIDAK diubah: Node >=22.22.2 <23, npm 10.9.2).

## Perubahan
1. `package.json` + `package-lock.json`: `exceljs` `^4.4.0` → `4.4.0`, `playwright` `^1.63.0` → `1.63.0` (sama dengan versi yang sudah terkunci di lockfile; tidak ada upgrade/downgrade paket).
2. Baru: `tests_core/_react_source.mjs` (helper membaca `src/app/main.tsx` + semua `src/app/views/*.tsx`).
3. 8 tes statis dialihkan dari membaca `main.tsx` saja ke helper tersebut: react-truthfulness, test_platform_static, test_v72_scope_static, test_v72_global_kv_boundary, test_data_intake_p0_hardening, test_v72_3_ar_ap_assets_period_lock, react-production-wiring, test_internal_scope_static. Assertion tidak dilonggarkan; hanya sumber file yang diperluas. Di test_v72_3 regex path import diperluas ke `../core/` atau `../../core/` karena import pindah ke folder views.
4. `src/app/main.tsx`: subjudul topbar menampilkan `ACQUISITION · INTERNAL` saat view Acquisition aktif (label sebelumnya hilang setelah UI dipecah). Lainnya tetap.

## Hasil verifikasi (dijalankan)
| Check | Hasil |
|---|---|
| verify:runtime, verify:dependencies, release:preflight | PASS |
| typecheck:core, typecheck:react | PASS |
| test:deterministic (18 tes) | PASS |
| test:react-production-wiring, test:internal-scope, test:ai-chat, test:finance-intelligence, test:phase13-17 | PASS |
| build:site (Vite production) | PASS |
| tests_real/* (RLS live, auth, opex) | NOT VERIFIED (butuh Supabase live) |
| Klaim PASS di dokumen lama | NOT VERIFIED |

## Catatan
- Celah migration 037 belum dijelaskan → NOT VERIFIED.
- Bundle utama 1.19 MB belum di-code-split (masuk Phase 18).
- Sudah menghasilkan `dist/` baru dari build ini.
