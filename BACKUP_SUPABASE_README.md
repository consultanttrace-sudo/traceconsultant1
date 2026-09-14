# Backup Otomatis Supabase — TRACE Consultant OS

## Apa ini?
File `.github/workflows/supabase-backup.yml` bikin GitHub otomatis backup
database Supabase kamu **setiap hari jam 02:00 WIB**, disimpan sebagai file
`.tar.gz` di folder `backups/supabase/` dalam repo ini. Backup lebih dari
30 hari otomatis dihapus supaya repo gak membengkak — kalau butuh retensi
lebih lama, ubah angka `-mtime +30` di file workflow-nya.

Ini dibuat khusus karena **Supabase Free plan tidak punya backup otomatis
sama sekali** — fitur itu baru ada di plan Pro ($25/bln ke atas).

## Cara pasang (5 menit, sekali saja)

1. **Copy folder `.github/` ini ke root repo GitHub kamu** (yang sama
   dengan repo TRACE OS yang di-deploy ke Netlify). Kalau repo kamu sudah
   punya folder `.github/workflows/`, cukup tambahkan file
   `supabase-backup.yml` ke dalamnya.

2. **Ambil connection string Supabase:**
   - Buka Supabase Dashboard → project kamu → **Project Settings → Database**
   - Cari bagian **Connection string**, pilih tab **URI**
   - Pilih mode **Session** (bukan Transaction) — mode ini yang kompatibel dengan `pg_dump`
   - Copy string-nya (formatnya: `postgresql://postgres.xxxxx:[PASSWORD]@...`)
   - Ganti `[PASSWORD]` dengan password database kamu (bukan password login Supabase — cari di halaman yang sama)

3. **Simpan sebagai GitHub Secret:**
   - Di repo GitHub → **Settings → Secrets and variables → Actions**
   - Klik **New repository secret**
   - Nama: `SUPABASE_DB_URL`
   - Value: connection string dari langkah 2
   - Save

4. **Commit & push** folder `.github/` ini ke repo kamu.

5. **Test manual sekali** — buka tab **Actions** di GitHub repo, pilih
   workflow "Supabase Daily Backup" di sidebar kiri, klik **Run workflow**.
   Tunggu ±1 menit, cek apakah muncul folder baru di `backups/supabase/`.

## Cara restore kalau data hilang

```bash
# Download file backup (misal 2026-08-22_020000Z.tar.gz) dari repo,
# lalu extract:
tar -xzf 2026-08-22_020000Z.tar.gz

# Restore ke project Supabase (bisa project baru/kosong untuk test dulu):
psql "postgresql://postgres.xxxxx:[PASSWORD]@..." -f 2026-08-22_020000Z/schema.sql
psql "postgresql://postgres.xxxxx:[PASSWORD]@..." -f 2026-08-22_020000Z/data.sql
```

**Penting:** coba restore ini minimal sekali ke project Supabase kosong
(bukan production) untuk pastikan backup-nya beneran bisa dipakai — backup
yang belum pernah dites restore-nya sama saja belum ada backup.

## Yang TIDAK ter-cover backup ini

- **Supabase Storage** (file/gambar yang di-upload, kalau ada) — ini
  perlu script terpisah, beri tahu saya kalau app kamu memang pakai
  Storage bucket dan saya bantu buatkan.
- **Edge Functions code** — itu sudah otomatis ada di repo GitHub kamu
  sendiri (source code-nya), jadi gak perlu backup terpisah.
- **Row Level Security policies** — biasanya ikut ter-dump di
  `schema.sql`, tapi cek ulang setelah restore test untuk pastikan RLS
  policy-nya utuh.
