# Perbaikan TRACE OS — 2026-09-18

## File yang diubah (4 file, drop-in replacement)
- react-app/index.html
- src/app/main.tsx
- src/app/views/AcquisitionView.tsx
- src/styles/tokens.css

Cara pakai: timpa 4 file ini di repo asli (path sama persis), commit, push — Netlify akan build ulang otomatis. Sudah diverifikasi dengan `npm run build:site` yang sebenarnya, bukan cuma dibaca.

## 1. PWABuilder: "Fix the links to your icons" + "Fix the icon types" (2 error)
**Akar masalah:** `react-app/index.html` memanggil manifest dengan path relatif
`../manifest.json`. Vite membaca ini sebagai referensi asset, lalu meng-hash dan
memindahkannya ke `dist/react/assets/manifest-XXXX.json` saat build — padahal
`icon-192.png`/`icon-512.png` yang sebenarnya tetap disalin ke root
(`dist/react/icon-192.png`) oleh `scripts/copy-static-for-publish.mjs`. Karena
manifest sekarang ada di `/assets/...json` dan icon-nya ditulis relatif
(`"icon-192.png"`), browser jadi mencari icon di `/assets/icon-192.png` yang
tidak ada di sana → PWABuilder tidak bisa fetch icon-nya sama sekali.

**Fix:** ubah link manifest jadi path absolut `/manifest.json`. Vite tidak
memproses path absolut sebagai asset, jadi manifest tetap di root — persis di
tempat yang sama dengan icon-nya. Sudah dicoba build ulang: `dist/react/index.html`
sekarang memuat `<link rel="manifest" href="/manifest.json"/>` dan
`dist/react/manifest.json` + `icon-192.png` + `icon-512.png` semua ada di root.

## 2. PWABuilder: "Make your app faster and more reliable by adding a service worker" (warning)
**Akar masalah:** `sw.js` sudah ada dan sudah ikut ter-deploy, tapi baris
`navigator.serviceWorker.register(...)` cuma ada di `index.html` versi lama
(sekarang cuma jadi `/legacy-classic.html`, bukan halaman yang aktif). App
React yang sekarang jadi pemilik "/" (`react-app/index.html` → `src/app/main.tsx`)
tidak pernah mendaftarkan service worker-nya sendiri.

**Fix:** tambah `navigator.serviceWorker.register('/sw.js')` di `useEffect` pada
`App()` di `src/app/main.tsx`. Sudah dicek muncul di hasil build JS.

Setelah ini, "Fix the icon sizes" kemungkinan juga ikut hilang — sebelumnya
PWABuilder kemungkinan gagal memverifikasi ukuran icon karena memang gagal
fetch icon-nya (bukan karena ukuran filenya salah — sudah dicek 192×192 dan
512×512, sudah benar).

## 3. Tampilan Acquisition: kotak besar kosong + harus scroll dulu
**Akar masalah:** `AcquisitionView.tsx` menambahkan kartu deskripsi ("Discovery
dan pipeline berjalan sebagai modul internal TRACE...") di atas iframe
`/acquisition/index.html` — padahal halaman di dalam iframe itu sendiri sudah
punya hero + tombol "🔎 Temukan Calon Klien Hari Ini" di baris paling atas.
Kartu tambahan ini mendorong konten asli ke bawah. Ditambah lagi, tinggi
container (`calc(100vh - 140px)`) sebenarnya sudah lebih pendek dari total
padding halaman (topbar 72px + padding atas 32px + padding bawah 90px = 194px),
jadi selalu ada scroll di level halaman sebelum sempat melihat isi iframe-nya.

**Fix:**
- Kartu deskripsi dihapus — iframe langsung diberi seluruh area yang tersedia.
- `AcquisitionView.tsx` sekarang cuma iframe full-bleed dengan class CSS baru
  `.trace-acquisition-embed` (ditambahkan di `tokens.css`), yang meniadakan
  padding halaman secara presisi per breakpoint (desktop / tablet / mobile,
  termasuk memberi ruang untuk bottom nav mobile yang fixed) supaya iframe-nya
  pas mengisi tinggi layar tanpa scroll ekstra dan tanpa kepotong nav mobile.

## Belum diperbaiki di patch ini — butuh keputusan/tindakan dari kamu
**"AI belum tersedia: TRACE_AI_MODEL, GEMINI_MODEL, atau OPENAI_MODEL wajib
diisi"** — ini BUKAN bug kode. `netlify/functions/ai-chat.js` mengembalikan
pesan ini kalau tidak ada satupun environment variable AI provider yang di-set
di Netlify. Set salah satu paket berikut di Netlify → Site settings →
Environment variables (lalu redeploy):

```
TRACE_AI_PROVIDER=gemini
GEMINI_API_KEY=<API key dari https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-2.5-flash-lite
```

(instruksi lengkap sudah ada di file `AI_GEMINI_FREE_SETUP.md` di repo kamu)

---

# Update 2 — Layout HP + URL bar saat di-package PWABuilder

## 4. Tampilan supaya "ngikutin" layar HP (padat tapi rapih)
Aplikasi ini punya ±30 modul, dan hampir semua form/kartu KPI-nya ditulis
dengan grid kolom tetap untuk layar desktop (`grid-template-columns: repeat(4,...)`,
`"1.2fr 1fr 100px auto"`, dst) langsung di style tiap komponen. Mengedit satu-satu
30+ file itu pekerjaan besar dan berisiko — jadi perbaikannya dilakukan di level
CSS global (`tokens.css`), bukan per file, dengan cara yang **sudah diverifikasi
lolos build**:

- Di lebar ≤600px (ukuran HP), SEMUA grid multi-kolom otomatis ditumpuk jadi
  1 kolom — jadi input/tombol/label tampil penuh selebar layar dan gampang
  dibaca/ditekan, bukan diperas jadi kecil-kecil menyamping.
- Judul halaman (`<h1>` di dalam kartu, biasanya 27–30px di desktop) dikecilkan
  jadi 20px, dan padding kartu dipadatkan dari 20–26px jadi 14px — supaya kesan
  "padat tapi rapih" seperti yang diminta, bukan sekadar dipersempit dari layout
  desktop.
- `overflow-x:hidden` di html/body sebagai pengaman terakhir supaya tidak ada
  elemen manapun yang bikin halaman bisa di-scroll ke samping di HP.
- Tabel (Chart of Accounts, Trial Balance, dll) fontnya sedikit dikecilkan biar
  muat, dan sudah dibungkus `overflow-x:auto` di kode aslinya jadi tetap bisa
  di-scroll horizontal per tabel kalau memang kepanjangan, tanpa merusak layout
  halaman.

Ini bukan redesign ulang tiap modul, tapi memang cara paling aman & terukur
untuk membuat SEMUA modul sekaligus jadi enak dipakai di HP tanpa menyentuh
30 file satu-satu — dan efeknya sudah dicek langsung di CSS hasil build asli
(`grid-template-columns:1fr!important` dkk memang muncul di file akhir).

Kalau nanti ada 1-2 modul spesifik yang menurutmu masih kurang pas di HP
setelah dites langsung di HP kamu, kasih tau modul mana — itu bisa disempurnakan
lagi per halaman.

## 5. Kenapa muncul URL/https di atas waktu dites lewat PWABuilder
Ini hampir pasti soal verifikasi **Digital Asset Links** untuk paket Android
(TWA), bukan soal manifest/CSS. Cara kerjanya: APK yang dihasilkan PWABuilder
akan mencocokkan tanda tangan (signing key) APK-nya dengan file
`/.well-known/assetlinks.json` di situsmu. Kalau cocok → tampil full layar
tanpa address bar. Kalau tidak cocok/tidak ketemu → Android otomatis mundur ke
tampilan seperti browser (Custom Tab, ada address bar) — persis yang kamu
lihat.

Repo kamu sudah punya file ini (`well-known/assetlinks.json`, ikut ter-deploy
ke `/.well-known/assetlinks.json` dan `/well-known/assetlinks.json` lewat
`copy-static-for-publish.mjs` — sudah dicek strukturnya benar):

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "app.netlify.traceconsultantessentials.twa",
    "sha256_cert_fingerprints": ["9C:CC:71:...:70"]
  }
}]
```

Yang paling sering bikin ini gagal cocok:
1. **Fingerprint beda dari APK yang benar-benar kamu pasang.** Kalau tiap kali
   generate APK di PWABuilder kamu biarkan dia bikin signing key baru
   otomatis, fingerprint-nya beda tiap build — sementara file di atas isinya
   fingerprint dari build yang lama. Solusinya: download & simpan SATU
   keystore dari PWABuilder, pakai keystore yang sama itu terus untuk setiap
   build APK ke depannya (ini juga wajib kalau nanti mau update app di Play
   Store — ganti signing key = dianggap app beda).
2. **Package name tidak sama persis** antara yang kamu isi di form Android
   PWABuilder dengan `package_name` di file ini — harus sama persis, termasuk
   huruf besar/kecil.

Cara cek/ambil fingerprint yang benar dari keystore yang kamu pakai sekarang:
```
keytool -list -v -keystore nama-keystore-kamu.keystore
```
cari baris `SHA256:` — itu yang harus persis sama dengan isi
`sha256_cert_fingerprints` di `assetlinks.json`. Kalau beda, update angka di
file itu, commit, push, redeploy, lalu install ulang APK-nya untuk dites lagi.

Saya tidak bisa memperbaiki file ini secara pasti dari sini karena
fingerprint-nya berasal dari keystore yang cuma ada di device/akun PWABuilder
kamu — kirim saja fingerprint SHA256 yang benar (dari langkah generate APK
kamu yang terakhir), dan saya bantu update file `assetlinks.json`-nya.
