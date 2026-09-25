import { forwardRef, type CSSProperties, type ReactNode, type HTMLAttributes } from 'react';

/**
 * Phase 2 — komponen presentasional bersama untuk seluruh view TRACE.
 * Markup di sini SENGAJA sama persis dengan pola `.trace-card` lama
 * (lihat KpiTrackingView dkk sebelum migrasi) supaya mengganti view
 * satu per satu ke komponen ini tidak mengubah tampilan/CSS sama sekali —
 * ini refactor struktural, bukan redesign visual.
 */

/** Header halaman: kicker kecil + judul besar + deskripsi opsional. Ganti blok
 * `<div className="trace-card" style={{padding:26}}>...</div>` yang berulang di view.
 * Dua varian kicker sudah dipakai di codebase sebelum migrasi ini — keduanya dipertahankan
 * apa adanya (bukan diseragamkan) supaya migrasi ini murni struktural, tanpa efek visual:
 * `muted` (18 view, class `trace-muted`) dan `section` (4 view: BusinessDiagnosis,
 * BusinessHealthView, BusinessTwinView, DataRecovery — class `trace-section-kicker`,
 * huruf lebih kecil+bold+uppercase). Default `muted` karena itu yang lebih umum.
 * `extra` (opsional, ditambah v8 sesi ini): slot untuk elemen kondisional di ANTARA
 * `<h1>` title dan `<div className="trace-muted">` description — dibuat khusus untuk
 * kasus `DataIntake` (banner "Draft lokal dipulihkan otomatis") yang strukturnya beda
 * dari 22 view lain. Lihat HANDOFF v6 §1c opsi (a) dan v8 §1c. */
export function TracePageHeader({
  kicker,
  kickerVariant = 'muted',
  title,
  extra,
  description,
}: {
  kicker: string;
  kickerVariant?: 'muted' | 'section';
  title: ReactNode;
  extra?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="trace-card" style={{ padding: 26 }}>
      <div
        className={kickerVariant === 'section' ? 'trace-section-kicker' : 'trace-muted'}
        style={kickerVariant === 'section' ? undefined : { fontSize: 12 }}
      >
        {kicker}
      </div>
      <h1 style={{ margin: '7px 0 5px', fontSize: 30 }}>{title}</h1>
      {extra}
      {description != null && <div className="trace-muted">{description}</div>}
    </div>
  );
}

/** Pembungkus tipis untuk `.trace-card` biasa (bukan header) — dipakai untuk seksi
 * konten di dalam view. Tidak mengubah styling; hanya menghindari className literal
 * berulang dan bikin penambahan varian (mis. state disabled) satu tempat nanti.
 * `forwardRef` + spread `...rest` ditambahkan (v8 sesi ini) supaya komponen ini juga
 * aman dipakai sebagai anak langsung `<Popover.Trigger asChild>`/`<Dialog.Trigger asChild>`
 * dkk (Radix) — Radix meng-clone anaknya dan menyuntik `ref`, `onClick`, `aria-*`,
 * `data-state`, dst; tanpa ini, prop-prop itu diam-diam hilang dan trigger tidak berfungsi.
 * Lihat HANDOFF v7 §1b — ini yang bikin kartu popover `AnalyticsView` sebelumnya sengaja
 * TIDAK dimigrasi. Sekarang sudah aman dimigrasi (lihat v8 §1). */
export const TraceCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { children: ReactNode }>(
  function TraceCard({ children, style, className, ...rest }, ref) {
    return (
      <div ref={ref} className={className ? `trace-card ${className}` : 'trace-card'} style={style} {...rest}>
        {children}
      </div>
    );
  },
);

/** Pesan "belum ada data" yang seragam. Prinsip produk: nilai kosong = pesan ini,
 * BUKAN angka 0 — lihat catatan kejujuran di HANDOFF. Wording konsisten di semua view
 * (sebelumnya bervariasi: "Belum ada data" / "belum ada data" / teks lain per view). */
export function TraceEmptyState({ message = 'Belum ada data.' }: { message?: string }) {
  return <div className="trace-muted" style={{ fontSize: 12 }}>{message}</div>;
}
