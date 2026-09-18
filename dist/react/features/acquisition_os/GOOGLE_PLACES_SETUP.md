# Google Places — Optional V1 Enrichment

TRACE Acquisition OS V1 dapat berjalan tanpa Google Places menggunakan OpenStreetMap/Overpass.

Google Places bersifat **optional** dan menambah data seperti rating, jumlah review, website, telepon, jam buka, price level, dan Google Maps URL.

## Yang dibutuhkan

- Google Cloud project
- Places API (New) aktif
- API key yang hanya disimpan sebagai server secret
- Server-side proxy / Supabase Edge Function

Environment secret yang digunakan oleh proxy:

`GOOGLE_PLACES_API_KEY`

## Penting

Jangan menaruh Google API key di `index.html` atau browser.

Di UI, masukkan hanya URL proxy server-side pada **Find Leads → Pengaturan sumber data**.

Jika proxy belum tersedia, pilih Automatic/Hybrid dan V1 tetap berjalan menggunakan OpenStreetMap.

## Tujuan

Google Places bukan sumber tunggal yang menjamin 100% semua bisnis Bogor. Sistem menggabungkan sumber, melakukan deduplication, lalu menyimpan `source` dan `last_checked` agar asal dan freshness data tetap terlihat.
