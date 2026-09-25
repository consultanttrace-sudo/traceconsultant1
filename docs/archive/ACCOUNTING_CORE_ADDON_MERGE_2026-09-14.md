# Merge Modul Akuntansi Baru ke TRACE v72.1 — 2026-09-14

Dokumen ini mencatat apa yang benar-benar dilakukan saat menyatukan 8 modul akuntansi baru
(dari paket terpisah `TRACE_accounting_core_v2_addon.zip`) ke codebase TRACE lengkap, dan apa
yang masih tersisa — supaya tidak ada klaim "sudah jadi fitur" yang sebenarnya belum benar.

## Yang dikerjakan di merge ini

1. Menyalin 8 file baru ke `src/core/`: `chartOfAccounts.ts`, `balanceSheet.ts`,
   `cashFlowStatement.ts`, `accountsReceivable.ts`, `accountsPayable.ts`, `fixedAssets.ts`,
   `taxCalculator.ts`, `periodClose.ts`. Tidak ada file lama yang ditimpa atau diubah isinya.
2. Menambahkan 8 baris `export * from './...js'` baru ke `src/core/index.ts`, plus satu baris
   untuk `accounting.ts` sendiri (sebelumnya belum di-export dari index — sesuai saran di
   `PANDUAN_MODUL_AKUNTANSI_BARU.md`). Dicek dulu tidak ada nama yang bentrok dengan modul lain
   sebelum ditambahkan.
3. Menambahkan 8 file itu ke daftar eksplisit di `tsconfig.core-platform.json` supaya ikut
   ditypecheck oleh `test:deterministic`, bukan cuma lolos diam-diam lewat glob pattern.
4. Menulis test integrasi baru `tests_core/test_accounting_addon_v72.mjs` — bukan unit test
   terpisah per modul, tapi satu skenario cafe end-to-end (setor modal → beli peralatan →
   jual makanan tunai → beli bahan baku dari supplier → bayar gaji) yang menjalankan ke-8
   modul itu sekaligus dan mengecek Neraca benar-benar `Aset = Liabilitas + Ekuitas`. Ini juga
   jadi regression guard untuk bug tanda saldo Liabilitas/Ekuitas yang disebutkan sudah
   diperbaiki di paket addon.
5. Menambahkan test itu ke rantai `npm run test:deterministic` di `package.json`.
6. Menjalankan ulang **seluruh** `npm run test:deterministic` yang sudah ada (bukan cuma test
   baru) — semua PASS, tidak ada yang rusak.

## Satu koreksi kecil ke klaim di paket addon

`chartOfAccounts.ts` berisi **28 baris akun**, bukan 25 seperti disebut di ringkasan dan di
`PANDUAN_MODUL_AKUNTANSI_BARU.md`. Bukan bug — cuma angka di dokumentasi yang tidak sinkron
dengan kode aktualnya (kemungkinan ditulis sebelum baris seperti "Pajak Dibayar Dimuka",
"Akumulasi Penyusutan", atau "Prive" ditambahkan).

## Update 2026-09-14 (lanjutan): celah `subType` sudah ditutup TANPA migration

Dicek dulu ke Supabase project TRACE yang tersambung (`trace consultan`, id
`bkbnxhyaxgtxfmmpzydw`) lewat `Supabase:list_projects` / `list_tables` — statusnya
**INACTIVE (paused)**, tidak bisa di-query sama sekali. Karena itu saya TIDAK menulis
migration SQL untuk kolom `sub_type` (menulis SQL yang tidak bisa dijalankan/diverifikasi
terhadap skema live sama saja dengan menebak, bukan kerja yang sudah dites).

Sebagai gantinya: `src/core/accountSubTypeInference.ts` (baru) menebak `AccountSubType`
langsung dari kode + tipe akun yang SUDAH ADA di `trace_accounts` — tidak perlu kolom baru,
tidak perlu migration, tidak menyentuh database sama sekali. `withInferredSubTypes()` yang
disediakan di sana mengubah `accounts` mentah dari `trace_read_client_dataset` jadi
`AccountWithSubType[]` yang langsung bisa dipakai `buildBalanceSheet()`. Sudah dites: cocok
100% untuk ke-28 akun standar, dan fallback yang masuk akal untuk kode akun custom di luar
pola standar (lihat penambahan di `tests_core/test_accounting_addon_v72.mjs`).

Kalau nanti project Supabase-nya aktif lagi dan tim tetap mau kolom `sub_type` eksplisit di
database (misalnya karena banyak akun custom yang tidak ikut pola kode standar), migration itu
masih bisa dibuat sebagai langkah terpisah — pendekatan inferensi ini tidak menghalanginya.

## Yang MASIH belum tersambung (bukan pekerjaan merge ini)

- **UI React**: tidak ada perubahan apa pun di `src/app/main.tsx`. Kedelapan modul ini masih
  murni logika (`.ts`), tidak muncul sebagai menu/tombol baru di aplikasi.
- **Tabel Supabase untuk modul baru**: `accountsReceivable.ts`, `accountsPayable.ts`,
  `fixedAssets.ts`, `periodClose.ts` masih belum punya tabelnya sendiri di Supabase (invoice,
  bill, aset tetap, period lock) — ini genuinely butuh migration baru, dan project-nya perlu
  aktif dulu sebelum itu bisa ditulis+diverifikasi dengan aman.
- Rekonsiliasi bank otomatis, e-Faktur/SPT, dan audit eksternal — tetap di luar cakupan, sama
  seperti disebutkan di paket addon.

## Cara verifikasi ulang klaim di atas
```
npm install
npm run test:deterministic
```
Semua baris harus `PASS`, termasuk `accounting addon (neraca, arus kas, piutang/utang, aset
tetap, pajak, tutup buku) v72: PASS`.
