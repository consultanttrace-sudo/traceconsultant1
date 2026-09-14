# Panduan Modul Akuntansi Baru di TRACE
Ditulis untuk dibaca siapa saja di tim TRACE Consultant — tidak perlu paham coding atau akuntansi mendalam.

## Kenapa ini dibuat
Sebelumnya, TRACE cuma bisa jawab satu pertanyaan: **"apakah klien untung bulan ini?"** (lewat Laba Rugi). Delapan modul baru ini menjawab pertanyaan-pertanyaan lain yang sama pentingnya, yang sebelumnya tidak bisa dijawab TRACE sama sekali:

| Pertanyaan klien/tim | Dijawab oleh modul |
|---|---|
| "Total kekayaan bisnis ini sekarang berapa, dan dari mana asalnya (utang atau modal sendiri)?" | **Neraca** (`balanceSheet.ts`) |
| "Untung di laporan, kok kas menipis? Uangnya lari ke mana?" | **Arus Kas** (`cashFlowStatement.ts`) |
| "Klien corporate/catering mana yang belum bayar, sudah berapa lama?" | **Piutang** (`accountsReceivable.ts`) |
| "Utang ke supplier mana yang mau jatuh tempo, biar tidak telat bayar?" | **Utang** (`accountsPayable.ts`) |
| "Mesin kopi/kulkas yang dibeli 20 juta, sekarang nilainya berapa?" | **Aset Tetap & Penyusutan** (`fixedAssets.ts`) |
| "PPN yang harus disetor bulan ini berapa? PPh Final UMKM-nya?" | **Kalkulator Pajak** (`taxCalculator.ts`) |
| "Bulan lalu sudah dikirim ke klien, kok datanya masih bisa diubah orang lain?" | **Tutup Buku** (`periodClose.ts`) |
| "Akun mana yang seharusnya dipakai untuk transaksi apa?" | **Daftar Akun Standar** (`chartOfAccounts.ts`) |

## Penjelasan tiap modul, tanpa istilah rumit

**1. Daftar Akun Standar (Chart of Accounts)**
Ibarat kotak-kotak untuk menyimpan uang keluar-masuk supaya rapi: kotak "Kas", kotak "Utang Supplier", kotak "Penjualan Makanan", dst. Modul ini menyediakan 25 kotak standar siap pakai khusus bisnis cafe/restoran, jadi konsultan tidak perlu bikin dari nol tiap ada klien baru.

**2. Neraca (Balance Sheet)**
Foto "kekayaan bisnis" di satu titik waktu. Rumus paling dasar yang harus selalu benar:
`Total yang Dimiliki (Aset) = Total Utang (Liabilitas) + Total Modal Sendiri (Ekuitas)`
Kalau angka ini tidak sama, itu tanda pasti ada kesalahan input yang harus dicek — sistem tidak akan menyembunyikannya atau memaksa "seolah balance".

**3. Arus Kas (Cash Flow)**
Laba Rugi bisa "hijau" (untung) tapi kas di rekening menipis — ini terjadi kalau banyak piutang belum tertagih atau baru belanja banyak stok/alat. Laporan ini melacak ke mana uang benar-benar mengalir, dipisah jadi tiga: dari operasional sehari-hari, dari beli/jual aset, dan dari utang/modal.

**4 & 5. Piutang & Utang (dengan laporan umur/aging)**
Daftar siapa yang belum bayar ke klien (piutang) dan tagihan mana yang belum klien bayar ke supplier (utang), dikelompokkan otomatis: belum jatuh tempo, telat 0-30 hari, 31-60 hari, 61-90 hari, atau lebih dari 90 hari. Ini yang membuat tim bisa proaktif menagih/membayar sebelum jadi masalah besar.

**6. Aset Tetap & Penyusutan**
Peralatan besar (mesin kopi, kulkas, renovasi) nilainya turun tiap bulan seiring pemakaian. Modul ini menghitung penurunan nilai itu secara otomatis dan rata (Metode Garis Lurus), supaya laporan laba rugi dan neraca selalu menunjukkan nilai yang realistis, bukan harga beli awal yang sudah tidak relevan bertahun-tahun kemudian.

**7. Kalkulator Pajak (PPN & PPh Final UMKM)**
Estimasi kasar PPN (11%) dan PPh Final UMKM (0,5% dari omset) yang perlu disetor tiap bulan.
⚠️ **Ini bukan pengganti konsultan pajak.** Tarif bisa berubah, dan tiap klien bisa punya kondisi pajak khusus. Anggap ini alat bantu estimasi cepat internal, angka finalnya tetap wajib dicek ulang oleh akuntan/konsultan pajak klien sebelum dilaporkan resmi ke DJP.

**8. Tutup Buku (Period Close)**
Setelah laporan bulan Agustus dikirim ke klien, sistem sekarang bisa "mengunci" data Agustus supaya tidak ada yang bisa diam-diam mengubahnya lagi. Kalau ada koreksi, harus dibuat sebagai jurnal penyesuaian baru di bulan berjalan — bukan mengubah sejarah yang sudah dilaporkan.

## Yang sudah dites, bukan cuma diklaim
Semua modul di atas sudah saya:
1. Cek dengan TypeScript compiler (`tsc`) — **lolos, 0 error tipe**.
2. Jalankan dengan data simulasi nyata (setor modal, jual makanan, bayar HPP, dst) dan cek hasil hitungannya masuk akal.
3. **Menemukan dan memperbaiki 1 bug nyata** dalam proses ini: versi awal `balanceSheet.ts` membuat Neraca tidak pernah balance karena salah membaca tanda saldo akun Liabilitas/Ekuitas dari `accounting.ts`. Sudah diperbaiki dan dites ulang — sekarang Neraca balance dengan benar.

## Yang masih di luar cakupan (supaya tidak ada klaim berlebihan)
Delapan modul ini membuat fondasi akuntansi TRACE jauh lebih lengkap, tapi belum menjadikan TRACE setara software akuntansi resmi bersertifikasi. Yang masih di luar cakupan:
- Integrasi otomatis ke UI React (`main.tsx`) dan ke database Supabase — modul ini logika murni (`.ts`), belum disambungkan ke tombol/halaman.
- Rekonsiliasi bank otomatis (mencocokkan mutasi bank vs catatan buku).
- Multi-currency dan multi-cabang consolidation penuh.
- Kepatuhan penuh ke format pelaporan pajak resmi DJP (e-Faktur, SPT Masa/Tahunan).
- Verifikasi oleh akuntan publik/auditor eksternal.

## Cara pakai file-file ini
1. Salin semua file di `src/core/` ke folder `src/core/` project TRACE yang asli (tidak menimpa file lain — semua nama file baru).
2. Tambahkan baris berikut ke `src/core/index.ts` project asli, supaya modul baru ikut ter-export:
   ```
   export * from './chartOfAccounts.js';
   export * from './balanceSheet.js';
   export * from './cashFlowStatement.js';
   export * from './accountsReceivable.js';
   export * from './accountsPayable.js';
   export * from './fixedAssets.js';
   export * from './taxCalculator.js';
   export * from './periodClose.js';
   ```
   (Catatan: `accounting.ts` sendiri saat ini **belum** ada di `index.ts` project asli — sebaiknya tambahkan juga `export * from './accounting.js';` supaya modul akuntansi bisa diakses dari luar `src/core`.)
3. Jalankan `npm run typecheck:core` (atau `tsc` sesuai skrip yang sudah ada di project) untuk memastikan tidak ada bentrok nama dengan kode lain.
4. Sambungkan ke UI/Supabase secara bertahap — mulai dari Neraca dan Piutang/Utang karena paling langsung terasa manfaatnya untuk klien.
