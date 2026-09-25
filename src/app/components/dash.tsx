import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { HEALTH_STATUSES, type ClientHealthRow, type HealthStatus, type ImpactLevel, type MarginTrendPoint, type StatusCounts, type TrendReading } from '../../core/portfolioHealth';
import { Icon, STATUS_META, type IconName } from './icons';

/** Width of an element in real pixels, so SVG text keeps its true size instead of scaling with a viewBox. */
export function useElementWidth<T extends HTMLElement>(fallback = 300): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => { const next = Math.round(el.getBoundingClientRect().width); if (next > 0) setW(next); };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ───────────────────────── primitives ───────────────────────── */

export function Card({ title, action, children, className = '', style, onOpen, openLabel }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties; onOpen?: () => void; openLabel?: string }) {
  // onOpen makes the whole card a link into the module where that information is worked on.
  const interactive = onOpen ? { role: 'link', tabIndex: 0, 'aria-label': openLabel, className: `tr-card tr-clickable ${className}`, onClick: onOpen, onKeyDown: (e: { key: string; preventDefault: () => void }) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(); } } } : { className: `tr-card ${className}` };
  return (
    <section {...interactive} style={style}>
      {(title || action) && (
        <header className="tr-card-head">
          {title ? <h2>{title}</h2> : <span />}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function LinkAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className="tr-link" onClick={onClick}>
      {children}
      <Icon name="arrow" size={14} />
    </button>
  );
}

export function StatusPill({ tone, children }: { tone: HealthStatus | 'info'; children: ReactNode }) {
  const meta = tone === 'info' ? STATUS_META.nodata : STATUS_META[tone];
  return <span className="tr-pill" style={{ color: meta.color, background: meta.soft }}>{children}</span>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function monthLabel(period: string): string {
  const m = Number(period.slice(5, 7));
  return m >= 1 && m <= 12 ? MONTHS[m - 1] : period;
}

/* ───────────────────────── gauge + tick bar ───────────────────────── */

/** 270° arc gauge with an icon medallion in the middle. */
export function GaugeRing({ value, status, icon = 'alert' }: { value: number | null; status: HealthStatus; icon?: IconName }) {
  const r = 38, c = 2 * Math.PI * r, span = 0.75;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const meta = STATUS_META[status];
  return (
    <div className="tr-gauge" role="img" aria-label={value === null ? 'Skor belum tersedia' : `Skor ${value} dari 100`}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <g transform="rotate(135 50 50)">
          <circle cx="50" cy="50" r={r} fill="none" stroke={meta.soft} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * span} ${c}`} />
          <circle cx="50" cy="50" r={r} fill="none" stroke={meta.color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${c * span * pct} ${c}`} />
        </g>
      </svg>
      <span className="tr-gauge-core" style={{ color: meta.color, background: meta.soft }}>
        <Icon name={icon} size={17} />
      </span>
    </div>
  );
}

/** Vertical-tick progress bar with a knob at the end of the fill. `pct` null renders an empty track. */
export function TickBar({ pct, color }: { pct: number | null; color: string }) {
  const p = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="tr-tick" style={{ ['--tick' as string]: color }} role="img" aria-label={pct === null ? 'Belum ada data' : `${p}%`}>
      <span className="tr-tick-marker" />
      <div className="tr-tick-track" />
      <div className="tr-tick-wash" style={{ width: `${p}%` }} />
      <div className="tr-tick-fill" style={{ width: `${p}%` }} />
      {pct !== null && <span className="tr-tick-knob" style={{ left: `${p}%` }} />}
    </div>
  );
}

export function ScoreCard({ title, score, status, deltaPts, note, onOpen, openLabel }: { title: string; score: number | null; status: HealthStatus; deltaPts: number | null; note: string; onOpen?: () => void; openLabel?: string }) {
  const meta = STATUS_META[status];
  return (
    <Card className="tr-score" onOpen={onOpen} openLabel={openLabel}>
      <div className="tr-score-main">
        <h2>{title}</h2>
        <div className="tr-score-value" style={{ color: score === null ? 'var(--tr-faint)' : meta.color }}>
          {score === null ? '—' : score}
          {score !== null && <small>/100</small>}
        </div>
        <div className="tr-score-status" style={{ color: meta.color }}>{score === null ? 'Data belum cukup' : meta.label}</div>
        <div className="tr-score-delta">
          {deltaPts === null ? (
            <span>{note}</span>
          ) : (
            <>
              <Icon name={deltaPts < 0 ? 'trendDown' : 'trendUp'} size={14} />
              <span style={{ color: deltaPts < 0 ? STATUS_META.critical.color : STATUS_META.healthy.color }}>{deltaPts > 0 ? '+' : ''}{deltaPts.toFixed(1)} pt</span>
              <span>vs periode lalu</span>
            </>
          )}
        </div>
      </div>
      <GaugeRing value={score} status={status} />
    </Card>
  );
}

export function MetricTickCard({ title, icon, iconColor, valueText, unit, pct, color, metaMain, metaSub, onOpen, openLabel }: { onOpen?: () => void; openLabel?: string; title: string; icon: IconName; iconColor: string; valueText: string; unit?: string; pct: number | null; color: string; metaMain: string; metaSub: string }) {
  return (
    <Card className="tr-metric" onOpen={onOpen} openLabel={openLabel}>
      <header className="tr-card-head">
        <h2>{title}</h2>
        <span className="tr-medallion" style={{ color: iconColor, background: `${iconColor}1a` }}><Icon name={icon} size={16} /></span>
      </header>
      <div className="tr-metric-value">{valueText}{unit && <small>{unit}</small>}</div>
      <div className="tr-metric-foot">
        <TickBar pct={pct} color={color} />
        <div className="tr-metric-meta"><strong>{metaMain}</strong><span>{metaSub}</span></div>
      </div>
    </Card>
  );
}

/* ───────────────────────── relief map ───────────────────────── */

interface Cell { id: string; x: number; y: number; w: number; h: number }

/** Squarified treemap: keeps cells close to square so every client stays readable. */
export function squarify(items: Array<{ id: string; value: number }>, box: { x: number; y: number; w: number; h: number }): Cell[] {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!items.length || total <= 0) return [];
  const k = (box.w * box.h) / total;
  const queue = [...items].sort((a, b) => b.value - a.value).map(i => ({ id: i.id, area: i.value * k }));
  const out: Cell[] = [];
  let rect = { ...box };
  let row: typeof queue = [];
  const worst = (r: typeof queue, side: number) => {
    const sum = r.reduce((s, i) => s + i.area, 0);
    const max = Math.max(...r.map(i => i.area)), min = Math.min(...r.map(i => i.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const flush = () => {
    const sum = row.reduce((s, i) => s + i.area, 0);
    if (rect.w >= rect.h) {
      const cw = sum / rect.h; let y = rect.y;
      row.forEach(i => { const h = i.area / cw; out.push({ id: i.id, x: rect.x, y, w: cw, h }); y += h; });
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const rh = sum / rect.w; let x = rect.x;
      row.forEach(i => { const w = i.area / rh; out.push({ id: i.id, x, y: rect.y, w, h: rh }); x += w; });
      rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
    }
    row = [];
  };
  queue.forEach(item => {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, item], side) <= worst(row, side)) row.push(item);
    else { flush(); row.push(item); }
  });
  if (row.length) flush();
  return out;
}

export function HealthMap({ rows, selectedId, onSelect }: { rows: ClientHealthRow[]; selectedId: string; onSelect: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<string>('');
  const W = 720, H = 372, PAD = 8, RIGHT = 52;
  const cells = useMemo(() => {
    const positive = rows.map(r => (r.revenue && r.revenue > 0 ? Math.sqrt(r.revenue) : 0)).filter(v => v > 0).sort((a, b) => a - b);
    const median = positive.length ? positive[Math.floor(positive.length / 2)] : 1;
    return squarify(rows.map(r => ({ id: r.id, value: r.revenue && r.revenue > 0 ? Math.sqrt(r.revenue) : median * 0.7 })), { x: PAD, y: PAD, w: W - PAD * 2 - RIGHT, h: H - PAD * 2 });
  }, [rows]);
  const byId = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  const active = byId.get(hover);
  return (
    <div className="tr-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Peta kesehatan klien. Luas area mengikuti revenue.">
        <defs>
          <filter id="tr-relief" x="-6%" y="-6%" width="112%" height="112%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.007 0.011" numOctaves="2" seed="4" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="38" xChannelSelector="R" yChannelSelector="G" result="shape" />
            <feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="5" seed="11" result="bump" />
            <feDiffuseLighting in="bump" surfaceScale="9" diffuseConstant="1" lightingColor="#ffffff" result="lit">
              <feDistantLight azimuth="225" elevation="58" />
            </feDiffuseLighting>
            <feComponentTransfer in="lit" result="litBright">
              <feFuncR type="linear" slope="1.2" />
              <feFuncG type="linear" slope="1.2" />
              <feFuncB type="linear" slope="1.2" />
            </feComponentTransfer>
            <feComposite in="litBright" in2="shape" operator="in" result="litShape" />
            <feBlend in="shape" in2="litShape" mode="multiply" result="shaded" />
            <feDropShadow in="shaded" dx="0" dy="7" stdDeviation="6" floodColor="#2b2f3a" floodOpacity=".22" />
          </filter>
        </defs>
        <g style={{ transform: `scale(${zoom})`, transformOrigin: '50% 50%', transition: 'transform .25s ease' }}>
          <g filter="url(#tr-relief)">
            {cells.map(c => {
              const row = byId.get(c.id);
              if (!row) return null;
              return <rect key={c.id} x={c.x} y={c.y} width={c.w} height={c.h} fill={STATUS_META[row.status].relief} stroke="rgba(255,255,255,.55)" strokeWidth="1.2" />;
            })}
          </g>
          {cells.map(c => {
            const row = byId.get(c.id);
            if (!row) return null;
            const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
            const selected = selectedId === row.id;
            const roomy = c.w > 118 && c.h > 62;
            return (
              <g key={c.id} className="tr-map-pin" tabIndex={0} role="button" aria-label={`${row.name}: ${row.score === null ? 'data belum cukup' : `skor ${row.score}, ${STATUS_META[row.status].label}`}`} aria-pressed={selected}
                onMouseEnter={() => setHover(row.id)} onMouseLeave={() => setHover('')} onFocus={() => setHover(row.id)} onBlur={() => setHover('')}
                onClick={() => onSelect(selected ? '' : row.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(selected ? '' : row.id); } }}>
                <rect x={c.x + 3} y={c.y + 3} width={Math.max(0, c.w - 6)} height={Math.max(0, c.h - 6)} rx="24" fill="transparent" />
                <circle cx={cx} cy={cy} r={selected ? 9 : 6} fill="#fff" stroke={selected ? '#14141a' : 'rgba(255,255,255,.55)'} strokeWidth={selected ? 2.5 : 5} paintOrder="stroke" />
                {roomy && <text x={cx} y={cy + 24} textAnchor="middle" className="tr-map-label">{row.name.length > 18 ? `${row.name.slice(0, 17)}…` : row.name}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      {active && (
        <div className="tr-map-tip" role="status">
          <strong>{active.name}</strong>
          <span style={{ color: STATUS_META[active.status].color }}>{active.score === null ? 'Data belum cukup' : `Skor ${active.score} · ${STATUS_META[active.status].label}`}</span>
          <span>{active.period ? `Periode ${active.period}` : 'Tanpa periode'}</span>
        </div>
      )}
      <div className="tr-map-controls" aria-label="Kontrol peta">
        <button type="button" aria-label="Perbesar" onClick={() => setZoom(z => Math.min(2.2, +(z + 0.3).toFixed(2)))}><Icon name="plus" size={16} /></button>
        <button type="button" aria-label="Perkecil" onClick={() => setZoom(z => Math.max(1, +(z - 0.3).toFixed(2)))}><Icon name="minus" size={16} /></button>
        <button type="button" aria-label="Kembalikan tampilan" onClick={() => setZoom(1)}><Icon name="locate" size={16} /></button>
      </div>
    </div>
  );
}

export function StatusLegend({ counts, previous }: { counts: StatusCounts; previous: StatusCounts }) {
  const total = HEALTH_STATUSES.reduce((s, k) => s + counts[k], 0);
  const scored = HEALTH_STATUSES.filter(k => k !== 'nodata');
  return (
    <ul className="tr-legend" aria-label="Sebaran status klien">
      {[...scored, 'nodata' as HealthStatus].map(k => {
        const pct = total ? Math.round((counts[k] / total) * 100) : 0;
        const diff = counts[k] - previous[k];
        const hasPrev = scored.reduce((s, x) => s + previous[x], 0) > 0;
        return (
          <li key={k}>
            <i style={{ background: STATUS_META[k].color }} />
            <span>{STATUS_META[k].label}</span>
            <b>{pct}%</b>
            {hasPrev && diff !== 0 && <em style={{ color: (k === 'healthy') === (diff > 0) ? STATUS_META.healthy.color : STATUS_META.critical.color }}>{diff > 0 ? '↑' : '↓'}</em>}
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────────────── dot matrix ───────────────────────── */

/** One dot-column group per client; height = risk exposure (100 − score). */
export function DotMatrix({ rows, selectedId, onSelect }: { rows: ClientHealthRow[]; selectedId: string; onSelect: (id: string) => void }) {
  const scored = rows.filter((r): r is ClientHealthRow & { score: number } => r.score !== null).sort((a, b) => a.score - b.score).slice(0, 20);
  const ROWS = 22, R = 3, STEP = 8.6;
  const perClient = scored.length > 12 ? 1 : scored.length > 8 ? 2 : 3;
  const gap = 1;
  const colsTotal = scored.length * (perClient + gap) - gap;
  const W = Math.max(colsTotal, 1) * STEP + 8, H = ROWS * STEP + 8;
  if (!scored.length) return <div className="tr-empty-chart">Belum ada klien dengan skor untuk ditampilkan.</div>;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tr-dots" role="group" aria-label="Eksposur risiko per klien; kolom lebih tinggi berarti risiko lebih besar">
      {scored.map((r, idx) => {
        const filled = Math.max(1, Math.round(((100 - r.score) / 100) * ROWS));
        const x0 = 4 + idx * (perClient + gap) * STEP;
        const color = STATUS_META[r.status].color;
        const selected = selectedId === r.id;
        return (
          <g key={r.id} tabIndex={0} role="button" aria-label={`${r.name}, skor ${r.score}`} aria-pressed={selected} className="tr-dot-col"
            onClick={() => onSelect(selected ? '' : r.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(selected ? '' : r.id); } }}>
            <title>{`${r.name} · skor ${r.score} · ${STATUS_META[r.status].label}`}</title>
            {Array.from({ length: perClient }).flatMap((_, cx) =>
              Array.from({ length: ROWS }).map((__, ry) => {
                const fromBottom = ROWS - 1 - ry;
                const on = fromBottom < filled;
                return <circle key={`${cx}-${ry}`} cx={x0 + cx * STEP + R} cy={4 + ry * STEP + R} r={R} fill={on ? color : '#d9dbe1'} opacity={on ? 1 : 0.4} />;
              })
            )}
            {selected && <rect x={x0 - 3} y={1} width={perClient * STEP + 3} height={H - 2} rx="6" fill="none" stroke="#14141a" strokeWidth="1.2" />}
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────────────────── margin trend ───────────────────────── */

function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function MarginTrendChart({ points, reading }: { points: MarginTrendPoint[]; reading: TrendReading | null }) {
  const [boxRef, measured] = useElementWidth<HTMLDivElement>(300);
  const valid = points.filter(p => p.marginPct !== null);
  if (valid.length < 2) return <div ref={boxRef} className="tr-empty-chart">Butuh minimal 2 periode dengan Revenue, COGS, Labor, dan OPEX lengkap untuk menampilkan tren.</div>;
  const W = Math.max(240, measured), H = 250, L = 8, Rr = 8, T = 50, B = 26;
  const vals = valid.map(p => p.marginPct as number);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.25, 2);
  const yMin = lo - pad, yMax = hi + pad;
  const slot = (W - L - Rr) / points.length;
  const xOf = (i: number) => L + slot * (i + 0.5);
  const yOf = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * (H - T - B);
  const maxRev = Math.max(...points.map(p => p.revenue ?? 0), 1);
  const line = valid.map(p => [xOf(points.indexOf(p)), yOf(p.marginPct as number)] as [number, number]);
  const windowStart = reading ? points.findIndex(p => p.period === reading.fromPeriod) : -1;
  const tone = reading && reading.deltaPts < 0 ? STATUS_META.critical.color : STATUS_META.healthy.color;
  const anchor = windowStart >= 0 ? line.find(pt => Math.abs(pt[0] - xOf(windowStart)) < 0.5) : undefined;
  const tipW = 150, tipX = anchor ? Math.min(Math.max(anchor[0] - tipW / 2, 4), W - tipW - 4) : 0;
  return (
    <div ref={boxRef}>
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="tr-trend" role="img" aria-label={reading ? `Margin ${reading.deltaPts < 0 ? 'turun' : 'naik'} ${Math.abs(reading.deltaPts)} poin dalam ${reading.periods} periode` : 'Tren operating margin'}>
      <defs>
        <pattern id="tr-hatch" width="3" height="4" patternUnits="userSpaceOnUse"><rect width="1.2" height="4" fill="#c9ccd4" /></pattern>
        <pattern id="tr-hatch-hot" width="3" height="4" patternUnits="userSpaceOnUse"><rect width="1.2" height="4" fill={tone} /></pattern>
      </defs>
      {points.map((p, i) => {
        if (p.revenue === null) return null;
        const h = (p.revenue / maxRev) * (H - T - B - 6);
        const hot = reading && i >= windowStart && windowStart >= 0;
        return <rect key={p.period} x={xOf(i) - Math.min(slot * 0.28, 16)} y={H - B - h} width={Math.min(slot * 0.56, 32)} height={h} fill={hot ? 'url(#tr-hatch-hot)' : 'url(#tr-hatch)'} opacity={hot ? 0.9 : 0.85}>
          <title>{`${p.period} · revenue portofolio (${p.clients} klien)`}</title>
        </rect>;
      })}
      <path d={smoothPath(line)} fill="none" stroke={tone} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {line.map((pt, i) => {
        const p = valid[i];
        return <circle key={p.period} cx={pt[0]} cy={pt[1]} r="9" fill="transparent"><title>{`${p.period} · margin ${p.marginPct}% · ${p.clients} klien`}</title></circle>;
      })}
      {points.map((p, i) => (slot >= 26 || i % 2 === (points.length - 1) % 2) ? <text key={p.period} x={xOf(i)} y={H - 8} textAnchor="middle" className="tr-axis">{monthLabel(p.period)}</text> : null)}
      {anchor && reading && (
        <g>
          <circle cx={anchor[0]} cy={anchor[1]} r="10" fill={tone} opacity=".14" />
          <circle cx={anchor[0]} cy={anchor[1]} r="4.4" fill="#fff" stroke={tone} strokeWidth="2.4" />
          <g transform={`translate(${tipX} 4)`}>
            <rect width={tipW} height="36" rx="10" fill="#fff" stroke="rgba(20,20,40,.06)" />
            <circle cx="12" cy="14" r="3" fill={tone} /><text x="21" y="17.5" className="tr-tip">{`Margin ${reading.deltaPts > 0 ? '+' : '−'}${Math.abs(reading.deltaPts).toFixed(1)} pt`}</text>
            <circle cx="12" cy="27" r="3" fill="#c9ccd4" /><text x="21" y="30.5" className="tr-tip tr-tip-sub">{`${reading.periods} periode terakhir`}</text>
          </g>
        </g>
      )}
    </svg>
    </div>
  );
}

/* ───────────────────────── insight orb ───────────────────────── */

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Decorative orb. Segment sizes follow the real status mix so it is not just wallpaper. */
export function InsightOrb({ counts }: { counts: StatusCounts }) {
  const dots = useMemo(() => {
    const rnd = seeded(20260921);
    const palette = ['#e5344f', '#f08a24', '#e0a81f', '#1f9d55', '#1fb5c8'];
    return Array.from({ length: 150 }).map((_, i) => {
      const a = rnd() * Math.PI * 2;
      const r = 92 + rnd() * 34;
      return { x: 150 + Math.cos(a) * r, y: 150 + Math.sin(a) * r, r: 0.6 + rnd() * 1.5, c: palette[i % palette.length], o: 0.25 + rnd() * 0.6 };
    });
  }, []);
  const total = HEALTH_STATUSES.reduce((s, k) => s + counts[k], 0);
  const w = (k: HealthStatus) => (total ? 0.6 + (counts[k] / total) * 0.6 : 0.75);
  return (
    <svg viewBox="0 0 300 300" className="tr-orb" role="img" aria-label="Ilustrasi sebaran status klien">
      <defs>
        <radialGradient id="o-red" cx="30%" cy="28%" r="70%"><stop offset="0" stopColor="#ff5a4d" stopOpacity={Math.min(1, w('critical'))} /><stop offset="1" stopColor="#ff5a4d" stopOpacity="0" /></radialGradient>
        <radialGradient id="o-orange" cx="72%" cy="26%" r="65%"><stop offset="0" stopColor="#ffb02e" stopOpacity={Math.min(1, w('high'))} /><stop offset="1" stopColor="#ffb02e" stopOpacity="0" /></radialGradient>
        <radialGradient id="o-green" cx="26%" cy="72%" r="65%"><stop offset="0" stopColor="#5bd17a" stopOpacity={Math.min(1, w('healthy'))} /><stop offset="1" stopColor="#5bd17a" stopOpacity="0" /></radialGradient>
        <radialGradient id="o-cyan" cx="72%" cy="74%" r="70%"><stop offset="0" stopColor="#35c9e6" stopOpacity={Math.min(1, w('moderate') + 0.1)} /><stop offset="1" stopColor="#35c9e6" stopOpacity="0" /></radialGradient>
        <radialGradient id="o-sphere" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" stopOpacity=".96" /><stop offset=".55" stopColor="#f4f4f6" stopOpacity=".7" /><stop offset="1" stopColor="#dcdde3" stopOpacity=".35" /></radialGradient>
        <clipPath id="o-clip"><circle cx="150" cy="150" r="66" /></clipPath>
      </defs>
      <g className="tr-orb-spin">
        {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o} />)}
        {[136, 128, 120, 112].map((r, i) => <circle key={r} cx="150" cy="150" r={r} fill="none" stroke="#c8cad2" strokeWidth=".6" opacity={0.85 - i * 0.18} />)}
      </g>
      <g clipPath="url(#o-clip)">
        <rect x="80" y="80" width="140" height="140" fill="#fff" />
        <rect x="80" y="80" width="140" height="140" fill="url(#o-red)" />
        <rect x="80" y="80" width="140" height="140" fill="url(#o-orange)" />
        <rect x="80" y="80" width="140" height="140" fill="url(#o-green)" />
        <rect x="80" y="80" width="140" height="140" fill="url(#o-cyan)" />
      </g>
      <circle cx="150" cy="150" r="66" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.5" />
      <circle cx="150" cy="150" r="34" fill="url(#o-sphere)" stroke="#c8cad2" strokeWidth=".6" />
      <circle cx="150" cy="150" r="15" fill="#fff" opacity=".6" />
      <path d="M150 12 156 22h-12ZM288 150l-10-6v12ZM150 288l-6-10h12ZM12 150l10 6v-12Z" fill="#e5344f" opacity=".85" />
    </svg>
  );
}

const IMPACT_TEXT: Record<ImpactLevel, { label: string; color: string }> = {
  high: { label: 'Tinggi', color: STATUS_META.critical.color },
  medium: { label: 'Sedang', color: STATUS_META.high.color },
  low: { label: 'Rendah', color: STATUS_META.healthy.color },
  unknown: { label: '—', color: 'var(--tr-faint)' }
};
export function impactText(level: ImpactLevel) { return IMPACT_TEXT[level]; }
