# Panduan Data Intake OS

Halaman **Data Intake** adalah pintu masuk data akuntansi ke TRACE OS. Data yang berhasil di-approve di sini akan otomatis muncul di **Overview** (skor kesehatan bisnis) dan **Business Diagnosis** (analisis margin & rekomendasi).

## 1. Format file yang didukung

PDF, Excel (`.xlsx` `.xls` `.ods`), Word (`.docx`), CSV/TSV, TXT, JSON, gambar (dibaca via OCR), dan **ZIP** — TRACE akan otomatis membuka isi ZIP dan memproses tiap file yang didukung di dalamnya. Kalau semua file dalam ZIP itu untuk bisnis & outlet yang sama, angkanya otomatis digabung per bulan (lihat `contoh-data-akuntansi-trace.zip`). Kalau beda bisnis/outlet, TRACE tidak menjumlahkannya otomatis — akan muncul peringatan supaya tidak salah gabung data.

## 2. Kolom yang dicari TRACE

Nama kolom tidak harus persis sama, TRACE mengenali beberapa variasi (tidak case sensitive):

| Field | Nama kolom yang dikenali |
|---|---|
| Nama Bisnis | business name, nama bisnis, nama usaha, company, perusahaan |
| Outlet | outlet, outlet name, nama outlet, cabang, branch, lokasi |
| Periode | period, periode, bulan, month, date, tanggal (atau kolom tanggal transaksi seperti "transaction date", "sold at", "timestamp") |
| Revenue | revenue, sales, penjualan, penjualan bersih, omzet, omset |
| COGS | cogs, hpp, cost of goods sold, harga pokok penjualan, biaya bahan baku |
| Labor | labor, payroll, gaji, upah, beban gaji, tenaga kerja |
| OPEX | opex, operating expense, beban operasional, biaya operasional |

Daftar lengkap yang sama persis juga bisa dilihat langsung di halaman Data Intake (panel "Format & kolom yang dikenali TRACE") — satu sumber data yang sama, jadi tidak akan pernah beda dengan yang tertulis di panduan ini.

Angka boleh format Indonesia: "Rp", titik ribuan, koma desimal. Contoh "Rp 45.000.000" dan "45000000" sama-sama valid.

## 3. Kenapa Overview/Diagnosis bisa kosong padahal Data Intake terlihat 100%

**Ini poin paling penting.** Overview dan Business Diagnosis mengambil angkanya dari **rincian per bulan** (monthly breakdown), bukan dari total keseluruhan yang tampil di layar preview. Kalau kolom Periode/Tanggal tidak terbaca dengan benar di setiap baris, rincian bulanannya kosong — walaupun Revenue/COGS/Labor/OPEX sudah menunjukkan 100% terisi.

Format Periode paling aman: `YYYY-MM-DD` atau `YYYY-MM` (misal `2026-01` atau `2026-01-15`).

## 4. Alur Draft → Reviewed → Approved

Upload file hanya memproses data di layar (belum tersimpan). Data baru benar-benar masuk ke Overview/Diagnosis setelah melalui:
1. **Pilih Klien/Scope** (wajib)
2. Klik **Tandai sudah direview**
3. Klik **Approve import**

Sebelum Approve, data itu masih berupa draft. Sejak versi ini, draft yang sudah punya Klien/Scope bisa dilihat dan dilanjutkan oleh anggota tim mana pun yang login ke client yang sama — tidak lagi terkunci hanya untuk akun yang pertama kali upload.

## 5. Contoh file

- `contoh-data-akuntansi-trace.csv` — satu file, 3 bulan (Kopi Senja, Outlet Kemang), format aggregate biasa.
- `contoh-data-akuntansi-trace.zip` — data yang sama, dipecah jadi 3 file bulanan (Januari.csv, Februari.csv, Maret.csv) untuk mencoba fitur upload ZIP.

Kedua file ini sudah diverifikasi menghasilkan coverage 100% dan monthly breakdown lengkap 3 bulan, sehingga langsung bisa dipakai untuk mengecek tampilan Overview & Business Diagnosis. Datanya sengaja dibuat dengan tren COGS% naik bertahap (35% → 37% → 39%) supaya Business Diagnosis punya sesuatu yang nyata untuk dianalisis.

- Tombol **Unduh Template CSV** di halaman Data Intake menghasilkan file kosong dengan kolom yang benar dan Periode 3 bulan terakhir sudah terisi, tinggal diisi angkanya.
