> **[DIHENTIKAN — baca STATUS.md]** Rantai `HANDOFF_NEXT_PHASES_v*.md` tidak dilanjutkan lagi mulai 2026-09-21. File ini disimpan sebagai arsip historis (keputusan desain & konteks di dalamnya tetap berlaku kecuali dikoreksi di `STATUS.md`), tapi status terkini HANYA ada di `STATUS.md` di root repo.

# TRACE Consultant OS — HANDOFF v3 (dibuat 2026-09-21, sesi lanjutan setelah redesain UI v4)

Menggantikan `HANDOFF_NEXT_PHASES_v2.md` untuk status terbaru; v2 dan v1 tetap dibaca untuk konteks keputusan desain (bagian 2), fakta produk (5b–5d), dan sejarah phase 0–20. Sumber kebenaran tetap KODE di ZIP `traceconsultant1-main_PHASE2_redesign_v5.zip`.

## 1. YANG BERUBAH DI SESI INI (penting)

### 1a. Verifikasi build — SEKARANG BENAR-BENAR DIJALANKAN (bukan lagi "NOT VERIFIED")
Sandbox sesi ini TERNYATA punya akses jaringan ke registry npm (bukan hanya Supabase yang tidak bisa diakses). Semua perintah di bagian 6a-1 berhasil dijalankan sungguhan, hasil asli (bukan diklaim):

```
node --version         → v22.22.2   (match engines: >=22.22.2 <23)
npm --version          → 10.9.7     (match engines: >=10.9 <11)
npm ci                 → PASS (282 packages, 3 vulnerabilities moderate/high — belum diaudit, lihat 4d)
npm run typecheck:react→ PASS, 0 error
npm run test:deterministic → PASS 25/25 (24 lama + 1 baru, lihat 1b)
npm run build:react    → PASS, build sukses (bundle utama 1,247 kB — masih di atas 500kB, Phase 18 belum dikerjakan)
npm run build:site     → PASS
npm run release:preflight (verify:runtime + verify:dependencies) → PASS, ok:true di keduanya
```

**Yang MASIH belum bisa diverifikasi di sesi ini** (sama seperti v2): koneksi ke Supabase live (RPC baru di 1b belum pernah dipanggil ke database sungguhan), rendering visual di browser asli, kontras/keyboard/reduced-motion. Jangan anggap PASS untuk hal-hal ini.

### 1b. Fitur selesai: "Jalur kerja → tugas nyata" (rekomendasi 6a langkah #3, bagian 5c poin BELUM-2)
Setiap temuan jalur kerja yang menyala (COGS/OPEX/Labor/Margin/Revenue) ATAU area yang perlu asesmen manual (Branding, Media Sosial, Inventory, ERP/POS) sekarang bisa diklik jadi tugas nyata di `trace_collaboration_tasks`, lengkap dengan **owner** (user login saat itu), **due date** (3/7/14 hari dari severity — high=3, medium=7, low=14, manual=14), dan **evidence** (alasan temuan, disalin apa adanya ke `evidence_ids`).

File baru:
- `src/core/workstreams.ts` — fungsi murni baru `taskDraftFromFinding(finding, nowIso)`: mengubah satu `WorkstreamFinding` (status `flagged` atau `manual`) jadi `WorkstreamTaskDraft` (title, priority P0–P3, dueDateIso, evidenceNote). Return `null` untuk status `ok`/`nodata` (tidak masuk akal jadi tugas). Deterministik — `nowIso` diteruskan pemanggil, bukan `Date.now()` langsung, supaya bisa dites.
- `tests_core/test_workstream_tasks.mjs` — tes baru, PASS, sudah masuk `test:deterministic` di `package.json`.
- `supabase/migrations/053_workstream_task_creation_v72.sql` — RPC baru `trace_create_workstream_task(p_client_id, p_workstream_key, p_title, p_owner_user_id, p_priority, p_due_date, p_evidence_note)`. **ADDITIVE**: tidak mengubah/menghapus `trace_create_collaboration_task` (migration 026) yang masih dipakai apa adanya oleh `BusinessTwinView.tsx`. Guard sama (harus team member, owner harus team member aktif), audit log tercatat. **Migration ini belum pernah dijalankan ke Supabase manapun** — perlu `supabase db push` atau setara oleh user, lalu diuji.

File diubah:
- `src/app/portfolio.tsx` — tambah `createWorkstreamTask(clientId, finding)` di `PortfolioValue`: memanggil RPC baru, lalu meng-update state tugas klien tersebut secara lokal (tanpa reload seluruh 40 klien — cepat).
- `src/app/views/OverviewLive.tsx` — wiring `onCreateTask` dari portfolio ke `OverviewDashboard`.
- `src/app/components/OverviewDashboard.tsx` — komponen baru `WorkstreamTaskButton` (state idle/menyimpan/selesai per baris, supaya tidak dobel-klik); tombol "Jadikan tugas" muncul di setiap baris jalur kerja yang menyala DAN di setiap baris "perlu asesmen langsung", tapi HANYA saat satu klien sudah dipilih (`model.jalur.selected`) — sesuai aturan "task harus scoped ke satu klien" di seluruh aplikasi.
- `src/styles/dashboard.css` — style tombol `.tr-jalur-task-btn` (pill kecil, posisi kanan-bawah tiap baris).

**BELUM (di luar cakupan sesi ini, lanjutan wajar dari fitur ini)**:
- Uji RPC ke Supabase live sungguhan (buat 1 tugas dari UI, cek muncul di `trace_collaboration_tasks`, cek muncul balik di Antrean Kerja & Business Twin).
- Nama pemilik tugas masih hanya `owner_user_id` (UUID) di UI Business Twin — belum di-resolve ke nama tim (item lama di 6a-3, belum tersentuh).
- Belum ada cara mengubah/hapus tugas yang salah dibuat dari jalur kerja (harus lewat Business Twin manual untuk sekarang).
- Belum ada uji visual — screenshot dari harness lokal, bukan browser asli, tombol baru belum dibandingkan ke referensi.
- Validasi kontras/tap-target tombol baru (pill 11px) belum diaudit aksesibilitas.

## 2. Status ringkas (update dari v2 §1)
| Phase | Status | Catatan |
|---|---|---|
| 0 Audit, 1 Runtime/build | SELESAI, **dan sekarang genuinely diverifikasi ulang** (lihat 1a) | |
| 2 Shell + design system | SEBAGIAN (tidak berubah dari v2) | |
| 3 Login/boot/greeting | BELUM | |
| 4 Context global | SEBAGIAN (tidak berubah dari v2) | |
| 5 Overview | SEBAGIAN, lebih maju: jalur kerja kini bisa langsung jadi tugas (1b) | sparkline, timeline penuh per klien masih BELUM |
| 5c/6a-3 jalur→tugas | **Otomasi selesai** (draf tugas + RPC + UI); **penyimpanan asesmen manual, sinyal otomatis inventory/POS/sosial, cashflow AR/AP nyata masih BELUM** (tidak berubah dari v2 §5c) |
| 6–20 | BELUM | tidak disentuh |

## 3. Sisa pekerjaan — urutan resmi (dari v2 §6a, disesuaikan)
1. ~~Verifikasi build~~ **SELESAI genuinely (1a)**.
2. **Uji RPC baru ke Supabase live** (blocker sebelum fitur 1b dianggap tuntas produksi) — perlu akses Supabase dari sisi user/CI, bukan sandbox ini.
3. **Phase 4 + 2 (selesaikan)**: periode/outlet global + tampilan seragam — urutan sama seperti v2 §6.B–C, belum disentuh sesi ini.
4. **Sisa 5c**: simpan hasil asesmen manual (feed rapi/tidak, brand dikenal/tidak) — via client KV RPC `trace_upsert_client_kv` (perlu tambah key ke `CLIENT_SCOPED_KEYS` di trace-data.js) atau tabel baru; sinyal otomatis inventory/POS/sosial; cashflow AR/AP nyata.
5. **Phase 6 + 8**: Business Health + Finance/Accounting (Revenue kotor → bersih → Net Profit).
6. **Alur Acquisition → Klien** (Phase 13): PROVIDER UNAVAILABLE bukan 0 lead.
7. **Phase 9–11**: urutan ditanyakan ke user.
**NANTI**: Phase 3, 7, 14–16 (kecuali importer gagal baca file). **Sebelum tim/data klien nyata banyak**: Phase 17–20.

## 4. Catatan kejujuran (update dari v2 §7)
- Semua status PASS di bagian 1a benar-benar dijalankan di sesi ini dengan output asli disalin, bukan diklaim dari ingatan sesi sebelumnya.
- RPC baru migration 053 BELUM diuji ke Supabase live — jangan tandai selesai sampai itu terjadi.
- 3 kerentanan (moderate/high) dari `npm audit` belum ditinjau — belum tentu relevan (bisa dependency dev-only), tapi belum dicek satu-satu di sesi ini.
- Tidak ada data/migration/RLS yang dihapus. Migration baru murni additive (`create or replace` fungsi baru dengan nama baru + tabel lama tidak disentuh).
- Node 22.22.2 / npm 10.9.x tidak diturunkan.
- Tidak ada dummy data ditambahkan ke kode produksi; fixture baru (`tests_core/test_workstream_tasks.mjs`) hanya di tes.

## 5. PROMPT UNTUK CLAUDE BERIKUTNYA (salin ke chat/akun baru)
Kamu melanjutkan pekerjaan di aplikasi INTERNAL "TRACE Consultant OS". BACA PERTAMA: `HANDOFF_NEXT_PHASES_v3.md` (dokumen ini — status terbaru, fitur jalur-kerja-ke-tugas yang baru selesai, sisa kerja urutan resmi di bagian 3), lalu `HANDOFF_NEXT_PHASES_v2.md` (keputusan desain visual di §2, konteks produk di §5b–5d yang masih berlaku penuh), lalu `HANDOFF_NEXT_PHASES.md` (v1, sejarah phase 0-20). Kode aktual (sumber kebenaran) ada di ZIP `traceconsultant1-main_PHASE2_redesign_v5.zip`.
Langkah pertama WAJIB: jalankan ulang `npm ci && npm run typecheck:react && npm run test:deterministic && npm run build:react` di environment kamu sendiri sebelum mengklaim apa pun — jika tidak ada jaringan, katakan terus terang, jangan klaim PASS berdasar hasil sesi lalu di dokumen ini (lingkungan bisa berbeda).
Prioritas berikutnya (lihat bagian 3): (a) minta user menjalankan migration `supabase/migrations/053_workstream_task_creation_v72.sql` ke Supabase lalu uji end-to-end fitur "Jadikan tugas" dari Overview; (b) lanjut Phase 4+2 (periode/outlet global); (c) lanjut sisa 5c (asesmen manual tersimpan, sinyal inventory/POS/sosial, cashflow AR/AP nyata).
Batasan sama seperti sesi sebelumnya (tidak berubah): jangan rewrite besar-besaran; jangan hapus/reset data, migration, atau RLS; jangan turunkan Node 22.22.2 / npm 10.9.2; jangan dummy data di kode produksi; nilai kosong = "Data belum cukup", bukan 0; jangan klaim PASS tanpa menjalankan tes; kirim ZIP versi baru (v6, …) + HANDOFF baru (tambah, jangan hapus) tiap sesi selesai. Semua tes `tests_core/*.mjs` harus tetap lulus (25 saat dokumen ini ditulis).
Bahasa antarmuka dan komunikasi: Indonesia.
