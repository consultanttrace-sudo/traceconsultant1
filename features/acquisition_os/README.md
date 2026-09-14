[README.md](https://github.com/user-attachments/files/31303256/README.md)
# Panduan Setup TRACE OS (versi sinkron tim + bisa diinstal)

## TAHAP 11B (terbaru) — Final Reliability & Data Integrity

**Konteks:** Tahap 11A mengaudit RANTAI PERHITUNGAN penuh (Purchasing →
... → Dashboard) dan menyimpulkan tidak ada perbaikan yang diperlukan di
situ. Tahap 11B adalah audit di LAPISAN BERBEDA yang belum pernah diaudit
sebelumnya — bukan "apakah angkanya benar", tapi "apakah data tetap aman
saat koneksi/database bermasalah, dan apakah delete/reload/isolasi client
benar-benar tidak bisa bocor". Audit ini menemukan **1 celah reliability
nyata** di lapisan storage (`loadData()`/`saveData()`, dipakai oleh
SELURUH modul CRUD di app — 1 sumber kode yang sama, bukan engine kedua)
dan memperbaikinya secara minimal, tanpa menyentuh calculation engine
manapun.

- **Bug yang ditemukan & diperbaiki — `loadData()` menyamakan "key belum
  pernah diisi" dengan "gagal baca sungguhan"**: sebelumnya, kalau koneksi
  ke Supabase gagal (network error, bukan sekadar "data belum ada"),
  `loadData()` diam-diam balik array kosong `[]` — SAMA PERSIS seperti
  kalau memang belum ada data sama sekali. Ini berbahaya karena HAMPIR
  SEMUA pola edit/delete di app (termasuk `setupModule()`, engine generik
  yang dipakai puluhan section CRUD, dan handler Hapus Company/Brand/
  Outlet) memakai urutan **baca dulu → ubah → simpan lagi**: kalau baca
  gagal tapi dianggap "kosong", langkah simpan berikutnya bisa MENIMPA
  data valid yang sudah ada dengan array kosong/cuma-berisi-1-item-baru —
  berpotensi menghapus seluruh data 1 modul tanpa disadari, tepat
  bertentangan dengan requirement Error Handling & Delete Safety brief
  ini. **Diperbaiki**: `loadData()` sekarang melempar exception saat
  gagal sungguhan (network error, response corrupt) — bukan lagi
  disamarkan jadi `[]` — sehingga proses berhenti SEBELUM sempat
  menyimpan (perilaku `await` bawaan JavaScript), dan setiap titik
  edit/delete diberi `try/catch` eksplisit yang menampilkan status error
  yang jelas ("Gagal memuat data terbaru, penghapusan dibatalkan. Coba
  lagi.") lalu MEMBATALKAN operasi — bukan diam-diam berhenti tanpa
  status. "Key belum pernah diisi" (kondisi normal, bukan kegagalan)
  tetap balik `[]` seperti semula, tidak diubah jadi error palsu.
- **`saveData()` — fallback ke localStorage sudah ada sejak awal (tidak
  diubah perilakunya, data tetap aman), tapi sekarang disertai status
  eksplisit**: sebelumnya kalau cloud gagal di tengah sesi lalu jatuh ke
  localStorage, pemanggil tetap menerima `ok:true` dan menampilkan toast
  sukses generik ("Tersimpan."/"Dihapus.") — padahal sinkron ke tim
  sebenarnya gagal, cuma tersimpan di 1 perangkat. Sekarang `saveData()`
  menampilkan toast eksplisit saat fallback ini terjadi ("Koneksi ke
  database tim bermasalah — data ini tersimpan di perangkat ini dulu,
  belum tersinkron ke tim."), memakai fungsi `toast()` yang sudah ada
  (bukan komponen UI baru).
- **Jaring pengaman tambahan (`unhandledrejection` listener, murni
  tambahan)** — bagian app yang memanggil `loadData()` tanpa `try/catch`
  lokal (mayoritas dashboard/laporan read-only) sudah otomatis AMAN dari
  kehilangan data begitu `loadData()` melempar exception (fungsi berhenti
  sebelum sempat render/save, tampilan lama yang valid tetap
  dipertahankan, bukan ditimpa angka 0/kosong yang salah — sudah sesuai
  requirement Loading/Empty State), tapi sebelumnya user tidak diberi
  tahu ADA yang gagal termuat. Listener global baru ini menangkap
  kegagalan yang tidak tertangani di mana pun dan menampilkan status
  lewat `toast()` yang sudah ada.
- **Delete Safety diperkuat di titik yang paling sering dipakai** —
  handler Hapus di `setupModule()` (dipakai puluhan section: OPEX,
  Marketing/Event, Waste, Productivity, Ops Checklist, Operational KPI,
  dll) dan handler Hapus Company/Brand/Outlet (fondasi hierarki
  Client → Company → Brand → Outlet) sebelumnya TIDAK punya `try/catch`
  sama sekali — kalau `loadData()` gagal di titik ini, secara teknis JS
  tetap otomatis membatalkan (menghentikan proses sebelum baris
  `saveData()`), tapi user tidak pernah diberi status apapun. Sekarang
  eksplisit dibungkus `try/catch` dengan toast error yang jelas.
- **Regression check** — `test_opex.js` (26), `test_target_budget.js`
  (40), `test_forecast.js` (55), `test_marketing_event.js` (52),
  `test_ops_checklist_kpi.js` (48), `test_efficiency.js` (65),
  `test_executive_kpi.js` (65), `test_charts_benchmarking.js` (111), dan
  `test_integration_audit.js` (29) dijalankan ulang dan tetap
  26/26, 40/40, 55/55, 52/52, 48/48, 65/65, 65/65, 111/111, & 29/29 lolos
  **tanpa satu pun file test itu diubah** — dibuktikan 0 baris calculation
  engine (HPP, Recipe, COGS, Revenue, OPEX, Profitability, Target,
  Budget, Forecast, Marketing, Operations, Efficiency, Executive KPI,
  Charts) tersentuh oleh perbaikan 11B ini. `node --check` atas seluruh
  script `index.html` lolos tanpa syntax error.
- **`test_reliability.js` (baru, 19 assertion)** — test lapisan
  storage/error-handling yang diperbaiki (bukan calculation engine):
  re-implementasi PERSIS `loadData()`/`saveData()`/pola delete
  `setupModule()` versi 11B dengan Supabase & localStorage di-mock,
  membuktikan: (1) delete/create dibatalkan & data lama tetap utuh saat
  `loadData()` gagal sungguhan (bukan tertimpa array kosong/parsial); (2)
  key yang memang belum pernah diisi tetap dianggap normal, bukan
  false-positive error; (3) delete normal tetap berhasil seperti biasa
  (baseline, tidak regresi) — item hilang, item lain utuh; (4) setelah
  delete lalu reload, item tetap hilang (tidak "hidup lagi" akibat race
  condition); (5) `saveData()` yang gagal di cloud tetap aman lewat
  fallback localStorage + toast status jelas, bukan sukses diam-diam yang
  menyesatkan; (6) isolasi Client A/B tetap tidak tercampur walau ada
  skenario kegagalan; (7) data lokal yang corrupt (JSON rusak) dianggap
  kegagalan sungguhan, bukan disamarkan jadi kosong.
- **Diperiksa & dinyatakan `OK` tanpa perlu perubahan** (bagian dari
  cakupan brief 11B yang sudah aman dari awal, jadi sengaja TIDAK
  disentuh supaya diff tetap minimal): CRUD/duplicate prevention (edit =
  UPDATE by id, bukan duplicate — sudah diverifikasi di setiap tahap
  sejak Tahap 6/OPEX); Historical data (tiap record punya bulan+tahun
  sendiri, bulan lama tidak pernah ditimpa bulan baru — pola konsisten
  sejak Tahap 1); Client/Brand/Outlet isolation (kunci isolasi selalu
  `outletId`/`scope`/`klienId`, bukan nama — diverifikasi ulang di Tahap
  11A `test_integration_audit.js`); Calculation safety (NaN/Infinity/
  undefined) — sudah diverifikasi di HAMPIR SEMUA test sebelumnya
  (`opexPct()`/`t7aAchievementPct()`/dst selalu balas "N/A"/`null`, bukan
  `NaN`); Realtime reload race condition — begitu `loadData()` melempar
  exception saat gagal (perbaikan 11B), `handle.reload()` yang dipicu
  event realtime otomatis berhenti sebelum sempat render ulang, sehingga
  tampilan lama yang valid tetap dipertahankan (tidak "flash ke kosong").
- **Tidak dikerjakan** (sesuai batasan brief 11B): tidak ada fitur bisnis
  baru, tidak ada redesign UI, tidak ada perubahan skema data besar, tidak
  ada calculation engine baru/diubah, ERP/POS/ROI baru/AI tidak dikerjakan,
  dan **tidak lanjut ke tahap lain setelah 11B**.

## TAHAP 11A — Integration Audit & Data Flow

**Konteks:** Sampai Tahap 10B, tiap engine (Purchasing/Inventory/Ingredient/
Recipe-HPP/Sales/OPEX/Target-Budget/Forecast/Executive KPI/Charts) sudah
dibangun bertahap dengan pola "1 sumber data, tidak ada engine kedua" — tapi
belum pernah diaudit sebagai 1 RANTAI PENUH sekaligus:
`PURCHASING → INVENTORY → INGREDIENT → RECIPE/HPP → SALES → COGS → REVENUE →
OPEX → OPERATING PROFIT → TARGET/BUDGET → FORECAST → DASHBOARD`. Tahap 11A
adalah **audit murni** (bukan fitur baru) — tiap link dicek satu per satu di
`index.html`, dan **tidak ditemukan perbaikan yang diperlukan**: seluruh
rantai sudah konsisten. **0 baris kode lama diubah** — tidak ada satu pun
fungsi engine yang disentuh, karena audit tidak menemukan penyimpangan dari
prinsip "1 sumber data" yang sudah dipegang sejak Tahap 1.

- **Hasil audit per link (10 poin sesuai cakupan brief):**
  1. **Ingredient cost dari Ingredient Master/price history** — `OK`.
     `ingredientCostPerUnitAt()` (index.html) selalu membaca `hargaBeli`/
     `priceHistory` milik Ingredient Master, tidak ada harga bahan yang
     di-hard-code di tempat lain.
  2. **Recipe/HPP = sumber COGS theoretical** — `OK`. `hppForPeriod()`
     membaca `costSnapshots` (dibangun dari Recipe + harga ingredient yang
     berlaku pada `effectiveDate`-nya, lewat `buildCostSnapshot()`) — dipakai
     APA ADANYA oleh `outletCogs()`, tidak ada COGS engine kedua.
  3. **Sales pakai Produk + harga jual + HPP existing** — `OK`.
     `outletRevenue()`/`outletCogs()` (dipanggil di 13 titik berbeda di
     seluruh file — Dashboard, Akuntansi, Executive KPI, Charts — SEMUANYA
     memanggil fungsi yang sama, tidak ada satu pun yang menghitung
     ulang dengan rumus sendiri) membaca `produkMap` + `hppForPeriod()`.
  4. **Revenue Dashboard dari Sales existing** — `OK`. Kartu Dashboard
     (`computeOutletCompare()`) dan Executive KPI (`computeOpexProfitability()`
     sama-sama membaca `ALL_KEYS.outletJual` lewat `outletRevenue()` yang
     sama, hanya beda cara filter scope (`activeKlienId` di Dashboard vs
     `activeAktScope` di Akuntansi — dua selector scope ini sudah ada sejak
     Tahap 3/5, BUKAN engine data ganda, keduanya membaca tabel data yang
     sama, hanya beda filter tampilan).
  5. **COGS Dashboard dari Sales/HPP existing** — `OK`, sama seperti poin 4
     (`outletCogs()` yang sama).
  6. **OPEX pakai OPEX Master existing** — `OK`. Kartu OPEX Dashboard,
     `computeOpexProfitability()`, dan Budget vs Actual Marketing (Tahap 8)
     semuanya membaca `ALL_KEYS.opex` mentah, tidak ada tabel OPEX kedua.
  7. **Profitability = Revenue − COGS − OPEX** — `OK`, diverifikasi persis
     di `computeOpexProfitability()` dan diuji ulang di
     `test_integration_audit.js` baris demi baris (Gross Profit = Revenue −
     COGS, Operating Profit = Gross Profit − OPEX).
  8. **Target/Budget/Forecast murni membandingkan, tidak duplikat angka** —
     `OK`. `computeTargetVsActual()` membaca `actual.totalRevenue`/
     `totalOperatingProfit`/`totalOpex` APA ADANYA dari
     `computeOpexProfitability()` (parameter, bukan dihitung ulang);
     `computeForecastYear()`/`fcAverage()` murni rata-rata dari bulan Actual
     yang sudah ada, tidak pernah menulis angka baru sebagai "Actual".
  9. **Dashboard/Charts dari engine yang sama** — `OK`. Seluruh chart Tahap
     10B (`cbMonthPoint()`/`cbBuildMonthlySeries()`/`cbForecastSeries()`/
     `cbBenchmarkSeries()`) murni fungsi *data-shaping* di atas hasil
     `computeExecutiveKpi()`/`computeForecastYear()`, tidak menghitung ulang
     apapun.
  10. **Isolasi Client → Brand → Outlet konsisten** — `OK`. Seluruh engine
      Akuntansi (Ingredient/OPEX/Target/Budget/Sales/Profitability/Executive
      KPI/Charts) mem-filter lewat `activeAktScope` + `outletId` per-record
      (bukan per-nama) — outlet dengan NAMA SAMA di Client berbeda (mis.
      sama-sama "Jakarta") tidak pernah tercampur karena kunci isolasinya
      `outletId` (unik per outlet), bukan nama. Diverifikasi ulang lewat
      skenario baru di `test_integration_audit.js` (Client A & B, outlet
      "Jakarta" di kedua sisi, OPEX & Revenue/COGS terbukti tidak tercampur).
- **Catatan arsitektur (BUKAN bug, sengaja tidak diubah sesuai batasan
  brief "jangan mengubah schema besar jika tidak diperlukan")**: ada 2
  selector scope yang hidup berdampingan sejak lama — `activeKlienId`
  (sidebar "Klien Aktif", dipakai Dashboard/Company-Brand-Outlet/Timeline/
  Presentasi/Dokumen) dan `activeAktScope` (dropdown "Scope data" di
  halaman Akuntansi, dipakai Ingredient/Purchasing/Sales/OPEX/Target/
  Budget/Forecast/Executive KPI/Charts). Keduanya membaca **tabel data
  yang identik** (`ALL_KEYS.outletJual`, `ALL_KEYS.opex`, dst) lewat
  fungsi yang sama — hanya beda dropdown filter mana yang aktif di
  halaman masing-masing. Ini pola yang sudah didokumentasikan sejak
  Tahap 3/5, bukan penyimpangan data flow.
- **`test_integration_audit.js` (baru, 29 assertion)** — test RANTAI PENUH
  dalam 1 skenario (beda dari test sebelumnya yang menguji 1 engine
  terisolasi): Ingredient price history (Jan Rp160rb/kg vs Feb Rp180rb/kg)
  → Recipe 18g kopi/cup → costSnapshot Jan & Feb → HPP Jan ≠ HPP Feb (tidak
  bocor) → Sales 100 cup Feb → Revenue = qty×harga jual, COGS = qty×HPP Feb
  → OPEX Master (Client A Rp13jt, Client B "Jakarta" Rp3jt, TIDAK
  tercampur) → Gross Profit = Revenue−COGS, Operating Profit = Gross
  Profit−OPEX → Target/Budget Achievement % baca Actual existing apa
  adanya → Forecast = rata-rata Actual existing → Chart point identik
  dengan Executive KPI/Profitability existing → edge case Target=0/
  Konversi=0/scope kosong tidak NaN/Infinity → edit (UPDATE bukan
  duplicate)/delete/reload (round-trip JSON) OPEX tetap konsisten.
- **Regresi**: `test_opex.js` (26), `test_target_budget.js` (40),
  `test_forecast.js` (55), `test_marketing_event.js` (52),
  `test_ops_checklist_kpi.js` (48), `test_efficiency.js` (65),
  `test_executive_kpi.js` (65), dan `test_charts_benchmarking.js` (111)
  dijalankan ulang dan tetap 26/26, 40/40, 55/55, 52/52, 48/48, 65/65,
  65/65, & 111/111 lolos tanpa satu pun file itu diubah. `node --check`
  atas seluruh script `index.html` juga lolos tanpa syntax error.
- **Tidak dikerjakan** (sesuai batasan brief 11A): tidak ada UI baru, tidak
  ada fitur besar baru, tidak ada calculation engine kedua, tidak ada
  perubahan schema besar, Revenue TRACE Consultants tidak disentuh, ERP/POS
  eksternal tidak dikerjakan, dan **tidak lanjut ke Tahap 11B**.

## TAHAP 10B — Charts & Benchmarking

**Konteks:** Tahap 10A sudah menaruh 11 KPI utama, Outlet Ranking, dan
Needs Attention berdampingan dalam bentuk kartu/tabel angka — tapi belum
ada visualisasi grafik (trend bulanan, perbandingan antar outlet) yang
mempercepat pembacaan pola. Tahap 10B menambahkan **lapisan visualisasi
murni** (SVG line chart utk trend, SVG bar chart utk perbandingan) di atas
data yang SUDAH ADA — **tidak ada tabel/key data baru yang disimpan**
(`ALL_KEYS` tidak bertambah key apapun) dan **tidak mengubah/menghitung
ulang** `computeOpexProfitability()`/`computeTargetVsActual()`/
`computeForecastYear()`/`computeEfficiency()`/`computeExecutiveKpi()`
manapun (diverifikasi lewat diff: 357 baris ditambah, **0 baris lama
berubah/dihapus** — pola yang sama seperti Tahap 2–10A).

- **Charts & Benchmarking** — section baru di halaman Akuntansi (di bawah
  Executive KPI/Needs Attention), berisi:
  - **Revenue** — Actual vs Target bulanan (line chart), Actual vs Forecast
    bulanan (line chart, dibaca APA ADANYA dari `computeForecastYear()`
    TAHAP 7B).
  - **Profit** — Gross Profit trend bulanan (line chart), Operating Profit
    trend bulanan (line chart).
  - **Cost** — Food Cost % trend bulanan (line chart), OPEX Actual vs
    Budget bulanan (bar chart), Waste Cost trend bulanan (line chart).
  - **Outlet Benchmark** — bar chart Revenue, Gross Profit, Operating
    Profit, Operating Margin %, Food Cost %, dan Waste % berdampingan utk
    seluruh Outlet dalam Client aktif.
- **Tidak ada calculation engine kedua** — grafik trend bulanan memanggil
  `computeExecutiveKpi()` (TAHAP 10A, orkestrasi TAHAP 6/7A/9B) per bulan
  (pola loop yang sama seperti `computeForecastYear()` TAHAP 7B), grafik
  Actual vs Forecast membaca `computeForecastYear()` (TAHAP 7B) apa
  adanya, dan Outlet Benchmark membaca `rows` `computeExecutiveKpi()`
  (TAHAP 10A) apa adanya — seluruhnya murni fungsi *data-shaping*
  (`cbMonthPoint()`/`cbBuildMonthlySeries()`/`cbForecastSeries()`/
  `cbBenchmarkSeries()`), bukan rumus baru.
- **Filter — TIDAK ADA sistem filter kedua** — grafik trend bulanan
  mengikuti Client aktif (`activeAktScope`) + "Tahun ditampilkan"
  (`activeAktYear`, dropdown `#akt_tahun` yang sudah ada di atas halaman
  Akuntansi); Outlet Benchmark memakai periode Bulan+Tahun yang SAMA
  PERSIS dengan dropdown Executive KPI TAHAP 10A (`#exec_calc_bulan`/
  `#exec_calc_tahun`) — mengubah dropdown itu otomatis ikut menggerakkan
  Outlet Benchmark (listener tambahan, listener lama TAHAP 10A tidak
  disentuh/diganti).
- **Chart ringan tanpa library** — line chart me-*reuse* `renderLineChart()`
  yang sudah ada (dipakai juga oleh grafik Revenue KPI &amp; Cash Flow,
  TIDAK diubah sama sekali); bar chart adalah fungsi SVG baru
  (`renderCbBarChart()`) dengan pola visual yang sama, khusus utk
  perbandingan (Outlet Benchmark & OPEX Actual vs Budget) — tidak ada
  dashboard baru yang penuh sesak, seluruh chart tetap di 1 section yang
  sama dengan Executive KPI.
- **"No data" (bukan NaN/Infinity/0 palsu)** — kalau Client aktif belum
  punya Outlet sama sekali, Outlet Benchmark menampilkan teks **"No data"**
  (dicek murni struktural lewat `cbHasOutlets()`, BUKAN dari nilai metrik —
  Outlet dengan Revenue 0 yang benar-benar ada tetap dianggap data valid,
  bukan "No data"). Bulan yang belum punya data sama sekali pada grafik
  trend digambar sebagai celah (gap) di garis, bukan turun ke 0. Target
  Revenue/Budget OPEX yang belum diisi (0) dipetakan jadi `null`, bukan 0
  palsu — konsisten dengan pola `opexPct()`/`t7aAchievementPct()` (pembagi
  0 → N/A/null) yang sudah ada sejak Tahap 6/7A.
- **Isolasi Client/Outlet** — seluruh data chart mengalir dari
  `computeExecutiveKpi()`/`computeForecastYear()` yang scope-nya SUDAH
  terisolasi lewat `activeAktScope`/`outletsForAktScope()` (sama seperti
  seluruh blok Akuntansi lain) — Tahap 10B sendiri tidak menambah/mengubah
  logika isolasi apapun, murni memvisualisasikan hasil yang sudah
  terisolasi itu.
- **Belum dikerjakan** (sesuai cakupan Tahap 10B, di luar fokus kali ini):
  UX/UI overhaul, ERP, POS, Marketing baru, AI, atau Tahap 11.
- Sudah diuji (111 assertion lewat test logika terisolasi memakai fungsi
  *data-shaping* yang sama persis seperti `cbMonthPoint()`/
  `cbBuildMonthlySeries()`/`cbForecastSeries()`/`cbBenchmarkSeries()`/
  `cbHasOutlets()` di `index.html` — lihat `test_charts_benchmarking.js`):
  pemetaan `computeExecutiveKpi()`→titik chart apa adanya (Target/Budget=0
  →null, bukan 0 palsu); 12 titik bulanan (Jan–Des) dengan sebagian bulan
  belum ada data (null, bukan 0/NaN) tanpa menggeser urutan bulan; Actual
  vs Forecast dari `computeForecastYear()` (skenario wajib brief Tahap 7B:
  Jan 80jt/Feb 90jt/Mar 100jt → rata-rata 90jt, Jan–Mar ACTUAL, Apr–Des
  FORECAST) — titik ACTUAL tidak pernah bocor ke seri FORECAST dan
  sebaliknya; Outlet Benchmark per-metrik (Revenue/Gross Profit/Operating
  Profit/Operating Margin %/Food Cost %/Waste %) apa adanya dari rows
  Tahap 10A, termasuk value `null` (Revenue outlet=0) tidak mencemari
  outlet lain; Client isolation & Outlet isolation (outletId sama di rows
  yang disuntik terpisah tidak pernah tercampur); Monthly Trend (urutan
  Jan–Des tidak tergeser); Target vs Actual & Actual vs Forecast tidak
  saling menimpa; Outlet Comparison (2 outlet berdampingan, urutan sesuai
  rows); Zero data (`cbHasOutlets([])` → false → "No data", seluruh field
  terkait null bukan NaN); Reload (round-trip JSON); berbagai skenario
  ekstrem (Revenue negatif, field undefined/null, forecast tanpa data sama
  sekali) tidak pernah menghasilkan NaN/Infinity di titik manapun.
  Regresi: `test_opex.js` (26), `test_target_budget.js` (40),
  `test_forecast.js` (55), `test_marketing_event.js` (52),
  `test_ops_checklist_kpi.js` (48), `test_efficiency.js` (65), dan
  `test_executive_kpi.js` (65) dijalankan ulang dan tetap 26/26, 40/40,
  55/55, 52/52, 48/48, 65/65, & 65/65 lolos tanpa perubahan sama sekali
  pada filenya. `node --check` atas seluruh script `index.html` juga lolos
  tanpa syntax error.

## TAHAP 10A — Executive KPI

**Konteks:** Sampai Tahap 9B, angka Revenue/COGS/Food Cost/Gross Profit/
OPEX/Operating Profit/Target/Budget/Waste/Productivity sudah tersebar di
banyak section terpisah di halaman Akuntansi (Outlet Profitability, Target
vs Actual, Food Cost Analysis, Efficiency & Comparison) — belum ada 1
dashboard ringkas yang menaruh SEMUA KPI utama berdampingan per Client
aktif, plus ranking outlet dan daftar alert sederhana. Tahap 10A menambahkan
**dashboard data sederhana murni** (`computeExecutiveKpi()`) di atas
engine-engine yang sudah ada — **tidak ada tabel data baru yang disimpan**
(`ALL_KEYS` tidak bertambah key apapun) dan **tidak mengubah/rewrite
Revenue/COGS/HPP/Food Cost/Inventory/OPEX/Target/Budget/Forecast/Marketing/
ROI/Operations/Efficiency manapun** (diverifikasi lewat diff: 231 baris
ditambah, **0 baris lama berubah/dihapus** — bahkan lebih bersih dari pola
Tahap 2–9B yang biasanya menambah 1 koma).

- **Executive KPI** — section baru "Executive KPI" di halaman Akuntansi (di
  bawah Efficiency & Comparison): pilih Bulan+Tahun → 11 kartu ringkasan
  utk Client aktif (scope) — Revenue, Revenue Achievement %, COGS, Food
  Cost %, Gross Profit, OPEX, Operating Profit, Operating Margin %, Waste
  Cost, Waste %, Productivity Achievement. **SELURUH angka dibaca APA
  ADANYA** dari `computeOpexProfitability()` (TAHAP 6, lewat
  `computeEfficiency()`), `computeTargetVsActual()` (TAHAP 7A), dan
  `computeEfficiency()` (TAHAP 9B) — `computeExecutiveKpi()` murni
  menggabungkan (orchestrate) hasil ketiganya + menjumlahkan Target
  Revenue/Budget OPEX **per-outlet** (reuse `t7aScopeList()` yang sama
  persis dipakai Target/Budget TAHAP 7A). Food Cost % & Operating Margin %
  pakai `opexPct()`/`opexPctDisplay()` yang sudah ada (rumus sama persis
  OPEX % TAHAP 6, level outlet/total — bukan per-produk). Kalau pembagi = 0
  (Revenue/Target/Budget belum diisi) → **"N/A"** (bukan `NaN`/`Infinity`).
- **Outlet Ranking** — tabel Outlet | Revenue | Operating Profit |
  Operating Margin %, bisa diurutkan lewat dropdown "Urutkan berdasarkan"
  (Revenue/Operating Profit/Operating Margin %). Hanya outlet milik Client
  aktif (`outletsForAktScope()`, sama persis pola Efficiency & Comparison
  9B) — outlet dengan nama sama di Client berbeda tidak pernah tercampur.
- **Needs Attention** — daftar alert per outlet lewat **rule sederhana &
  tetap** (bukan AI/scoring kompleks): **Critical** kalau Operating Profit
  outlet negatif; **Attention** kalau Revenue di bawah Target (Target
  outlet itu harus > 0 dulu — belum diisi = tidak dicek), Food Cost % di
  atas threshold tetap 35% (`EXEC_KPI_THRESHOLDS.foodCostTargetPct` — engine
  existing tidak punya modul Food Cost Target tersendiri, jadi dipakai 1
  threshold tetap sama pola `EFF_THRESHOLDS`/`FC_STATUS_THRESHOLDS` yang
  sudah ada, bukan data tersimpan/engine baru), OPEX di atas Budget outlet
  itu (Budget harus > 0 dulu), Waste % > 5% (`EFF_THRESHOLDS.wasteAttentionPct`,
  **direuse**, bukan threshold baru), atau Productivity Achievement rata-rata
  < 80% (`EFF_THRESHOLDS.achievementAttentionPct`, **direuse**). Kalau tidak
  ada outlet yang memicu rule apapun → **"All metrics healthy."**
- **Drill-down** — tiap kartu KPI & tiap baris alert punya tombol "Detail"
  yang men-scroll ke section sumber datanya yang **sudah ada** di halaman
  Akuntansi yang sama (Outlet Profitability/Target vs Actual/Food Cost
  Analysis/Budget OPEX/Efficiency & Comparison) — **tidak ada halaman
  baru**.
- **Isolasi Client/Outlet** — mengikuti `activeAktScope`/
  `outletsForAktScope()` yang sama persis seluruh blok Akuntansi lain;
  Target Revenue/Budget OPEX difilter tambahan per `outletId` (outlet
  dengan `outletId` kebetulan sama di Client berbeda tidak pernah
  tercampur, dan outlet lain dalam Client yang sama juga tidak saling
  memakai Target/Budget outlet lain).
- **Belum dikerjakan** (sesuai cakupan Tahap 10A, di luar fokus kali ini):
  Grafik kompleks, Benchmarking lanjutan, ERP, POS, UI redesign besar, atau
  Tahap 10B.
- Sudah diuji (65 assertion lewat test logika terisolasi memakai rumus yang
  sama seperti `t7aScopeList()`/`opexPct()`/`t7aAchievementPct()`/
  `computeExecutiveKpi()` (rules Needs Attention) di `index.html` — lihat
  `test_executive_kpi.js`): total KPI per Client (Revenue/Revenue
  Achievement %/COGS/Food Cost %/Gross Profit/OPEX/Operating Profit/
  Operating Margin %/Waste Cost/Waste %/Productivity Achievement, semua
  dibaca dari hasil TAHAP 6/7A/9B yang disuntik sebagai parameter, TIDAK
  dihitung ulang); Food Cost %/Operating Margin % per outlet; Target
  Revenue/Budget OPEX per-outlet (filter by outletId, tidak tercampur ke
  outlet lain); Outlet Ranking (sort by Revenue/Operating Profit/Operating
  Margin %); Needs Attention (Critical Operating Profit negatif, Attention
  Revenue di bawah Target/Food Cost di atas target/OPEX di atas Budget/
  Waste tinggi/Productivity di bawah Target — termasuk Target/Budget/Revenue
  di ATAS/dalam batas yang TIDAK memicu Attention); All metrics healthy
  (tidak ada rule terpicu sama sekali); Client A/B isolation (Target
  Revenue/Budget OPEX, termasuk outletId sama di Client berbeda); Outlet
  isolation (Client sama, outletId beda); zero Revenue & zero Target/Budget
  (semua field terkait "N/A", 0 alert terpicu); reload (round-trip JSON);
  berbagai skenario ekstrem tidak pernah menghasilkan NaN/Infinity di field
  manapun. Regresi: `test_opex.js` (Tahap 6, 26 assertion),
  `test_target_budget.js` (Tahap 7A, 40 assertion), `test_forecast.js`
  (Tahap 7B, 55 assertion), `test_marketing_event.js` (Tahap 8, 52
  assertion), `test_ops_checklist_kpi.js` (Tahap 9A, 48 assertion), dan
  `test_efficiency.js` (Tahap 9B, 65 assertion) dijalankan ulang dan tetap
  26/26, 40/40, 55/55, 52/52, 48/48, & 65/65 lolos tanpa perubahan sama
  sekali pada filenya.

## TAHAP 9B — Operational Efficiency

**Konteks:** Sampai Tahap 9A, sistem sudah mencatat checklist/task
operasional dan KPI operasional per Client/Outlet (`ALL_KEYS.opsChecklist`/
`ALL_KEYS.opsKpi`), tapi belum ada yang mengukur **efisiensi outlet**
secara langsung — belum ada tempat mencatat waste (bahan/item terbuang)
maupun KPI produktivitas sederhana, dan belum ada 1 tabel yang menaruh
Revenue, Waste, Productivity, dan Operating Profit berdampingan per outlet
supaya efisiensi antar-outlet bisa langsung dibandingkan. Tahap 9B
menambahkan 2 data BARU murni (`ALL_KEYS.waste`, `ALL_KEYS.productivity`)
+ 1 lapisan reporting (Efficiency & Comparison) di atasnya — **tidak
mengubah/rewrite Revenue/COGS/HPP/Food Cost/Inventory/OPEX/Target/Budget/
Forecast/Marketing/ROI/Operations 9A manapun** (diverifikasi lewat diff:
525 baris ditambah, hanya 1 baris lama berubah sekadar menambah koma
setelah `opsKpi` di `ALL_KEYS`, sama seperti pola Tahap 2–9A).

- **Waste** — CRUD baru "Waste" di halaman Akuntansi (di bawah Operations
  Checklist & KPI): Client (= scope aktif dropdown "Scope data" di atas —
  pola sama persis dengan Ingredient/OPEX/Target/Budget/Marketing-Event/
  Operations 9A), Brand opsional, Outlet opsional, Date, Category, Item,
  Qty, Cost, Reason, Notes. Brand/Outlet dikosongkan berarti waste itu
  melekat ke Client/Brand secara umum — **tidak pernah dipaksa/
  dialokasikan otomatis** ke outlet manapun, pola sama persis OPEX/
  Marketing-Event/Operations 9A. Total **Waste Cost** dan **Waste %
  terhadap Revenue existing** (dari Outlet Profitability Tahap 6, tidak
  dihitung ulang) ditampilkan di section Efficiency di bawahnya.
- **Productivity** — CRUD baru "Productivity" (per Client/Outlet, modul
  terpisah dari "Operational KPI" Tahap 9A — tidak menyentuhnya sama
  sekali): Metric, Target, Actual, Period (Bulan+Tahun), Outlet opsional,
  Notes. **Achievement % = Actual / Target × 100.** Kalau Target = 0 →
  **"N/A"** (bukan `NaN`/`Infinity`), pola sama persis
  `opexPct()`/`okpiAchievementPct()` yang sudah ada.
- **Efficiency per Outlet** — section baru di bawah Waste & Productivity:
  pilih Bulan+Tahun → tabel per-outlet **Revenue → Waste Cost → Waste % →
  Productivity Achievement (rata-rata seluruh Metric outlet itu, Metric
  dengan Target = 0 tidak diikutkan) → Operating Profit (dibaca APA ADANYA
  dari Outlet Profitability Tahap 6) → Status**. Status ∈
  {Healthy, Attention, Critical} lewat **rule sederhana & tetap**
  (`EFF_THRESHOLDS`/`effStatus()` — bukan AI/scoring kompleks): Critical
  kalau Operating Profit negatif ATAU Waste % > 10%; Attention kalau
  Waste % > 5% ATAU Productivity Achievement rata-rata < 80%; Healthy
  selain itu. Metrik yang datanya belum ada (N/A) tidak pernah memicu
  Attention/Critical dengan sendirinya.
- **Comparison** — tabel Efficiency per Outlet di atas menampilkan seluruh
  outlet dalam Client aktif berdampingan (mengikuti
  `outletsForAktScope()`/`activeAktScope` yang sama seperti seluruh blok
  Akuntansi lain), jadi outlet bisa langsung dibandingkan. Outlet dengan
  nama sama di Client berbeda **tidak pernah tercampur** — mengikuti
  isolasi `computeOpexProfitability()` (Tahap 6) yang sudah ada.
- **Isolasi Client/Brand/Outlet** — `scope` (activeAktScope, sama persis
  pola Ingredient/OPEX/Target/Budget/Marketing-Event/Operations 9A) +
  `brandId`/`outletId` opsional; Client/Outlet berbeda (termasuk outletId
  yang kebetulan sama di Client berbeda) tidak pernah tercampur — berlaku
  utk Waste maupun Productivity.
- **Validasi** — Target/Revenue = 0 → Achievement/Waste % ditampilkan
  **"N/A"** (bukan `NaN`/`Infinity`), diverifikasi lewat test skenario
  ekstrem (Cost/Target/Actual negatif, undefined, NaN, revenue 0, target
  0). **Edit = UPDATE, bukan duplicate** — pola sama persis OPEX/
  Marketing-Event/Operations 9A (dicocokkan lewat id record). Data periode
  lama (mis. Januari) tidak berubah saat periode baru (Februari) dibuat/
  diedit setelahnya. Reload (round-trip JSON, pola localStorage) tetap
  mempertahankan data.
- **Belum dikerjakan** (sesuai cakupan Tahap 9B, di luar fokus kali ini):
  Payroll, HR, ERP, POS, AI, dashboard redesign, atau Tahap 10.
- Sudah diuji (65 assertion lewat test logika terisolasi memakai rumus
  yang sama seperti `effScopeList()`/`wastePctOfRevenue()`/
  `pkpiAchievementPct()`/`effStatus()`/`computeEfficiency()`/handler submit
  `#wstForm` & `#pkpiForm` (edit by id) di `index.html` — lihat
  `test_efficiency.js`): Waste — add/edit (UPDATE bukan duplicate)/delete/
  reload; Productivity — add/edit (UPDATE bukan duplicate)/delete/reload;
  Achievement % normal, Target = 0 → "N/A", Actual = 0 dgn Target > 0 → 0%
  (bukan N/A), Actual & Target sama-sama 0 → "N/A"; Waste % normal,
  Revenue = 0 → "N/A", Waste Cost = 0 → 0% (bukan N/A); Status rule
  Healthy/Attention/Critical (termasuk Critical menang atas Attention saat
  Operating Profit negatif + Waste di level Attention, dan status tetap
  Healthy kalau Waste/Productivity belum ada data sama sekali); Efficiency
  per outlet + Comparison 2 outlet dalam 1 Client (Waste Client-level
  outletId null tidak ikut ke outlet manapun tapi tetap masuk Total Waste
  Cost); Client isolation (Waste & Productivity); outlet dengan outletId
  SAMA PERSIS di Client berbeda tidak pernah tercampur ke Efficiency Client
  aktif; skenario Revenue = 0 & Target = 0 sekaligus (Waste %, Achievement,
  Total Waste % semua "N/A", Status tetap terhitung benar dari Operating
  Profit); historical periode (Januari tidak berubah saat Februari dibuat/
  diedit); berbagai skenario ekstrem (Cost/Target/Actual negatif, kosong/
  undefined, NaN) tidak pernah menghasilkan NaN/Infinity di field manapun.
  Regresi: `test_opex.js` (Tahap 6, 26 assertion), `test_target_budget.js`
  (Tahap 7A, 40 assertion), `test_forecast.js` (Tahap 7B, 55 assertion),
  `test_marketing_event.js` (Tahap 8, 52 assertion), dan
  `test_ops_checklist_kpi.js` (Tahap 9A, 48 assertion) dijalankan ulang dan
  tetap 26/26, 40/40, 55/55, 52/52, & 48/48 lolos tanpa perubahan sama
  sekali pada filenya.

## TAHAP 9A — Operations Checklist & KPI

**Konteks:** Sampai Tahap 8, belum ada tempat mencatat checklist/task
operasional harian (SOP, kebersihan, safety, dst) maupun KPI operasional
non-finansial per Client/Outlet (mis. Customer Satisfaction Score,
On-time Delivery %) — modul KPI yang sudah ada ("KPI & Target" di sidebar)
khusus KPI Individu/Tim, bukan KPI per Client/Outlet. Tahap 9A menambahkan
2 data BARU murni (`ALL_KEYS.opsChecklist`, `ALL_KEYS.opsKpi`) + reporting
Achievement % di atasnya — **tidak mengubah/rewrite Revenue/COGS/HPP/Food
Cost/Inventory/OPEX/Target/Budget/Forecast/Marketing/ROI manapun**
(diverifikasi lewat diff: 374 baris ditambah, hanya 1 baris lama berubah
sekadar menambah koma setelah `marketingEvent` di `ALL_KEYS`, sama seperti
pola Tahap 2–8).

- **Operations Checklist** — CRUD baru "Operations Checklist" di halaman
  Akuntansi (di bawah Marketing/Event Master): Client (= scope aktif
  dropdown "Scope data" di atas — pola sama persis dengan
  Ingredient/OPEX/Target/Budget/Marketing-Event), Brand opsional, Outlet
  opsional, Date, Checklist/Task, Category, Status (Pending/Done), Notes.
  Brand/Outlet dikosongkan berarti task itu melekat ke Client/Brand secara
  umum — **tidak pernah dipaksa/dialokasikan otomatis** ke outlet
  manapun, pola sama persis OPEX/Marketing-Event.
- **Operational KPI** — CRUD baru "Operational KPI" (per Client/Outlet):
  KPI Name, Target, Actual, Period (Bulan+Tahun), Notes, Outlet opsional.
  **Achievement % = Actual / Target × 100.** Kalau Target = 0 →
  **"N/A"** (bukan `NaN`/`Infinity`), pola sama persis
  `opexPct()`/`t7aAchievementPct()` yang sudah ada. Berbeda total dari
  menu "KPI & Target" (KPI Individu/Tim, `ALL_KEYS.kpi`) — modul terpisah,
  tidak disentuh sama sekali.
- **Isolasi Client/Brand/Outlet** — `scope` (activeAktScope, sama persis
  pola Ingredient/OPEX/Target/Budget/Marketing-Event) + `brandId`/
  `outletId` opsional; Client/Outlet berbeda (termasuk outletId yang
  kebetulan sama di Client berbeda) tidak pernah tercampur — berlaku utk
  Checklist maupun KPI.
- **Edit = UPDATE, bukan duplicate** — pola sama persis OPEX/Marketing-
  Event Master (dicocokkan lewat id record). Data periode lama (mis.
  Januari) tidak berubah saat periode baru (Februari) dibuat/diedit
  setelahnya. Reload (round-trip JSON, pola localStorage) tetap
  mempertahankan data.
- **Belum dikerjakan** (sesuai cakupan Tahap 9A, di luar fokus kali ini):
  Payroll, HR, ERP, POS, AI, dashboard redesign, inventory baru, Tahap 9B.
- Sudah diuji (48 assertion lewat test logika terisolasi memakai rumus
  yang sama seperti `opsScopeList()`/`okpiAchievementPct()`/handler submit
  `#ocForm` & `#okpiForm` (edit by id) di `index.html` — lihat
  `test_ops_checklist_kpi.js`): Checklist — add/edit (UPDATE bukan
  duplicate)/delete/reload; Client isolation; Outlet isolation (outletId
  sama, scope beda); Client-level task (outletId null, tidak dipaksa ke
  outlet); historical (Januari tidak berubah saat Februari dibuat/
  diedit). KPI Operasional — add/edit/delete/reload; Client isolation;
  Outlet isolation; Achievement % normal, Target = 0 → "N/A", Actual = 0
  dgn Target > 0 → 0% (bukan N/A), Actual & Target sama-sama 0 → "N/A";
  historical periode; skenario ekstrem (Target/Actual negatif atau
  undefined) tidak pernah menghasilkan NaN/Infinity.
  Regresi: `test_opex.js` (Tahap 6, 26 assertion), `test_target_budget.js`
  (Tahap 7A, 40 assertion), `test_forecast.js` (Tahap 7B, 55 assertion),
  dan `test_marketing_event.js` (Tahap 8, 52 assertion) dijalankan ulang
  dan tetap 26/26, 40/40, 55/55, & 52/52 lolos tanpa perubahan sama sekali
  pada filenya.

## TAHAP 8 — Marketing + Event + ROI

**Konteks:** Sampai Tahap 7B, belum ada tempat mencatat biaya & hasil
aktivitas Marketing/Event secara spesifik per aktivitas (OPEX Master
Tahap 6 hanya mencatat total biaya per kategori, tanpa nama aktivitas atau
Revenue yang bisa diatribusikan ke aktivitas itu) — jadi ROI per campaign
belum kelihatan. Tahap 8 menambahkan 1 data BARU murni
(`ALL_KEYS.marketingEvent`) + 1 lapisan reporting (ROI, Performance,
Budget vs Actual) di atasnya — **tidak mengubah/rewrite Revenue/COGS/HPP/
Food Cost/Inventory/OPEX/Target/Budget/Forecast manapun** (diverifikasi
lewat diff: 332 baris ditambah, hanya 1 baris lama berubah sekadar
menambah koma setelah `budgetOpex` di `ALL_KEYS`, sama seperti pola
Tahap 2–7B).

- **Marketing/Event Master** — CRUD baru "Marketing/Event Master" di
  halaman Akuntansi (di bawah Forecast): Date, Client (= scope aktif
  dropdown "Scope data" di atas — pola sama persis dengan
  Ingredient/OPEX/Target/Budget), Brand opsional, Outlet opsional, Type
  (Marketing/Event), Name, Cost, Revenue Attributed (opsional), Notes,
  Reference. Brand/Outlet dikosongkan berarti aktivitas itu melekat ke
  Client/Brand secara umum — **tidak pernah dipaksa/dialokasikan otomatis**
  ke outlet manapun, pola sama persis dengan OPEX "Belum Teralokasi ke
  Outlet" Tahap 6.
- **ROI** — `ROI % = (Revenue Attributed − Cost) / Cost × 100`. Kalau
  Cost = 0 atau Revenue Attributed belum diisi → **"N/A"** (bukan
  `NaN`/`Infinity`). Sistem **tidak pernah mengasumsikan** seluruh Revenue
  outlet berasal dari 1 aktivitas Marketing/Event — Revenue Attributed
  murni angka manual per aktivitas.
- **Budget vs Actual** — Marketing Budget dibaca dari **Budget OPEX
  Tahap 7A** (`ALL_KEYS.budgetOpex`, kategori "Marketing") APA ADANYA —
  **tidak ada budget engine baru**. Actual Spend = total Cost seluruh
  aktivitas Marketing/Event pada bulan+tahun+scope yang sama. Variance =
  Actual Spend − Marketing Budget.
- **Performance** — tabel Activity | Cost | Attributed Revenue | ROI |
  Status, Status ∈ {Positive, Break-even, Negative, Incomplete}
  (Incomplete = ROI belum bisa dihitung, sama seperti kondisi "N/A").
- **Isolasi Client/Brand/Outlet** — `scope` (activeAktScope, sama persis
  pola Ingredient/OPEX/Target/Budget) + `brandId`/`outletId` opsional;
  Client/Outlet berbeda (termasuk outletId yang kebetulan sama di Client
  berbeda) tidak pernah tercampur.
- **Edit = UPDATE, bukan duplicate** — pola sama persis OPEX Master
  (dicocokkan lewat id record, bukan dedupe-by-composite-key seperti
  Target/Budget karena tiap aktivitas Marketing/Event berdiri sendiri).
  Bulan Januari tidak berubah saat Februari dibuat/diedit setelahnya.
  Reload (round-trip JSON, pola localStorage) tetap mempertahankan data.
- **Belum dikerjakan** (sesuai cakupan Tahap 8, di luar fokus kali ini):
  Dashboard redesign, Forecast (tetap Tahap 7B, tidak disentuh), ERP, POS,
  CRM, AI, integrasi Google/Meta, Tahap 9.
- Sudah diuji (52 assertion lewat test logika terisolasi memakai rumus
  yang sama seperti `meRoiPct()`/`meStatus()`/`computeMeBudgetVsActual()`/
  handler submit `#meForm` (edit by id) di `index.html` — lihat
  `test_marketing_event.js`): skenario TEST WAJIB brief (Client A/Outlet
  Jakarta, Cost Rp10.000.000, Attributed Revenue Rp30.000.000 → ROI 200%)
  PERSIS sesuai brief; Client A vs Client B isolation; Outlet isolation
  (outletId sama, scope beda); Client-level activity (outletId null,
  tidak dipaksa ke outlet); Edit (UPDATE bukan duplicate, ROI ikut
  terupdate); Delete; submit tanpa Edit tidak menimpa aktivitas lain
  (bukan dedupe-by-composite-key); Reload (round-trip JSON); data bulan
  Januari tidak berubah saat Februari dibuat/diedit; Cost = 0 → ROI
  "N/A"; Revenue Attributed kosong → ROI "N/A"; Cost = 0 & Revenue kosong
  sekaligus → "N/A"; ROI negatif → Status Negative; ROI 0% → Status
  Break-even; Budget vs Actual (Marketing Budget hanya kategori
  "Marketing" & scope yang sama, Actual Spend total Cost aktivitas scope
  yang sama, Variance = Actual − Budget); Budget/Actual = 0 → tidak
  NaN/Infinity; berbagai skenario ekstrem ROI (Cost negatif, Revenue
  undefined/NaN) tidak pernah menghasilkan NaN/Infinity.
  Regresi: `test_opex.js` (Tahap 6, 26 assertion), `test_target_budget.js`
  (Tahap 7A, 40 assertion), dan `test_forecast.js` (Tahap 7B, 55
  assertion) dijalankan ulang dan tetap 26/26, 40/40, & 55/55 lolos tanpa
  perubahan sama sekali pada filenya.

## TAHAP 7B — Forecast Revenue + Forecast Operating Profit

**Konteks:** Tahap 7A sudah menambahkan Target/Budget untuk dibandingkan
dengan Actual bulan berjalan, tapi belum ada proyeksi Full Year — jadi
"kalau pola bulan-bulan yang sudah lewat diteruskan, apakah Full Year akan
mencapai Target" belum kelihatan. Tahap 7B menambahkan 1 lapisan
read-only murni baru (`computeForecastYear()`) di atas
`computeOpexProfitability()` (Tahap 6, Actual) dan `targetRevenue`/
`targetOperatingProfit` (Tahap 7A, Target) — **tidak ada data baru yang
disimpan**, forecast dihitung ulang setiap kali dipanggil, dan **tidak
mengubah/rewrite engine atau fitur manapun** (diverifikasi lewat diff:
0 baris lama terhapus/berubah, murni baris tambahan).

- **Metode forecast** — rata-rata aritmatika sederhana (`fcAverage()`),
  BUKAN AI/forecasting kompleks (sesuai batasan brief): bulan yang sudah
  punya Actual (ada transaksi Penjualan Menu per Outlet di scope+bulan+
  tahun tsb) tetap pakai ACTUAL; bulan yang belum pakai FORECAST = rata-rata
  Actual bulanan yang sudah tersedia di tahun yang sama.
- **Ditampilkan** — Target Full Year, Actual YTD, Forecast Full Year, Gap
  to Target (Forecast − Target), untuk Revenue & Operating Profit, plus
  tabel 12 bulan berlabel ACTUAL/FORECAST.
- **Isolasi Client/Outlet** — mengikuti `activeAktScope`/
  `outletsForAktScope()` yang sudah ada (pola sama persis dengan Target vs
  Actual Tahap 7A); Client/Outlet berbeda tidak pernah tercampur.
- **Actual tidak pernah diubah** — bulan yang sudah Actual dibaca apa
  adanya dari `computeOpexProfitability()`, tidak pernah ditimpa forecast.
- **Aman dari NaN/Infinity** — rata-rata dari 0 bulan Actual = 0 (bukan
  NaN dari 0/0).
- **Belum dikerjakan** (sesuai cakupan Tahap 7B, di luar fokus kali ini):
  Marketing, Event, ERP, POS, redesign UI, engine/forecasting kompleks.
- Sudah diuji (55 assertion lewat test logika terisolasi memakai rumus
  yang sama seperti `fcAverage()`/`computeForecastYear()` di
  `index.html` — lihat `test_forecast.js`): skenario TEST WAJIB brief
  (Jan 80jt, Feb 90jt, Mar 100jt → rata-rata 90jt, Jan/Feb/Mar tetap
  ACTUAL, Apr–Des pakai FORECAST 90jt) PERSIS sesuai brief; actual tidak
  berubah; Client A/B isolation; Outlet isolation; reload (round-trip
  JSON) tetap aman; belum ada Actual sama sekali → tidak NaN/Infinity;
  12/12 bulan Actual → Forecast Full Year = Actual Full Year.
  Regresi: `test_opex.js` (Tahap 6, 26 assertion) dan
  `test_target_budget.js` (Tahap 7A, 40 assertion) dijalankan ulang dan
  tetap 26/26 & 40/40 lolos tanpa perubahan sama sekali pada filenya.

## TAHAP 7A — Target Revenue + Target Operating Profit + Budget OPEX

**Konteks:** Tahap 6 sudah menghitung Actual Revenue, Actual COGS, dan
Actual OPEX per Outlet per bulan (`computeOpexProfitability()`), tapi belum
ada angka rencana (target/budget) untuk dibandingkan — jadi "apakah bulan
ini di atas atau di bawah rencana" belum kelihatan. Tahap 7A menambahkan 3
data BARU murni (`ALL_KEYS.targetRevenue`, `ALL_KEYS.targetOperatingProfit`,
`ALL_KEYS.budgetOpex`) + 1 lapisan perbandingan di atasnya — TIDAK membuat
engine Revenue/COGS/HPP/Food Cost/Inventory/OPEX/Profitability kedua, dan
TIDAK mengubah/rewrite Client/Brand/Outlet manapun (diverifikasi lewat diff:
hanya 1 baris lama yang berubah, sekadar menambah koma setelah `opex` di
`ALL_KEYS` karena 3 key baru ditambah di posisi paling akhir, sama seperti
pola Tahap 2-6 — sisanya murni baris tambahan).

- **Target Revenue** — target bulanan per scope Client/Brand (dropdown
  "Scope data" halaman Akuntansi) + Outlet opsional (kosong = level
  Client/Brand). Simpan lagi dengan Outlet+Bulan+Tahun yang sama akan
  MENGUPDATE target yang sudah ada, bukan membuat baris baru (dedupe key:
  scope+outletId+bulan+tahun).
- **Target Operating Profit** — pola & isolasi yang sama persis dengan
  Target Revenue.
- **Budget OPEX** — budget bulanan per Category (dedupe key ditambah
  Category: scope+outletId+category+bulan+tahun) — Actual OPEX untuk
  dibandingkan TETAP memakai OPEX Master Tahap 6 (`ALL_KEYS.opex`), tidak
  ada OPEX engine baru.
- **Target vs Actual** — section baru di bawah Budget OPEX: Target Revenue,
  Actual Revenue (dari `computeOpexProfitability()` yang sudah ada),
  Achievement %; Target Operating Profit, Actual Operating Profit,
  Achievement %; Budget OPEX, Actual OPEX, Variance (Actual − Budget). Kalau
  Target/Budget = 0, Achievement % ditampilkan **"N/A"** (bukan
  `NaN`/`Infinity`).
- **Isolasi Client/Outlet** — `scope` + `outletId` sama persis pola
  Ingredient/Purchase/Produk/OPEX Tahap 1-6; outlet dengan nama sama di
  Client berbeda tidak pernah tercampur.
- **Historical aman** — data Januari tidak berubah saat Februari
  dibuat/diedit (tiap bulan record terpisah, key mencakup bulan+tahun).
- **Belum dikerjakan** (sesuai cakupan Tahap 7A, di luar fokus kali ini):
  Forecast, Marketing, Event, ERP, POS, redesign UI.
- Sudah diuji (40 assertion lewat test logika terisolasi memakai rumus yang
  sama seperti `computeTargetVsActual()`/`t7aUpsert()` di `index.html` —
  lihat `test_target_budget.js`): skenario TEST WAJIB brief (Target Revenue
  Rp100jt, Actual Rp85jt → Achievement 85%; Target Operating Profit Rp25jt,
  Actual Rp18jt; Budget OPEX Rp40jt, Actual Rp42jt → Variance +Rp2jt) PERSIS
  sesuai brief; Client A/B isolation; outlet isolation (outletId sama, scope
  beda, tidak tercampur); kombinasi scope+outlet+bulan+tahun (+category utk
  Budget OPEX) yang sama → UPDATE bukan duplicate; kategori Budget OPEX
  berbeda pada scope+outlet+bulan+tahun yang sama → tetap 2 entry terpisah;
  edit & delete record; reload (round-trip JSON, pola localStorage) data
  tetap utuh; Target/Budget = 0 → Achievement % "N/A" bukan NaN/Infinity;
  Actual = 0 juga tidak menghasilkan NaN/Infinity di field manapun; data
  bulan Januari tidak berubah saat bulan Februari dibuat/diedit setelahnya.
  Regresi: `test_opex.js` (Tahap 6, 26 assertion) dijalankan ulang dan tetap
  26/26 lolos tanpa perubahan sama sekali pada filenya — `outletRevenue()`,
  `outletCogs()`, `computeOpexProfitability()`, dan seluruh
  render/CRUD Ingredient/Supplier/Purchase/Produk/Sales/Inventory/Stock
  Opname/Cash Flow/OPEX diverifikasi **0 baris terhapus/diubah** dibanding
  sebelum Tahap 7A (diff murni-tambahan, 467 baris ditambah, 1 baris lama
  berubah sekadar menambah koma).

## TAHAP 12 — OPEX + Outlet Profitability

**Konteks:** Sampai Tahap 5, sistem sudah tahu Revenue &amp; COGS per Outlet
(dari `outletRevenue()`/`outletCogs()`, dipakai tabel "Penjualan Menu per
Outlet" dan Dashboard), tapi belum ada yang mengurangkan biaya operasional
(sewa, gaji, listrik, marketing, dst) untuk sampai ke **profit outlet yang
sesungguhnya**. Tahap 6 ini menambahkan **OPEX** sebagai satu-satunya data
baru yang disimpan (`ALL_KEYS.opex`), lalu **Profitability Engine** murni
di atasnya — TIDAK membuat engine Revenue/COGS/Food Cost/Inventory/HPP
kedua: Revenue &amp; COGS di perhitungan Profitability SELALU dihitung
lewat `outletRevenue()`/`outletCogs()` yang sudah ada, bukan logika baru
(diverifikasi 0 baris kode Tahap 1-5 yang terhapus/berubah dibanding
sebelum Tahap 6 — diff murni-tambahan, hanya 1 baris lama yang berubah
sekadar menambah koma setelah `stockOpname` di `ALL_KEYS` karena `opex`
ditambah di posisi paling akhir objek itu, sesuai pola Tahap 2-5).

- **OPEX Master** — section baru "OPEX (Biaya Operasional)" di halaman
  Akuntansi (di bawah Food Cost Analysis): Tanggal, Kategori (input bebas +
  10 kategori default via datalist — Rent, Salary/Labor, Utilities,
  Marketing, Maintenance, Internet/Telephone, Cleaning, Transportation,
  Administration, Other — gampang ditambah cukup ketik kategori baru, tidak
  perlu edit kode), Tipe Biaya (Fixed/Variable), Outlet (opsional), Jumlah,
  Recurring/Non-recurring, Deskripsi, Reference. Ikut isolasi **Scope
  (Klien) yang sama** dengan Ingredient/Purchase/Produk/Cash Flow di halaman
  ini (`activeAktScope` — "Internal" atau Klien tertentu dari dropdown
  "Scope data").
- **Scope biaya (Outlet-specific vs Client/Brand-level)** — Outlet di form
  OPEX bersifat **opsional**: dikosongkan berarti biaya itu melekat ke
  Client/Brand secara umum (mis. Marketing pusat), bukan ke satu outlet
  tertentu. Biaya Client/Brand-level ini **TIDAK PERNAH dialokasikan
  otomatis** ke outlet manapun — di tabel Profitability ia tampil sebagai 1
  baris terpisah "Belum Teralokasi ke Outlet", tetap ikut dijumlah ke Total
  OPEX "🏢 Semua Outlet" tapi tidak "menempel" ke outlet tertentu.
- **Periode** — setiap OPEX tersimpan dengan `bulan`+`tahun` (diturunkan
  otomatis dari Tanggal saat disimpan, pola yang sama dengan
  `outletJual`/Purchase) sehingga bisa dianalisis per Bulan/Tahun/Client/
  Outlet secara terpisah. Data OPEX bulan lampau **tidak pernah berubah**
  hanya karena OPEX bulan lain diedit — diverifikasi lewat test isolasi
  periode.
- **Profitability Engine** — section baru "Outlet Profitability" di bawah
  OPEX Master: pilih Bulan+Tahun → tabel per-outlet **Revenue → COGS →
  Gross Profit → OPEX → Operating Profit → Margin**, plus baris total
  "🏢 Semua Outlet" dan baris "Belum Teralokasi ke Outlet" (kalau ada).
  Kartu ringkasan menampilkan Revenue, COGS, Gross Profit, OPEX, Operating
  Profit, **Gross Margin %**, **Operating Margin %**, dan **COGS %**/
  **OPEX %** dari Revenue. Kalau Revenue = 0, seluruh persentase
  ditampilkan **"N/A"** (bukan `NaN`/`Infinity`) — diverifikasi lewat test
  logika. **Top 5 Kategori OPEX** ditampilkan otomatis di bawah tabel.
- **Traceability** — tombol "Rincian" di tiap baris (termasuk "🏢 Semua
  Outlet" dan "Belum Teralokasi") membuka modal riwayat yang **sudah ada**
  (bukan modal baru) berisi breakdown lengkap: Revenue − COGS = Gross
  Profit, lalu OPEX per kategori, Total OPEX, dan = Operating Profit — jadi
  setiap angka bisa ditelusuri sumbernya, tidak ada angka tanpa sumber.
- **Fixed vs Variable** — setiap entry OPEX punya field Tipe Biaya
  (Fixed/Variable) sederhana, dipilih manual per entry (bukan model
  allocation otomatis) — ditampilkan di tabel OPEX Master untuk membantu
  analisis struktur biaya, tanpa redesign apa pun.
- **Recurring flag** — field Recurring/Non-recurring tersimpan sebagai
  penanda saja (sesuai arahan Tahap 6, TIDAK ada auto-generate transaksi
  bulan berikutnya).
- **Validasi data** — Tanggal, Kategori, dan Jumlah (&gt; 0) wajib diisi;
  Jumlah negatif (untuk kredit/koreksi pengurang OPEX) hanya diterima kalau
  Deskripsi/alasan diisi (checkbox "Ini kredit/penyesuaian pengurang OPEX").
  Scope (Client) selalu otomatis terisi dari halaman (tidak pernah kosong).
- **Dashboard** — kartu **OPEX (tahun ini)** dan **Operating Profit (tahun
  ini)** ditambahkan ke section "Profitabilitas Outlet" yang sudah ada
  (tidak ada dashboard baru), mengikuti filter "Klien Aktif"/"Outlet Aktif"
  di sidebar yang sama seperti kartu Revenue/COGS/Profit Kotor yang sudah
  ada. Kartu ini menjumlahkan HANYA OPEX yang bertag Outlet (Client/Brand-
  level sengaja tidak ikut dijumlah di sini, sesuai prinsip "tidak ada
  allocation otomatis") — rincian lengkap termasuk Client/Brand-level ada di
  Akuntansi &gt; OPEX &amp; Profitability.
- **Multi Client/Outlet Isolation** — `opex.scope` + `opex.outletId` sama
  persis pola Ingredient/Purchase/Produk Tahap 1-3; outlet dengan nama sama
  di Client berbeda (mis. sama-sama "Jakarta") tidak pernah tercampur —
  diverifikasi lewat test isolasi.
- **Belum dikerjakan** (sesuai cakupan Tahap 6, di luar fokus kali ini):
  Budget, Forecast, Target Profit, Marketing ROI, Event ROI, Payroll
  system, Full Accounting ERP, integrasi POS, redesign dashboard besar.
- Sudah diuji (26 assertion lewat test logika terisolasi memakai rumus yang
  sama seperti `computeOpexProfitability()`/`renderOpexProfitability()` di
  `index.html`, karena lingkungan build ini tidak punya browser headless —
  lihat `test_opex.js`): skenario TEST WAJIB brief (Client A/Outlet Jakarta,
  Revenue Rp100jt, COGS Rp35jt, OPEX Rent+Salary+Utilities+Marketing =
  Rp40jt) → Gross Profit Rp65jt (65%), Operating Profit Rp25jt (25%) PERSIS
  sesuai brief; Client A/Outlet Bandung &amp; Client B/Outlet "Jakarta"
  (nama sama, klien beda) terisolasi total dan tidak pernah tercampur ke
  Client A; OPEX bulan Januari tidak berubah walau OPEX bulan Februari
  diedit setelahnya (historical data aman); Revenue = 0 → Gross/Operating
  Margin % tampil "N/A" (bukan NaN/Infinity), OPEX &amp; Operating Profit
  tetap terhitung benar; OPEX = 0 → Operating Profit = Gross Profit;
  Client/Brand-level OPEX (outlet dikosongkan) tidak pernah ikut ke baris
  outlet manapun tapi tetap masuk Total OPEX "Semua Outlet"; entry kredit/
  penyesuaian (Jumlah negatif) mengurangi Total OPEX dengan benar; edit
  ulang OPEX dengan id yang sama menghasilkan 1 entry (bukan duplicate);
  delete OPEX menghapus entry dengan benar. Regresi: `outletRevenue()`,
  `outletCogs()`, `hpp()`, `hppForPeriod()`, `ingredientCostPerUnit()`,
  `ingredientCostPerUnitAt()`, seluruh fungsi Tahap 4/5 (`stockBalanceRows`,
  `computeFoodCostAnalysis`, WAC ledger), dan seluruh render/CRUD Ingredient/
  Supplier/Purchase/Produk/Sales/Inventory/Stock Opname/Cash Flow
  diverifikasi **0 baris terhapus/diubah** dibanding sebelum Tahap 6 (diff
  murni-tambahan, lihat catatan di atas).

## TAHAP 11 — Actual Food Cost + Weighted Average + Variance

**Konteks:** Sampai Tahap 4, sistem tahu berapa **stok** bahan yang ada
(quantity, murni non-Rupiah) dan berapa **HPP teoritis** produk (dari
Resep + harga bahan historis). Belum ada yang membandingkan **bahan yang
SEHARUSNYA terpakai** (Theoretical, dari resep × penjualan) dengan **bahan
yang BENAR-BENAR terpakai** (Actual, dari stock fisik) dalam Rupiah — jadi
kebocoran food cost (waste, porsi kelebihan, susut, dsb.) tidak kelihatan
angkanya. Tahap 5 ini murni lapisan **REPORTING/ANALYSIS** di atas data yang
sudah ada — TIDAK ada tabel data baru yang disimpan, dan TIDAK mengubah
`hpp()`, `hppForPeriod()`, `ingredientCostPerUnit()`/`ingredientCostPerUnitAt()`,
`priceHistory`, `costSnapshots`, `recipeVersions`, Stock Ledger, atau alur
Sales → COGS → Gross Profit sama sekali (diverifikasi 0 baris kode lama yang
terhapus/berubah dibanding sebelum Tahap 5).

- **Weighted Average Cost (WAC) berjalan** — dihitung on-the-fly dari Stock
  Ledger (Tahap 4) + Actual Purchase Cost (Tahap 3): tiap `PURCHASE_IN`
  menambah average cost baru (`New Avg = (Old Value + New Purchase Value) /
  (Old Qty + New Qty)`), tiap movement OUT (`USAGE_OUT`/`WASTE_OUT`/
  `ADJUSTMENT_OUT`) mengurangi qty & value secara proporsional pada average
  cost yang berlaku saat itu (avg cost per unit TIDAK berubah karena OUT —
  sifat matematis weighted average). `ADJUSTMENT_IN` dari Stock Opname
  dinilai pakai average cost yang berlaku saat itu (Opname tidak membawa
  harga baru). Historical purchase transaction TIDAK PERNAH diubah — dibaca
  read-only lewat `sourceKey` (`receiving:<purchaseId>:<itemId>`) yang sudah
  ada dari Tahap 4.
- **Stock Value** — Stock Balance kini bisa dilihat dalam Quantity **dan**
  Rupiah (Average Cost × Qty) lewat engine WAC di atas, tanpa mengubah
  tampilan Stock Balance/Stock Card Tahap 4 yang sudah ada (murni fungsi baru
  di atasnya).
- **Theoretical Consumption** — Sales × Recipe yang **berlaku pada periode
  itu** (`recipeVersionAt()`, fungsi Tahap 2.5 yang sudah ada — tidak dibuat
  ulang), dihitung ulang secara read-only (tidak tergantung apakah tombol
  "Generate Usage dari Penjualan" Tahap 4 sudah/belum diklik untuk periode
  itu).
- **Actual Consumption** — `Beginning Inventory + Purchasing − Ending
  Inventory`, dihitung dari state Stock Ledger sebelum & sampai akhir
  periode (mencakup otomatis seluruh Usage/Waste/Adjustment tercatat dalam
  periode itu, termasuk hasil Stock Opname).
- **Variance (Qty & %)** dan **Actual Food Cost vs Theoretical Food Cost**
  (Rupiah, murni porsi bahan baku — bukan HPP penuh yang termasuk
  tenaga+overhead) ditampilkan per bahan di tabel **Ingredient Variance**,
  plus ringkasan **Food Cost Analysis** (Revenue, Theoretical/Actual Food
  Cost %, Variance Rp/%, Status **Normal/Warning/Critical** dengan threshold
  default sederhana ±5%/±15%, gampang diubah di `FC_STATUS_THRESHOLDS`).
- **Perhitungan per Bulan + Tahun + Client (Scope) + Outlet** — section baru
  "Food Cost Analysis" di halaman Akuntansi (di bawah Stock Opname),
  memakai selector yang sama (Outlet/Bulan/Tahun) seperti "Generate Usage
  dari Penjualan". Client/Outlet dengan nama sama tetap terisolasi total,
  konsisten dengan pola Tahap 1-4.
- **"Data belum lengkap"** ditampilkan (bukan angka 0 atau asumsi) kapan pun
  Actual Cost suatu bahan tidak bisa ditelusuri (mis. bahan itu belum pernah
  di-Receiving dengan Actual Cost) — qty variance tetap tampil normal, hanya
  kolom Rupiah bahan tsb yang ditandai, dan total Actual Food Cost
  keseluruhan diberi catatan bahwa sebagian bahan belum lengkap (tidak diam-
  diam dijumlahkan sebagai 0).
- **Traceability** — tombol "Stock Card" (modal yang sudah ada dari Tahap 4)
  tersedia di tiap baris Ingredient Variance untuk menelusuri balik ke
  Receiving/Stock Ledger/Stock Opname yang membentuk angka itu.
- **Tidak ada data/tabel baru disimpan** — semua dihitung on-the-fly dari
  Ingredient/Purchase/Stock Movement/Produk/Sales yang sudah ada, persis
  pola `stockBalanceRows()` Tahap 4.
- **Belum dikerjakan** (sesuai cakupan Tahap 5, di luar fokus kali ini):
  OPEX, Net Profit, Marketing, ERP, dashboard besar, Payroll, redesign
  Purchasing/Inventory.
- ⚠️ **Catatan angka dari brief**: skenario test wajib di brief (Beginning
  20kg @ Rp40.000 + Receiving 10kg @ Rp50.000) secara matematis menghasilkan
  Average Cost **Rp43.333,33/kg** (bukan Rp45.000/kg seperti tertulis di
  brief) — Rp45.000/kg hanya benar untuk Beginning **10kg** (contoh ilustrasi
  terpisah di bagian rumus WAC brief, bukan skenario test 20kg-nya). Sistem
  ini SENGAJA mengikuti rumus Weighted Average yang benar (dan sama seperti
  yang didefinisikan sendiri di brief), bukan dipaksa menghasilkan angka
  Rp45.000 yang salah secara matematis. Semua angka **Quantity** (Actual
  Consumption 23kg, Variance +5kg, Variance % 27,78%) sudah PERSIS sesuai
  brief — hanya angka Rupiah dari skenario 20kg yang berbeda dari yang
  tertulis di brief karena alasan aritmatika di atas, bukan bug.
- Sudah diuji (lewat test logika terisolasi memakai fungsi murni yang sama
  seperti di `index.html`, karena lingkungan build ini tidak punya browser
  headless): skenario test wajib brief (Qty) — Beginning 20kg → Receiving
  10kg → Ending 7kg → Actual Consumption 23kg, Theoretical 18kg, Variance
  +5kg (27,78%) — PERSIS sesuai brief; Average Cost WAC dihitung benar sesuai
  rumus (lihat catatan di atas); bahan tanpa Actual Cost yang bisa ditelusuri
  → ditandai "Data belum lengkap" (bukan 0); Stock Opname (`ADJUSTMENT_OUT`)
  mengurangi qty & value secara proporsional TANPA mengubah average cost per
  unit; bahan tanpa pergerakan sama sekali → tidak dipaksa muncul dengan
  angka palsu. Regresi: `hpp()`, `hppForPeriod()`, `ingredientCostPerUnit()`,
  `ingredientCostPerUnitAt()`, `ingredientPriceAt()`,
  `buildIngredientPriceHistory()`, `mergeActualPriceIntoHistory()`,
  `recipeVersionAt()`, `currentEffectiveRecipe()`, `outletRevenue()`,
  `outletCogs()`, `stockMovementSignedQty()`, `stockBalanceRows()`,
  `generateUsageFromSales()`, seluruh render/CRUD Ingredient/Supplier/
  Purchase/Produk/Sales/Inventory/Stock Opname, dan seluruh baris kode Tahap
  1-4 diverifikasi **0 baris terhapus/diubah** dibanding sebelum Tahap 5 (diff
  murni-tambahan) — hanya `bahanTotalForPeriod()` (fungsi baru, dipanggil
  terpisah, tidak dipanggil oleh kode lama manapun) dan blok TAHAP 5 baru
  yang ditambahkan.

## TAHAP 10 — Inventory Core: Stock Ledger, Stock Card & Stock Opname

**Konteks:** Sampai Tahap 3, Receiving mencatat quantity yang diterima dan
harga aktualnya (`ingredient.priceHistory`), tapi tidak ada satu pun tempat
yang menjawab "berapa stok bahan yang ADA sekarang". Tahap 4 ini menambahkan
lapisan **Inventory Core** murni QUANTITY (bukan Rupiah) di atas fondasi yang
sudah ada — TANPA membuat engine costing/HPP kedua dan TANPA mengubah
`hpp()`, `hppForPeriod()`, `ingredientCostPerUnit()`, `priceHistory`,
`costSnapshots`, `recipeVersions`, atau alur Sales → COGS → Gross Profit
sama sekali (diverifikasi identik byte-per-byte dengan sebelum Tahap 4).

- **Stock Ledger (append-only)** — data baru `trace-stock-movement`: setiap
  pergerakan stok (tanggal, scope/Client, outlet opsional, bahan, jenis
  movement, qty, unit, reference, catatan) dicatat sebagai 1 entry baru,
  TIDAK PERNAH ditimpa/dihapus. 5 jenis movement: `PURCHASE_IN`,
  `USAGE_OUT`, `WASTE_OUT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`. Unit ledger
  selalu **Unit Pemakaian** (`unitPakai`) Ingredient Master — kalau qty
  diterima dalam Unit Pembelian (`unitBeli`, mis. kg), dikonversi otomatis
  memakai `ingredientKonversi()` yang **sudah ada** dari Tahap 1 (tidak ada
  conversion system kedua / angka hard-code).
- **Receiving = satu-satunya sumber Stock IN** — begitu "Terima Barang"
  dikonfirmasi (fitur Tahap 3, tidak diubah UI/formnya), sistem otomatis
  menambah 1 movement `PURCHASE_IN` per item yang qty-nya > 0, di SAAT YANG
  SAMA dengan penambahan entry `priceHistory` yang sudah ada. Idempoten lewat
  `sourceKey` (`receiving:<purchaseId>:<itemId>`) — kalau movement dgn key
  itu sudah ada, tidak dibuat movement IN kedua walau halaman dirender ulang
  atau tombol Konfirmasi tertekan berulang. Tidak ada input stok masuk manual
  kedua di mana pun.
- **Generate Usage dari Penjualan (Recipe-based)** — tombol baru di halaman
  Akuntansi: menghitung **Theoretical Usage** = Qty Terjual (data "Penjualan
  Menu per Outlet" yang sudah ada) × Qty Bahan dalam Resep yang **berlaku
  pada periode itu** (`recipeVersionAt()`, fungsi Tahap 2.5 yang sudah ada —
  tidak dibuat ulang), lalu mencatatnya sebagai movement `USAGE_OUT` baru.
  Idempoten lewat `sourceKey` (`sales:<outletJualRecordId>:<ingredientId>`) —
  aman digenerate ulang berkali-kali untuk periode yang sama, tidak pernah
  jadi ganda. **Sales/COGS/HPP historis yang sudah tersimpan sama sekali
  tidak disentuh** — ini murni menghasilkan data quantity baru dari data yang
  sudah ada, satu arah.
- **Catat Pemakaian Manual / Waste** — form baru untuk koreksi pemakaian
  manual (`USAGE_OUT`) atau waste/bahan terbuang (`WASTE_OUT`), keduanya
  tercatat terpisah di ledger lewat jenis movement yang berbeda, tidak pernah
  mengubah harga/HPP bahan.
- **Stock Balance & Stock Card** — tabel baru di halaman Akuntansi
  menampilkan saldo stok (Stock In − Usage − Waste ± Adjustment) per
  **Scope (Klien) → Outlet → Bahan**, dihitung on-the-fly dari seluruh
  ledger (bukan field tersendiri yang bisa tidak sinkron). Tombol
  "Stock Card" per baris menampilkan seluruh riwayat movement bahan itu
  (tanggal, jenis, IN, OUT, running balance, reference) supaya "kenapa
  balance jadi angka X" bisa ditelusuri — pakai modal riwayat yang sudah ada
  (tidak ada modal/redesign baru).
- **Stock Opname** — form baru membandingkan Stock Sistem (otomatis dari
  ledger) vs Stock Aktual (hasil hitung fisik); begitu dikonfirmasi, selisih
  (variance) dicatat sebagai 1 movement `ADJUSTMENT_IN`/`ADJUSTMENT_OUT` baru
  (kalau variance = 0, tidak ada movement yang dibuat). Riwayat opname
  tersimpan penuh (`trace-stock-opname`) dan ditampilkan sebagai tabel
  terpisah — riwayat lama tidak pernah diubah oleh opname berikutnya.
- **Isolasi Client/Outlet WAJIB** — stock key = `scope + outletId +
  ingredientId`, persis pola Ingredient/Supplier/Purchase Tahap 1-3. Outlet
  dengan nama sama di Client berbeda tetap terpisah total (diuji: Client
  A/Outlet Jakarta 6,5kg vs Client B/Outlet "Jakarta" 20kg — tidak pernah
  terjumlah 26,5kg). Pembelian Central (Receiving dgn Outlet dikosongkan)
  tersimpan dalam bucket `outletId: null` yang terpisah dari outlet manapun,
  TIDAK dipaksa masuk ke outlet tertentu — sesuai cakupan Tahap 4 (transfer
  antar outlet belum dikerjakan).
- **Belum dikerjakan** (sesuai cakupan Tahap 4, di luar fokus kali ini):
  Purchasing/Supplier/Recipe/HPP baru, OPEX, Net Profit, Marketing, ERP,
  dashboard/reporting besar, transfer antar outlet, forecasting, automatic
  reorder.
- Sudah diuji (skenario wajib dari brief, lewat test logika terisolasi
  memakai fungsi murni yang sama seperti di `index.html` — lingkungan build
  ini tidak punya browser headless): Client A/Outlet Jakarta/Ayam — Receiving
  9,5kg → Usage 2kg → Waste 0,5kg → Balance sistem 7kg → Stock Opname Actual
  6,5kg (variance −0,5kg, dikonfirmasi) → Balance akhir 6,5kg, ledger lengkap
  `PURCHASE_IN +9,5 → USAGE_OUT −2 → WASTE_OUT −0,5 → ADJUSTMENT_OUT −0,5 =
  6,5kg` persis sesuai urutan yang diminta; Client B dengan Ingredient Ayam
  yang sama TIDAK tercampur dengan Client A (6,5kg vs 20kg, bukan 26,5kg);
  Central Purchasing (outlet dikosongkan) terisolasi dari stok Outlet
  Jakarta; Recipe-based usage dari Sales (Latte terjual 100 × resep 18g kopi
  = 1.800g) dihitung benar dan REGENERATE untuk periode yang sama TIDAK
  membuat movement ganda (idempoten); mencoba konfirmasi Receiving 2x untuk
  Purchase yang sama TIDAK membuat 2 movement `PURCHASE_IN`. Regresi:
  `hpp()`, `hppForPeriod()`, `ingredientCostPerUnit()`,
  `ingredientCostPerUnitAt()`, `ingredientPriceAt()`,
  `buildIngredientPriceHistory()`, `mergeActualPriceIntoHistory()`,
  `recipeVersionAt()`, `currentEffectiveRecipe()`, `outletRevenue()`,
  `outletCogs()`, dan seluruh render/CRUD Ingredient/Supplier/Purchase/
  Produk/Sales diverifikasi **identik byte-per-byte** dengan sebelum Tahap 4
  — tidak ada satu pun yang tersentuh, kecuali handler konfirmasi Receiving
  yang SEKARANG JUGA menulis movement `PURCHASE_IN` (selain perilaku
  lamanya yang tidak berubah: tetap menulis `priceHistory` seperti biasa).

## TAHAP 9 — Purchasing + Actual Purchase Cost

**Konteks:** Sebelum update ini, harga bahan (`ingredient.hargaBeli` &
`priceHistory`) hanya bisa diisi manual lewat form Ingredient Master — tidak
ada jejak transaksi pembelian/penerimaan barang yang nyata (invoice, supplier,
quantity yang benar-benar diterima vs yang dipesan). Tahap 3 ini menambahkan
lapisan **Supplier → Purchase → Receiving → Actual Purchase Price** di atas
Ingredient Master yang sudah ada, TANPA membuat engine costing/HPP kedua —
`hpp()`, `hppForPeriod()`, `ingredientCostPerUnit()`, `costSnapshots`, dan
seluruh alur Sales → COGS → Gross Profit **sama sekali tidak disentuh**.

- **Supplier Master** — section baru "Supplier" di halaman Akuntansi (di
  bawah Ingredient Master): Nama, Kontak, Outlet (opsional), status
  Aktif/Nonaktif. Ikut isolasi Scope (Klien) yang sama seperti Ingredient
  Master — supplier Klien A tidak pernah muncul saat Scope diganti ke Klien B.
- **Purchasing (header + items)** — section baru "Purchasing & Receiving":
  1 transaksi pembelian (tanggal, supplier, outlet opsional, no.
  invoice/reference, pajak%, catatan) bisa punya beberapa item bahan
  sekaligus (bahan dari Ingredient Master, qty, harga/unit — basis Unit
  Pembelian bahan tsb), dengan Subtotal/Pajak/Total dihitung otomatis.
- **Receiving terpisah dari Purchase** — tombol **"Terima Barang"** di tabel
  Purchase membuka form khusus untuk mencatat **quantity yang BENAR-BENAR
  diterima** per item (bisa beda dari quantity yang dipesan/di-invoice,
  mis. pesan 10kg ayam, yang datang cuma 9,5kg). Purchase yang belum
  "Terima Barang" berstatus **Ordered**; setelah diproses jadi **Received**
  (atau **Received (partial)** kalau ada item yang qty diterimanya beda dari
  yang dipesan).
- **Actual Purchase Price** — begitu Receiving dikonfirmasi, sistem menghitung
  **Actual Unit Cost = nilai invoice item ÷ quantity yang benar-benar
  diterima** (bukan quantity di invoice) — supaya kalau barang yang datang
  lebih sedikit dari yang dibayar, cost per unit aktualnya otomatis naik,
  bukan tersembunyi. Angka ini lalu **ditambahkan** (bukan menimpa) ke
  `ingredient.priceHistory` bahan terkait, lengkap dengan referensi
  purchase & supplier-nya untuk ditelusuri — riwayat harga lama (baik dari
  input manual Tahap 2 maupun dari purchase lain) **tidak pernah dihapus**.
- **Tidak mengubah current cost / HPP historis** — `ingredient.hargaBeli`
  (dipakai `ingredientCostPerUnit()` utk current cost) **sengaja tidak
  disentuh** oleh Purchasing/Receiving, dan tidak ada `costSnapshots` produk
  yang dihitung ulang otomatis. HPP historis yang sudah tersimpan (Tahap 2/
  2.5) tetap seperti semula. Kalau mau current cost ikut diperbarui dari
  hasil pembelian ini, lakukan manual lewat form Ingredient Master yang
  sudah ada (harga aktual dari "Detail" Purchase bisa dipakai sebagai
  referensi) — bukan lewat modul Purchasing ini.
- **Multi-Client/Outlet tetap terisolasi** — Supplier & Purchase discope
  per Client (`scope`, sama seperti Ingredient Master) + Outlet opsional;
  data Client A dan B tidak pernah tercampur di modul baru ini.
- **Belum dikerjakan** (sesuai cakupan Tahap 3, di luar fokus kali ini):
  Inventory penuh, Stock Movement, Stock Opname, Waste Inventory, OPEX, Net
  Profit, Marketing, Event, ERP penuh, dashboard/reporting besar baru.
- Sudah diuji (skenario wajib, lewat test logika terisolasi karena
  lingkungan build ini tidak punya browser headless): Client A/Outlet
  Jakarta/Supplier A/Ingredient Ayam — Purchase 10kg @ Rp40.000/kg (invoice
  Rp400.000) → Receiving 9,5kg → Actual Unit Cost terhitung benar
  (Rp400.000 ÷ 9,5 = Rp42.105,26/kg) → entry baru masuk ke
  `priceHistory` Ayam dengan referensi purchase & supplier yang benar →
  `ingredient.hargaBeli` (current cost) TIDAK berubah; Purchase kedua
  (tanggal & harga beda, qty diterima penuh) tetap tersimpan terpisah, kedua
  entry priceHistory sama-sama utuh dan terurut per tanggal; harga yang
  berlaku pada suatu tanggal historis tetap mengambil entry yang benar
  sesuai periodenya; qty diterima 0 tidak menghasilkan pembagian dengan nol
  atau mencemari priceHistory; data Supplier & Purchase Client A dan Client
  B dipastikan tidak pernah tercampur. Fungsi-fungsi costing/HPP lama
  (`hpp`, `hppForPeriod`, `ingredientCostPerUnit`, `ingredientCostPerUnitAt`,
  `ingredientPriceAt`, `buildIngredientPriceHistory`, dan render/CRUD Produk)
  diverifikasi **identik byte-per-byte** dengan sebelum update ini — tidak
  ada satu pun yang tersentuh oleh perubahan Tahap 3 ini.

## TAHAP 8 — COGS & Food Cost Engine (Tahap 2.5): Recipe Versioning

**Konteks:** Di Tahap 2, resep produk (`p.recipe`) masih 1 nilai tunggal yang
ditimpa tiap kali form Produk disimpan — kalau resep Latte diubah bulan Maret
(mis. gramasi kopi & gula berubah), tidak ada jejak resmi "resep apa yang
berlaku bulan Januari" selain yang kebetulan ikut terekam di dalam
`costSnapshots`. Tahap 2.5 ini menambahkan lapisan **Recipe Version** yang
eksplisit di atas mekanisme Tahap 2 yang sudah ada, TANPA mengubah `hpp()`,
`bahanList`, `hppForPeriod()`, atau alur Sales → COGS — semuanya tetap sama.

- **`p.recipeVersions` (array baru)** — tiap kali form Produk disimpan dan
  resep (`recipe` dari "Susun dari Resep (Ingredient Master)") berbeda dari
  versi resep terakhir yang tersimpan, sistem otomatis membuat **versi resep
  baru**: `{id, effectiveFrom, effectiveTo, scope, outletId, recipe:
  [{ingredientId, qty, unit}], createdAt}`. Versi lama **tidak pernah
  ditimpa/dihapus**, hanya ditambah — persis pola `priceHistory` &
  `costSnapshots` di Tahap 2. Field baru **"Tanggal Berlaku Resep ini"** di
  form Produk (default: hari ini) menentukan `effectiveFrom` versi baru itu —
  kalau resep TIDAK diubah saat disimpan ulang, tidak ada versi baru yang
  dibuat (supaya tidak numpuk versi duplikat percuma).
- **Historical HPP = Recipe Version × Ingredient Price History** — begitu
  versi resep baru dibuat, sistem langsung menghitung 1 cost snapshot khusus
  untuk versi itu, dengan biaya bahan baku dihitung dari **harga ingredient
  yang berlaku PADA Tanggal Berlaku Resep tsb** (dari `priceHistory`
  Ingredient Master Tahap 2), bukan harga hari ini — supaya kalau resep
  "berlaku Januari" diinput belakangan, HPP-nya tetap memakai harga bahan
  Januari. Snapshot ini masuk ke `costSnapshots` yang sama dengan Tahap 2,
  jadi `hppForPeriod()` (dipakai Sales → COGS) otomatis ikut memakai versi
  resep + harga yang benar untuk periode itu tanpa perlu diubah sama sekali.
- **Current Recipe/Current Cost tidak berubah** — Rincian Biaya Bahan Baku
  (`p.bahanList`) & HPP current (`hpp()`) yang dipakai tabel "COGS & Pricing
  Produk", PDF, Dashboard, dan Menu Engineering tetap dihitung dari resep +
  **harga ingredient TERKINI** seperti Tahap 1/2, sama sekali tidak disentuh.
- **"Lihat Riwayat Resep"** — tombol baru di tabel "COGS & Pricing Produk"
  (di sebelah "Riwayat HPP"), menampilkan **Current Recipe** (resep yang
  berlaku sekarang) dan **Recipe History** (semua versi resep sebelumnya
  lengkap dengan tanggal berlaku) dalam 1 modal sederhana — tidak ada
  menu/halaman baru.
- **Data lama tetap aman** — produk yang sudah punya `bahanList`/`recipe`
  dari sebelum Tahap 2.5 tetap terbaca & terhitung normal (fallback ke
  `p.recipe` current kalau `recipeVersions` belum ada). Begitu resepnya
  diedit pertama kali setelah update ini, resep lama otomatis diselamatkan
  sebagai 1 versi baseline (`effectiveFrom: null` — tanggal berlakunya
  sengaja **tidak ditebak** karena memang tidak diketahui) sebelum versi
  barunya ditambahkan, jadi tidak ada resep lama yang hilang.
- **Multi-Client tetap terisolasi** — `recipeVersions` hidup di dalam record
  produk yang sudah discope per Client/Outlet sejak Tahap 1, jadi Client A &
  B otomatis tidak pernah tercampur di fitur baru ini juga.
- **Belum dikerjakan** (di luar cakupan Tahap 2.5): Inventory, Purchasing,
  Receiving, OPEX, Net Profit, Marketing, ERP, dashboard/reporting besar baru,
  redesign besar, serta versioning untuk Biaya Tenaga Kerja/Overhead (tetap
  memakai nilai produk saat snapshot dibuat, sama seperti Tahap 2).
- Sudah diuji (skenario wajib): Client A/Outlet Jakarta/Produk Latte — Recipe
  v1 (Kopi 18g, Susu 150ml, Gula 20g) disimpan berlaku Januari → Recipe v2
  (Kopi 20g, Susu 150ml, Gula 15g) disimpan berlaku Maret → HPP Januari
  tetap memakai Recipe v1 & harga bahan Januari walau Recipe v2 sudah dibuat;
  HPP Maret memakai Recipe v2 & harga bahan Maret; HPP Current memakai Recipe
  v2 & harga bahan terkini; Sales → COGS bulanan tetap menghitung normal;
  reload browser → Recipe History & Riwayat HPP tetap ada; data Client A & B
  tidak tercampur; produk lama Tahap 1/2 (belum punya `recipeVersions`) tetap
  terbaca & terhitung tanpa error.

## TAHAP 7 — COGS & Food Cost Engine (Tahap 2): Cost Version + Historical Cost

**Konteks:** Di Tahap 1, HPP produk (`hpp()`) selalu dihitung LIVE dari
`bahanList` produk saat itu juga — kalau harga bahan di Ingredient Master
naik lalu tombol "Hitung Ulang dari Resep" diklik, angka HPP lama tertimpa
begitu saja tanpa jejak, dan Sales/COGS bulan-bulan sebelumnya ikut memakai
HPP terbaru itu (padahal transaksinya terjadi saat harga masih lama). Tahap
2 ini menutup celah tsb **tanpa membuat COGS engine kedua** — `hpp()`,
`bahanList`, dan mekanisme Qty × HPP di Sales semuanya tetap sama persis,
cuma ditambah lapisan riwayat di atasnya.

- **Cost Snapshot per Produk** — field baru `produk.costSnapshots` (array).
  Setiap kali produk disimpan (form Produk, baik Tambah maupun Edit) ATAU
  HPP dihitung ulang lewat tombol **"Hitung Ulang dari Resep"**, sistem
  menambah 1 snapshot baru berisi: Produk, Client (scope), Outlet, Recipe,
  rincian bahan (nama + cost per baris), Tenaga, Overhead, HPP, Harga Jual,
  Food Cost %, dan Effective Date (tanggal snapshot itu dicatat). Snapshot
  lama **tidak pernah ditimpa atau dihapus** — hanya ditambah. Tombol baru
  **"Riwayat HPP (n)"** di tabel "COGS & Pricing Produk" menampilkan semua
  snapshot ini (terbaru di atas) sebagai audit trail — "kenapa HPP produk
  ini Rp X" bisa ditelusuri untuk tiap titik waktu, bukan cuma yang current.
- **Ingredient Price History** — field baru `ingredient.priceHistory`
  (array `{tanggal, hargaBeli}`). Field "Harga Beli Terakhir" yang lama
  **tetap ada** dan tetap dipakai untuk hitungan CURRENT COST (tidak
  disentuh) — priceHistory murni tambahan. Form Ingredient Master sekarang
  punya field baru **"Tanggal Berlaku Harga"** (default: hari ini) supaya
  histori harga tercatat dengan tanggal yang benar. Tombol **"riwayat harga
  (n)"** di tabel Ingredient Master menampilkan semua harga yang pernah
  berlaku dan sejak kapan. Ingredient lama (sebelum Tahap 2) otomatis dapat
  1 entri baseline dari harga terakhirnya begitu diedit pertama kali —
  tidak ada histori yang hilang.
- **Current vs Historical Cost dipisah jelas** — CURRENT COST = `hpp(p)`
  seperti sebelumnya, dipakai apa adanya di tabel "COGS & Pricing Produk",
  PDF, Dashboard, dan Menu Engineering (tidak berubah sama sekali). HISTORICAL
  COST = `hppForPeriod(produk, bulan, tahun)`, dipakai KHUSUS untuk
  menghitung COGS Sales per periode — mengambil snapshot cost snapshot
  TERAKHIR yang berlaku sampai akhir bulan/tahun transaksi itu, supaya
  kenaikan harga bahan bulan depan tidak "bocor" ke COGS bulan-bulan
  sebelumnya. Produk lama yang belum pernah tersentuh Tahap 2 (belum punya
  `costSnapshots` sama sekali) otomatis fallback ke `hpp()` current persis
  seperti perilaku Tahap 1 — tidak ada migrasi paksa yang berisiko merusak
  data lama.
- **Recipe Version** — tidak ada UI versioning terpisah (sesuai arahan,
  supaya tidak jadi perubahan besar): recipe (`p.recipe`) yang berlaku pada
  suatu titik waktu ikut tersimpan penuh di dalam snapshot cost-nya
  masing-masing, jadi riwayat resep otomatis tertelusuri lewat "Riwayat
  HPP" tanpa perlu layar/menu baru.
- **Multi-Client tetap terisolasi** — costSnapshots & priceHistory hidup di
  dalam record produk/ingredient yang sudah discope per `scope`
  (Client)/`outletId` sejak Tahap 1; tidak ada key/tabel data baru yang
  perlu diisolasi terpisah, jadi Client A dan B otomatis tidak pernah
  tercampur di fitur baru ini juga.
- **Belum dikerjakan** (sesuai cakupan Tahap 2, di luar fokus kali ini):
  Inventory, Purchase Order, Receiving, OPEX, Net Profit, Marketing, ERP,
  dashboard/reporting besar baru untuk histori cost, redesign besar.
- Sudah diuji (skenario wajib): ingredient dengan harga Januari →
  hitung HPP produk dari resep → ubah harga ingredient jadi harga Februari
  → klik "Hitung Ulang dari Resep" → HPP CURRENT berubah TAPI snapshot
  Januari di "Riwayat HPP" tetap menunjukkan angka Januari; Sales/COGS
  untuk bulan Januari tetap memakai HPP Januari sedangkan Sales/COGS bulan
  Februari memakai HPP Februari; reload browser → riwayat harga & riwayat
  HPP tetap ada; data Client A & Client B (ingredient, produk, cost
  snapshot) tidak pernah tercampur; produk lama dari Tahap 1 (belum punya
  costSnapshots) tetap terbaca & terhitung normal tanpa error.

## TAHAP 6 — COGS & Food Cost Engine (Tahap 1): Ingredient Master + Resep

**Konteks:** Sebelum update ini, HPP produk di halaman Akuntansi > "COGS &
Pricing Produk" hanya bisa diisi manual per baris bahan (nama + harga total
per unit produk) — tidak ada perhitungan otomatis dari harga beli bahan
mentah, konversi satuan, atau yield/waste. Kalau harga bahan naik, HPP produk
harus dihitung ulang manual satu-satu.

- **Ingredient Master baru** — section baru "Ingredient Master (Bahan Baku)"
  di halaman Akuntansi (di atas "COGS & Pricing Produk"). Tiap bahan punya
  Nama, SKU, Kategori, Unit Pembelian, Unit Pemakaian, Konversi (mis. 1 kg =
  1.000 gram), Harga Beli Terakhir, **Yield/Usable %** (untuk trimming/waste,
  default 100%), Supplier, dan Outlet (opsional). Data ikut isolasi **Scope
  (Klien) → Outlet** yang sama persis dengan "COGS & Pricing Produk" dan
  "Cash Flow" (dropdown "Scope data" di atas) — bahan Klien A tidak akan
  pernah muncul saat Scope diganti ke Klien B.
- **Cost per Unit Pakai dihitung otomatis**: `(Harga Beli / Konversi) /
  (Yield% / 100)`. Contoh: kopi Rp180.000/kg, konversi 1.000 gram/kg → cost
  Rp180/gram. Kalau ada waste (mis. ayam 1kg jadi 800gram usable = yield
  80%), cost usable otomatis naik jadi Rp50/gram (bukan Rp40/gram cost
  mentah) — supaya HPP tidak under-costed.
- **Resep di form Produk** — di form "Produk/Menu" sekarang ada bagian
  "Atau Susun dari Resep (Ingredient Master)": pilih bahan dari Ingredient
  Master (mengikuti Outlet yang dipilih) + jumlah pakai, cost per baris
  otomatis. Tombol **"Terapkan Resep ke Bahan Baku"** mengisi Rincian Biaya
  Bahan Baku produk dari resep ini — HPP tetap dihitung lewat mekanisme
  `bahanList` yang sama seperti sebelumnya, jadi Sales, Dashboard, PDF, dan
  Menu Engineering otomatis ikut memakai HPP dari resep tanpa perubahan di
  modul-modul itu (tidak ada COGS engine kedua). Resep ikut tersimpan
  bersama produk untuk ditelusuri/dihitung ulang.
- **Hitung ulang HPP kapan saja** — kalau harga bahan di Ingredient Master
  berubah setelah produk disimpan, klik **"Hitung Ulang dari Resep"** di
  baris produk (tabel "COGS & Pricing Produk") untuk menghitung ulang HPP
  dari harga bahan TERKINI, tanpa mengetik ulang apa pun.
- **Edit Produk** — sebelumnya form Produk cuma bisa Tambah/Hapus/Salin ke
  Outlet Lain. Sekarang ada tombol **"Edit"** per baris produk untuk
  mengubah harga jual, resep, atau rincian bahan produk yang sudah ada
  (bukan bikin baris baru).
- **Kolom "Food Cost %" baru** di tabel "COGS & Pricing Produk" (di samping
  HPP), dihitung `HPP / Harga Jual × 100%` — sudah ada fungsinya sebelumnya
  tapi belum ditampilkan.
- **Tidak diubah**: mekanisme HPP (`hpp()`), Sales (Qty × HPP), Gross
  Profit, dan seluruh modul yang menarik dari `ALL_KEYS.produk` — semuanya
  tetap bekerja seperti sebelumnya, cuma sumber datanya (bahanList) yang
  sekarang bisa berasal dari Resep, bukan cuma manual.
- **Belum dikerjakan** (sesuai cakupan Tahap 1, menunggu fase berikutnya):
  Inventory penuh (stok bahan, kartu stok), Purchasing (PO ke supplier),
  OPEX umum di level HPP, Net Profit, dan dashboard/reporting besar khusus
  Food Cost.
- Sudah diuji: buat Ingredient Master untuk Client A (kopi, susu, gula
  dengan harga & konversi sesuai contoh), susun resep produk "Latte" →
  HPP & Food Cost % otomatis benar; buat Client B dengan bahan & produk
  terpisah → data tidak tercampur dgn Client A; ubah harga bahan → klik
  "Hitung Ulang dari Resep" → HPP ikut berubah; ubah harga jual → Food
  Cost % ikut berubah; reload browser → data Ingredient Master & resep
  tetap ada; alur Sales → COGS → Gross Profit tetap bekerja normal.

## TAHAP 5 — Client Data Linking: Timeline/Akuntansi/Presentasi/Dokumen ditautkan ke Client Master

**Konteks:** Sebelum update ini, field "Klien terkait" di Timeline, Akuntansi
(Arsip Dokumen), Presentasi, dan Dokumen adalah teks bebas (`client: "Nama
Klien"`) — rawan typo, dan kalau nama klien di Client Master (halaman
"Klien") diubah, data lama tidak ikut ter-update.

- **Field "Klien terkait" sekarang dropdown**, bukan lagi ketik manual — isinya
  langsung diambil dari Client Master, sama seperti dropdown Klien di form
  Company. Ada opsi "— Tidak terkait klien (internal) —" untuk item yang
  memang bukan milik klien tertentu.
- **Relasi disimpan sebagai `klienId`**, bukan teks nama. Nama yang tampil di
  kartu Timeline/Akuntansi/Presentasi/Dokumen selalu diambil LIVE dari Client
  Master — kalau nama klien diubah di halaman "Klien", semua tempat ini
  otomatis ikut menampilkan nama baru tanpa perlu edit ulang satu-satu.
- **Migrasi data lama otomatis (sekali jalan, aman):** teks klien lama yang
  cocok PERSIS dengan satu nama di Client Master otomatis ditautkan ke
  `klienId`-nya. Kalau namanya ambigu (cocok ke lebih dari satu klien) atau
  tidak ditemukan sama sekali, sistem TIDAK menebak — item tsb ditandai badge
  kuning putus-putus "⚠ Belum Terhubung: <teks lama>" supaya bisa dihubungkan
  manual lewat form, dan teks lamanya tetap tersimpan (tidak pernah dihapus).
- **Isolasi data ikut berlaku** di 4 modul ini: saat "Klien Aktif" di sidebar
  diganti ke klien tertentu, Timeline/Akuntansi/Presentasi/Dokumen hanya
  menampilkan data milik klien tsb (plus tetap tampil normal di mode
  "🗂 Semua Klien"). Timeline tetap mempertahankan filter Outlet yang sudah
  ada sebelumnya, sekarang digabung dengan filter Klien.
- **Tidak disentuh** (sesuai cakupan tahap ini): Kontak (field nama
  klien/kontak di sana tetap teks bebas karena masih tahap leads/prospect,
  belum tentu sudah jadi Client Master), KPI, SOP, serta modul Inventory,
  OPEX, Marketing (belum dikerjakan sama sekali).

## TAHAP 3 — Fondasi Multi-Klien: Klien → Company → Brand → Outlet

**Konteks berubah:** TRACE OS ditegaskan sebagai internal operating system untuk
TIM TRACE CONSULTANT (bukan ERP restoran), dipakai untuk mengelola banyak
klien F&B sekaligus. Sebelum update ini, daftar **Klien** (CRM: paket, status,
PIC) dan struktur **Company → Brand → Outlet** adalah dua data yang tidak
saling terhubung — Outlet tidak tahu ia milik klien mana, sehingga rekap
revenue/COGS di Dashboard menjumlahkan SEMUA outlet lintas klien tanpa filter.

- **Company sekarang wajib ditautkan ke Klien** — field baru `klienId` di
  form "Tambah Company" (halaman "Klien / Company / Brand / Outlet"). Company
  lama yang belum ditautkan tetap tampil normal (ditandai "belum ditautkan"),
  tidak ada data yang hilang.
- **Selector "Klien Aktif" baru di sidebar** (di atas "Outlet Aktif") —
  memilih satu klien akan menyaring dropdown Company/Brand/Outlet dan tabel
  Profitabilitas Outlet di Dashboard supaya hanya menampilkan data klien
  tsb. "🗂 Semua Klien" tetap tersedia untuk overview internal TRACE lintas
  klien. Dua outlet dengan nama sama (mis. sama-sama "Jakarta") di klien
  berbeda sekarang benar-benar terisolasi datanya, tidak pernah tergabung
  dalam satu rekap.
- **Reset Semua Data** — tombol baru (double-confirm) di halaman "Klien /
  Company / Brand / Outlet" untuk membersihkan seluruh data uji coba sebelum
  mulai memakai data klien sungguhan.
- **Dashboard**: kartu Revenue/COGS/Profit Outlet menampilkan **"BELUM ADA
  DATA"** (bukan "Rp 0") saat scope Klien/Outlet aktif belum punya Outlet
  sama sekali — supaya tidak terbaca seperti angka bisnis 0 yang sungguhan.
- **Belum disentuh** (sesuai instruksi, menunggu fase berikutnya): Inventory,
  OPEX, Marketing. Modul "Klien terkait" berbasis teks bebas (Timeline,
  Akuntansi, Presentasi, Dokumen) juga belum ditautkan ke `klienId` — masih
  rawan salah ketik/typo dan jadi kandidat perbaikan fase berikutnya, di luar
  cakupan foundation kali ini.

## TAHAP 2 — Fondasi Multi-Cabang: Company → Brand → Outlet

- **Menu baru "Company / Brand / Outlet"** di sidebar: kelola struktur
  bertingkat Company (badan usaha) → Brand (merek) → Outlet (cabang fisik).
  Isi sekali, dipakai di seluruh app (prinsip *enter data once, use
  everywhere*) — konsisten dengan pola "Anggota Tim" yang sudah ada.
- **Pemilih "Outlet Aktif"** di sidebar (di atas menu navigasi): pilih
  **🏢 Semua Outlet** atau outlet tertentu. Pilihan ini tersimpan di
  perangkat (localStorage) sehingga tetap dipilih walau di-reload.
- **Timeline sekarang bisa dikaitkan ke Outlet** (field opsional di form
  "Simpan ke Timeline") sebagai pembuktian arsitektur ini bekerja
  end-to-end — data lama (sebelum update ini) tetap terbaca normal di mode
  "Semua Outlet", hanya saja tidak muncul saat difilter ke outlet
  spesifik (karena memang tidak tercatat outlet-nya).
- **Belum disentuh** (menunggu konfirmasi & fase berikutnya): COGS &
  Pricing Produk, Cash Flow, Revenue, KPI, Inventory, OPEX, Marketing.
  Modul-modul ini akan mengikuti pola Outlet yang sama begitu fase
  berikutnya dikerjakan, supaya tidak ada sumber data ganda.
- Sudah diuji: buat 2 outlet, input data ke masing-masing, filter per
  outlet, filter "Semua Outlet", dan reload — semua data & pilihan
  filter tetap konsisten tanpa kehilangan data lama.

## Update sebelumnya

Ada 2 tahap: (A) buat database gratis di Supabase supaya data sinkron ke seluruh tim,
(B) upload ke Netlify supaya bisa diakses lewat link dan diinstal seperti app.

## A. Setup Supabase (5 menit)

1. Buka https://supabase.com → daftar/login gratis → **New project**.
2. Setelah project jadi, buka menu **SQL Editor** → jalankan query ini untuk membuat tabel penyimpanan:

   ```sql
   create table trace_kv (
     key text primary key,
     value text,
     updated_at timestamptz default now()
   );
   alter table trace_kv enable row level security;
   -- V17 production: jangan buat policy public read/write.
   -- Jalankan SUPABASE_AUTH_RLS.sql yang ikut di paket ini setelah
   -- akun anggota tim dibuat di Authentication → Users.
   ```

3. Aktifkan **Realtime** untuk tabel ini: menu **Database → Replication** →
   nyalakan toggle untuk tabel `trace_kv`.
4. Buka menu **Project Settings → API**. Salin dua nilai ini:
   - **Project URL** (contoh: `https://xxxxx.supabase.co`)
   - **anon public key** (kunci panjang di bagian Project API keys)
5. Buka file `index.html`, cari baris berikut di bagian atas `<script>`:

   ```js
   const SUPABASE_URL = "GANTI_DENGAN_SUPABASE_URL_ANDA";
   const SUPABASE_ANON_KEY = "GANTI_DENGAN_SUPABASE_ANON_KEY_ANDA";
   ```

   Ganti dengan Project URL dan anon key dari langkah 4. Simpan file.

> **Catatan keamanan V17:** aplikasi sekarang meminta login Supabase Auth
> sebelum membuka data tim. Semua anggota yang sudah terautentikasi tetap
> mendapat akses ke seluruh modul; JOBDESK hanya mengatur fokus kerja.
> Setelah akun tim dibuat, jalankan `SUPABASE_AUTH_RLS.sql` di Supabase SQL
> Editor. Policy tersebut memastikan request anonymous tidak dapat membaca
> atau menulis `trace_kv`.

## B. Deploy ke Netlify supaya bisa dibuka & diinstal (3 menit)

1. Buka https://app.netlify.com/drop
2. Drag & drop folder `trace_os_app` (isinya: index.html, manifest.json, sw.js,
   icon-192.png, icon-512.png) ke halaman tersebut.
3. Netlify akan memberi link seperti `https://nama-acak.netlify.app`.
   Bagikan link ini ke seluruh tim.
4. (Opsional) Di dashboard Netlify, klik **Site settings → Change site name**
   untuk mengganti jadi nama yang lebih rapi, misal `traceos-perusahaan.netlify.app`.

## C. Cara "install" di HP / laptop

- **Android (Chrome):** buka link-nya → akan muncul banner "Tambahkan ke layar
  utama" / lewat menu titik tiga → **Instal aplikasi**.
- **iPhone (Safari):** buka link-nya → tombol **Share/Bagikan** → **Tambah ke
  Layar Utama**.
- **Laptop (Chrome/Edge):** buka link-nya → ikon instal muncul di ujung kanan
  address bar → klik **Install**.

Setelah diinstal, aplikasi muncul sebagai ikon tersendiri, dan setiap orang
yang mengisi data akan langsung sinkron ke semua perangkat lain (via Supabase
Realtime) — tidak perlu refresh manual.

## Update terbaru (2) — Laporan PDF & SOP per Indikator KPI

- **Ganti logo** — sidebar/topbar sekarang pakai logo perusahaan Anda
  (`logo.png`), bukan tanda "T" lagi. Ikon HP (`icon-192.png`/`icon-512.png`)
  juga sudah diganti dari file yang Anda kirim.
- **Unduh Laporan Akuntansi (PDF)** — di halaman Akuntansi, ada tombol
  "⬇ Unduh Laporan (PDF)" di sebelah pemilih Scope/Tahun. Sekali klik,
  otomatis men-generate PDF berisi tabel COGS &amp; Pricing Produk, tabel
  Cash Flow &amp; Saldo Kumulatif, dan ringkasan Insight — semua utk
  scope &amp; tahun yang sedang ditampilkan. File PDF-nya langsung terunduh
  ke perangkat, dengan nama mis. `laporan-akuntansi-internal-2026.pdf`.
  Fitur ini butuh koneksi internet (pustaka PDF dimuat dari CDN saat
  halaman dibuka); kalau gagal termuat, tombolnya akan kasih tahu lewat
  notifikasi, tinggal refresh & coba lagi.
- **SOP per Indikator KPI** — supaya KPI bukan cuma angka yang dicatat,
  tapi juga ada "cara kerja"-nya. Tiap indikator KPI (baik bawaan maupun
  custom) sekarang bisa diisi SOP/strategi pencapaiannya lewat tombol
  "Edit SOP" di form "Kelola Indikator &amp; SOP KPI", atau langsung dari
  tombol "edit"/"+ Tambah SOP" yang muncul di bawah tiap tabel indikator di
  halaman KPI &amp; Target. SOP ini terlihat oleh seluruh tim. 10 indikator
  bawaan (BD, AE, Social Media Specialist) sudah saya isikan draft SOP
  awal sebagai starting point — silakan disesuaikan lagi dengan cara kerja
  tim Anda yang sebenarnya, karena saya menulisnya berdasarkan pola umum,
  bukan SOP resmi perusahaan Anda.

## Update terbaru (perbaikan sesuai request)

- **Data revenue / cash flow / KPI sekarang punya field "tahun"** — dulu cuma
  nyimpen bulan (Jan–Des) tanpa tahun, jadi Januari tahun depan akan menimpa
  Januari tahun ini. Sekarang setiap catatan disimpan per **bulan + tahun**,
  dan data lama yang belum punya tahun otomatis "dimigrasi" sekali (tahunnya
  diambil dari kapan data itu pertama kali dicatat) — tidak ada data yang
  hilang. Ada selector "Tahun ditampilkan" di halaman Akuntansi & KPI, dan
  field Tahun di tiap form input. Saldo Awal Tahun juga sekarang per
  scope + tahun, dan kalau ganti ke tahun baru yang belum diisi, sistem
  otomatis menyarankan angka saldo awal dari saldo akhir tahun sebelumnya
  (tinggal klik "Simpan Saldo Awal" untuk konfirmasi).
- **Konfirmasi sebelum hapus** — semua tombol "Hapus" di seluruh app (timeline,
  klien, dokumen, produk, cash flow, KPI, anggota tim, dll) sekarang minta
  konfirmasi dulu lewat pop-up, tidak langsung eksekusi.
- **Anggota tim baru otomatis dapat KPI sendiri** — panel "Anggota Tim" di
  Dashboard sekarang benar-benar terhubung ke halaman KPI: begitu nama baru
  ditambahkan, dia langsung muncul sebagai chip/orang baru di KPI & Target.
  Indikator KPI (nama indikator, satuan, cara hitung, target) juga sekarang
  data yang bisa ditambah/dihapus sendiri lewat form "Kelola Indikator KPI"
  di halaman KPI & Target — tidak perlu edit kode lagi untuk orang baru.
- **Riwayat perubahan (edit history)** — kalau angka revenue / cash flow /
  KPI individu yang sudah ada datanya diedit ulang, nilai sebelumnya (beserta
  siapa yang mengisi & kapan) tersimpan dan bisa dilihat lewat tombol
  "riwayat" di baris tabel yang bersangkutan. Form-form itu sekarang juga
  punya field "Diisi oleh" supaya atribusinya jelas (lihat catatan di bawah
  atribusi manual; identitas akses diverifikasi oleh Supabase Auth).
- **Timeline bisa ditandai Selesai** — tiap update di Timeline sekarang punya
  tombol "✓ Tandai Selesai" / "↺ Tandai Berjalan lagi", dengan badge status.
  Item yang sudah ditandai Selesai tidak lagi dihitung sebagai "Deadline
  Lewat" di Dashboard meskipun tanggalnya sudah lewat.
- **Logo perusahaan** — tanda "T" sekarang otomatis diganti logo perusahaan
  kalau ada file `logo.png` di folder yang sama dengan `index.html` (lihat
  bagian "Ganti logo" di bawah).
- **Grafik**: tren revenue bulanan (target vs realisasi) di halaman KPI &amp; Target,
  dan tren cash flow (net cash flow + saldo kumulatif) di halaman Akuntansi.
- **Input Rupiah**: semua form finansial (revenue, asumsi biaya, KPI, produk,
  cash flow) sekarang otomatis kasih pemisah ribuan saat mengetik.
- **COGS breakdown**: biaya bahan baku produk sekarang bisa dirinci per item
  (mis. susu, gula, kopi bubuk), bukan cuma satu angka flat. Produk lama yang
  masih pakai angka flat tetap kebaca normal.
- **Tampilan HP**: tabel Produk & Cash Flow di halaman Akuntansi sekarang jadi
  tampilan card di layar sempit, bukan tabel yang harus discroll ke samping.
- **Anggota tim**: nama tim sekarang jadi data yang bisa ditambah/dihapus dari
  halaman Dashboard ("Anggota Tim") — bukan hardcode di kode lagi. Semua
  dropdown nama/PIC di seluruh app otomatis ambil dari daftar ini.

### Ganti logo perusahaan

Sudah dipasang — `logo.png`, `icon-192.png`, dan `icon-512.png` di paket ini
sudah pakai logo yang Anda kirim. Kalau nanti mau ganti lagi, cukup timpa
ketiga file itu (persegi, minimal 256×256px) di folder yang sama dengan
`index.html`, lalu upload ulang ke Netlify — tidak perlu edit kode.

### Keamanan akses V17 — Supabase Auth

TRACE Consultant OS V17 adalah sistem internal. Akses produksi menggunakan
Supabase Auth (email + password). Tidak ada role-permission yang membatasi
modul: anggota tim yang sudah login tetap dapat membuka seluruh sistem.
JOBDESK hanya workspace/fokus personal.

Langkah sekali saja setelah deploy:

1. Supabase → **Authentication → Users → Add user**. Buat akun untuk tiap anggota tim.
2. Jangan mengaktifkan policy public read/write.
3. Jalankan file `SUPABASE_AUTH_RLS.sql` di **SQL Editor**.
4. Deploy paket V17 ke Netlify.
5. Uji login dengan minimal dua akun tim dan pastikan keduanya dapat membaca data yang sama.

Jika akun belum dibuat atau login gagal, aplikasi tidak membuka data cloud.
Mode localStorage hanya tetap tersedia ketika Supabase memang tidak dikonfigurasi
untuk development/testing; paket produksi V17 sudah memiliki konfigurasi Supabase.

### Catatan soal field "Diisi oleh" & riwayat perubahan

Field "Diisi oleh" tetap dipertahankan untuk kompatibilitas data lama dan
atribusi operasional. Untuk identitas yang benar-benar terverifikasi, gunakan
akun Supabase yang sedang login; email akun tampil di topbar. Field manual
tersebut tidak dianggap sebagai mekanisme keamanan.

Riwayat perubahan ini mulai tercatat **sejak update ini dipasang** — edit-an
yang terjadi sebelum update ini tidak punya riwayat (karena memang belum
pernah dicatat), tapi setiap edit ulang mulai sekarang akan tersimpan.

Yang **belum** bisa diselesaikan lewat file ini saja (butuh infrastruktur di
luar kendali file statis ini):
- **Sinkron WA/IG otomatis**: butuh Meta Business API + webhook server
  terpisah (server, bukan cuma HTML/JS di browser) — di luar cakupan app
  client-side ini.
- **AI Insight pakai LLM asli**: untuk memanggil LLM sungguhan (bukan
  rule-based), butuh backend yang menyimpan API key dengan aman — kalau key
  ditaruh langsung di kode client-side ini, siapa pun bisa mengambilnya dari
  browser. Perlu server kecil (mis. Cloudflare Worker/Netlify Function) yang
  jadi perantara.

## Update berikutnya

Kalau nanti mau ubah tampilan/fitur, edit `index.html` lalu upload ulang
foldernya ke Netlify (drag & drop lagi, otomatis timpa versi lama).
