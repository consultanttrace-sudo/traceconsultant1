# TRACE Acquisition OS V1 — START HERE

## Cara menjalankan di Mac
1. Unzip folder.
2. Double-click **OPEN_TRACE.command**.
3. Browser akan membuka alamat `http://127.0.0.1:8765/index.html`.
4. Klik **Temukan Calon Klien Hari Ini / START DISCOVERY**.

**Jangan membuka `index.html` dengan double-click**, karena itu menggunakan `file://` dan browser dapat memblokir request discovery.

V1 menggunakan mesin proxy lokal untuk meneruskan request OpenStreetMap/Overpass sehingga discovery tidak bergantung pada CORS browser. Google Places tetap opsional untuk enrichment rating/review/website/telepon.
