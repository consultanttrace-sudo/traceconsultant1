// Pure calculation is separated from DOM rendering on purpose: computePieSlices can be unit
// tested in plain Node (no browser, no canvas), while renderPieChartPng is a thin wrapper around
// the browser <canvas> API and can only run where `document` exists. Do not merge them — keeping
// the math testable is the point.
export interface PieSlice { label: string; value: number; pct: number; startAngle: number; endAngle: number; color: string; }

const DEFAULT_COLORS = ['#16a34a', '#eab308', '#dc2626', '#2563eb', '#7c3aed', '#0891b2', '#ea580c', '#64748b'];

export function computePieSlices(data: Array<{ label: string; value: number }>, colors: string[] = DEFAULT_COLORS): PieSlice[] {
  const positive = data.filter(d => Number.isFinite(d.value) && d.value > 0);
  const total = positive.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return [];
  let angle = -Math.PI / 2;
  return positive.map((d, i) => {
    const pct = d.value / total;
    const startAngle = angle;
    const sweep = pct * Math.PI * 2;
    angle += sweep;
    return { label: d.label, value: d.value, pct, startAngle, endAngle: angle, color: colors[i % colors.length] };
  });
}

/** Renders slices onto an offscreen <canvas> and returns a PNG data URL. Browser-only: throws
 * immediately (instead of failing obscurely later) if `document` is not available. */
export function renderPieChartPng(slices: PieSlice[], opts?: { size?: number; title?: string }): string {
  if (typeof document === 'undefined') throw new Error('renderPieChartPng hanya bisa dijalankan di browser (butuh <canvas>).');
  const size = opts?.size ?? 480;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context tidak tersedia di browser ini.');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2 - 10, r = size * 0.30;
  if (slices.length === 0) {
    ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Belum ada data untuk periode ini.', cx, cy);
  } else {
    for (const s of slices) {
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, s.startAngle, s.endAngle); ctx.closePath();
      ctx.fillStyle = s.color; ctx.fill();
    }
    let ly = cy + r + 34;
    ctx.font = '14px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const s of slices) {
      ctx.fillStyle = s.color; ctx.fillRect(cx - r, ly - 7, 14, 14);
      ctx.fillStyle = '#171717'; ctx.fillText(`${s.label} — ${(s.pct * 100).toFixed(1)}%`, cx - r + 20, ly);
      ly += 20;
    }
  }
  if (opts?.title) { ctx.font = '700 16px sans-serif'; ctx.fillStyle = '#171717'; ctx.textAlign = 'center'; ctx.fillText(opts.title, cx, 20); }
  return canvas.toDataURL('image/png');
}
