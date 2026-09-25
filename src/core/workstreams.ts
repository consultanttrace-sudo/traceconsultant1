/**
 * Jalur kerja per klien — mengikuti kondisi klien, bukan template tetap.
 * Setiap jalur (workstream) menyala hanya bila ada bukti dari data; area yang tidak punya data
 * otomatis (branding, feed, konten, ERP) ditandai "perlu asesmen manual", bukan ditebak.
 */
import { summarizeFinance, type FinanceRecord } from './finance.js';
import { HEALTH_TARGETS, periodsOf, type ClientHealthRow } from './portfolioHealth.js';

export type WorkstreamGroup = 'Keuangan' | 'Operasional' | 'Pertumbuhan';
export type WorkstreamKey = 'pembukuan' | 'foodcost' | 'profit' | 'opex' | 'labor' | 'inventory' | 'erp' | 'growth' | 'branding' | 'social';

/** `module` = id menu di main.tsx tempat pekerjaan jalur ini dikerjakan (dicek oleh test_shell_navigation). */
export interface WorkstreamDef { key: WorkstreamKey; label: string; group: WorkstreamGroup; auto: boolean; manualHint: string; module: string; moduleLabel: string }

export const WORKSTREAMS: WorkstreamDef[] = [
  { key: 'pembukuan', label: 'Pembukuan & Akuntansi', group: 'Keuangan', auto: true, manualHint: '', module: 'finance', moduleLabel: 'Keuangan' },
  { key: 'foodcost', label: 'Food Cost / COGS', group: 'Keuangan', auto: true, manualHint: '', module: 'recipecogs', moduleLabel: 'Recipe COGS' },
  { key: 'profit', label: 'Profitabilitas & Kebocoran Cashflow', group: 'Keuangan', auto: true, manualHint: '', module: 'cashflow', moduleLabel: 'Arus Kas' },
  { key: 'opex', label: 'OPEX', group: 'Keuangan', auto: true, manualHint: '', module: 'opex', moduleLabel: 'OPEX Detail' },
  { key: 'labor', label: 'Labor & Sistem Operasional', group: 'Operasional', auto: true, manualHint: '', module: 'payroll', moduleLabel: 'Payroll' },
  { key: 'inventory', label: 'Inventory & Purchasing', group: 'Operasional', auto: false, manualHint: 'Cek selisih stok, pembelian, dan pemakaian bahan langsung di outlet.', module: 'inventory', moduleLabel: 'Inventory & Recipe' },
  { key: 'erp', label: 'ERP / POS Integration', group: 'Operasional', auto: false, manualHint: 'Cek apakah POS terhubung dan data penjualan masuk rutin.', module: 'intake', moduleLabel: 'Data Intake' },
  { key: 'growth', label: 'Revenue & Growth (pelanggan)', group: 'Pertumbuhan', auto: true, manualHint: '', module: 'sales', moduleLabel: 'Penjualan & Dashboard' },
  { key: 'branding', label: 'Branding', group: 'Pertumbuhan', auto: false, manualHint: 'Nilai identitas brand, positioning, dan seberapa dikenal di area.', module: 'marketing', moduleLabel: 'Marketing' },
  { key: 'social', label: 'Media Sosial & Konten', group: 'Pertumbuhan', auto: false, manualHint: 'Nilai feed (rapi/tidak), konsistensi konten, dan daya tarik.', module: 'marketing', moduleLabel: 'Marketing' }
];

/** Ambang yang dipakai selain target di businessHealth.ts. Ditulis eksplisit supaya bisa dikoreksi. */
export const WORKSTREAM_THRESHOLDS = { weakMarginPct: 10, revenueDropPct: 10, revenueDropPeriods: 3 } as const;

export type FindingStatus = 'flagged' | 'ok' | 'nodata' | 'manual';
export interface WorkstreamFinding {
  key: WorkstreamKey;
  label: string;
  group: WorkstreamGroup;
  status: FindingStatus;
  severity: 'high' | 'medium' | 'low' | null;
  reason: string;
  module: string;
  moduleLabel: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function revenueChange(records: FinanceRecord[]): { changePct: number; periods: number } | null {
  const revs = periodsOf(records).map(p => summarizeFinance(records, p).revenue).filter((v): v is number => v !== null && v > 0);
  const n = WORKSTREAM_THRESHOLDS.revenueDropPeriods;
  if (revs.length < n) return null;
  const tail = revs.slice(-n);
  return { changePct: r1(((tail[tail.length - 1] - tail[0]) / tail[0]) * 100), periods: n };
}

/**
 * Sinyal otomatis dari data operasional (dihitung oleh `workstreamSignals.ts`, fungsi murni).
 * `inventory`/`erp`/`social` menggantikan status "perlu asesmen manual" bila datanya ada;
 * `cash` (AR/AP) memperkuat jalur `profit` (Profitabilitas & Kebocoran Cashflow).
 * Hasil `nodata` TIDAK pernah dianggap sehat: jalur tetap "manual" dengan alasan kenapa datanya belum cukup.
 */
export type SignalKey = 'inventory' | 'erp' | 'social' | 'cash';
export interface SignalResult { status: 'flagged' | 'ok' | 'nodata'; severity: 'high' | 'medium' | 'low' | null; reason: string }
export type WorkstreamSignals = Partial<Record<SignalKey, SignalResult>>;

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 } as const;
const worseSeverity = (a: WorkstreamFinding['severity'], b: WorkstreamFinding['severity']): WorkstreamFinding['severity'] =>
  (a ? SEVERITY_RANK[a] : 0) >= (b ? SEVERITY_RANK[b] : 0) ? a : b;

export function diagnoseClient(row: ClientHealthRow, records: FinanceRecord[], signals: WorkstreamSignals = {}): WorkstreamFinding[] {
  const out: WorkstreamFinding[] = [];
  const add = (key: WorkstreamKey, status: FindingStatus, severity: WorkstreamFinding['severity'], reason: string) => {
    const def = WORKSTREAMS.find(w => w.key === key)!;
    out.push({ key, label: def.label, group: def.group, status, severity, reason, module: def.module, moduleLabel: def.moduleLabel });
  };
  const hasPeriod = row.period !== null;

  // Pembukuan: tanpa data yang lengkap, jalur lain tidak bisa dinilai — ini biasanya jalur pertama.
  if (row.loadError) add('pembukuan', 'nodata', null, `Data tidak dapat dimuat: ${row.loadError}`);
  else if (!hasPeriod) add('pembukuan', 'flagged', 'high', 'Belum ada data finance untuk periode ini.');
  else if (row.missing.length) add('pembukuan', 'flagged', row.missing.length >= 3 ? 'high' : 'medium', `Data belum lengkap: ${row.missing.join(', ')}.`);
  else add('pembukuan', 'ok', null, 'Revenue, COGS, Labor, dan OPEX lengkap.');

  const judge = (key: WorkstreamKey, value: number | null, target: number, label: string, unit = '% dari revenue') => {
    if (value === null) return add(key, 'nodata', null, `${label} belum ada datanya.`);
    if (value > target) {
      const over = value - target;
      return add(key, 'flagged', over >= 10 ? 'high' : over >= 4 ? 'medium' : 'low', `${label} ${r1(value)}${unit}, target ≤${target}%.`);
    }
    return add(key, 'ok', null, `${label} ${r1(value)}${unit}, dalam target.`);
  };
  judge('foodcost', row.cogsPct, HEALTH_TARGETS.cogsPct, 'COGS');
  judge('opex', row.opexPct, HEALTH_TARGETS.opexPct, 'OPEX');
  judge('labor', row.laborPct, HEALTH_TARGETS.laborPct, 'Labor');

  const m = row.operatingMarginPct;
  if (m === null) add('profit', 'nodata', null, 'Operating margin belum bisa dihitung.');
  else if (m < 0) add('profit', 'flagged', 'high', `Operating profit negatif (margin ${r1(m)}%).`);
  else if (m < WORKSTREAM_THRESHOLDS.weakMarginPct) add('profit', 'flagged', 'medium', `Margin tipis (${r1(m)}%, di bawah ${WORKSTREAM_THRESHOLDS.weakMarginPct}%).`);
  else add('profit', 'ok', null, `Operating margin ${r1(m)}%.`);

  const rc = revenueChange(records);
  if (!rc) add('growth', 'nodata', null, `Butuh ${WORKSTREAM_THRESHOLDS.revenueDropPeriods} periode revenue untuk membaca tren.`);
  else if (rc.changePct <= -WORKSTREAM_THRESHOLDS.revenueDropPct) add('growth', 'flagged', rc.changePct <= -25 ? 'high' : 'medium', `Revenue turun ${Math.abs(rc.changePct)}% dalam ${rc.periods} periode.`);
  else add('growth', 'ok', null, `Revenue ${rc.changePct >= 0 ? 'naik' : 'turun'} ${Math.abs(rc.changePct)}% dalam ${rc.periods} periode.`);

  // AR/AP nyata memperkuat jalur profit: hanya bisa menaikkan status ke "menyala" atau menambah alasan,
  // tidak pernah mengubah "belum ada data margin" menjadi "sehat".
  const cash = signals.cash;
  const profit = out.find(f => f.key === 'profit');
  if (cash && profit && cash.status !== 'nodata') {
    if (cash.status === 'flagged') {
      const previous = profit.status === 'flagged' ? profit.severity : null;
      profit.status = 'flagged';
      profit.severity = worseSeverity(previous, cash.severity ?? 'low') ?? 'low';
    }
    profit.reason = `${profit.reason} ${cash.reason}`;
  }

  WORKSTREAMS.filter(w => !w.auto).forEach(w => {
    const sig = signals[w.key as SignalKey];
    if (!sig) return add(w.key, 'manual', null, w.manualHint);
    // Tanpa data otomatis → tetap jalur "manual" (tugas asesmen langsung tetap bisa dibuat), tapi alasannya jujur.
    if (sig.status === 'nodata') return add(w.key, 'manual', null, `${sig.reason} ${w.manualHint}`);
    if (sig.status === 'ok') return add(w.key, 'ok', null, sig.reason);
    add(w.key, 'flagged', sig.severity ?? 'low', sig.reason);
  });
  return out;
}

export type PlanMode = 'total' | 'fokus' | 'stabil' | 'belum';
export interface WorkPlanSummary { mode: PlanMode; flagged: WorkstreamFinding[]; manual: WorkstreamFinding[]; label: string }

/** ≥4 jalur otomatis menyala = kerja total; 1–3 = fokus pada jalur itu; 0 = stabil; tanpa data terukur = belum bisa dinilai. */
export function summarizePlan(findings: WorkstreamFinding[]): WorkPlanSummary {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const flagged = findings.filter(f => f.status === 'flagged').sort((a, b) => rank[a.severity ?? 'low'] - rank[b.severity ?? 'low']);
  const measurable = findings.some(f => f.status === 'ok' || f.status === 'flagged');
  const manual = findings.filter(f => f.status === 'manual');
  // Tanpa data finance yang bisa dibaca, sinyal operasional saja tidak cukup untuk menyatakan klien "stabil".
  const financeUnknown = findings.find(f => f.key === 'pembukuan')?.status === 'nodata';
  if (!measurable || (flagged.length === 0 && financeUnknown)) return { mode: 'belum', flagged, manual, label: 'Belum bisa dinilai — lengkapi data dulu' };
  if (flagged.length >= 4) return { mode: 'total', flagged, manual, label: `Kerja total · ${flagged.length} jalur` };
  if (flagged.length >= 1) return { mode: 'fokus', flagged, manual, label: `Fokus · ${flagged.length} jalur` };
  return { mode: 'stabil', flagged, manual, label: 'Stabil pada data yang ada' };
}

/** Berapa hari sampai due date, dari tanggal referensi (bukan Date.now() langsung, supaya bisa dites). Severity lebih tinggi = tenggat lebih dekat. */
const DUE_DAYS: Record<'high' | 'medium' | 'low' | 'manual', number> = { high: 3, medium: 7, low: 14, manual: 14 };
/** P0/P1/P2/P3 dipakai trace_collaboration_tasks.priority (lihat migrations/011). */
const PRIORITY_BY_SEVERITY: Record<'high' | 'medium' | 'low' | 'manual', 'P0' | 'P1' | 'P2' | 'P3'> = { high: 'P1', medium: 'P2', low: 'P3', manual: 'P2' };

export interface WorkstreamTaskDraft { title: string; priority: 'P0' | 'P1' | 'P2' | 'P3'; dueDateIso: string; evidenceNote: string; workstreamKey: WorkstreamKey; module: string; moduleLabel: string }

/**
 * Ubah satu temuan jalur kerja (yang menyala, atau area yang perlu asesmen manual) menjadi draf tugas nyata
 * (owner diisi oleh pemanggil dari sesi login; due date & evidence sudah ditentukan di sini dari data/kondisi).
 * Fungsi murni: `nowIso` diteruskan oleh pemanggil supaya hasilnya deterministik dan bisa dites.
 */
export function taskDraftFromFinding(finding: WorkstreamFinding, nowIso: string): WorkstreamTaskDraft | null {
  if (finding.status !== 'flagged' && finding.status !== 'manual') return null;
  const bucket = finding.status === 'manual' ? 'manual' : (finding.severity ?? 'low');
  const days = DUE_DAYS[bucket];
  const due = new Date(nowIso);
  due.setUTCDate(due.getUTCDate() + days);
  const title = finding.status === 'manual' ? `Asesmen langsung: ${finding.label}` : finding.label;
  return {
    title,
    priority: PRIORITY_BY_SEVERITY[bucket],
    dueDateIso: due.toISOString(),
    evidenceNote: `jalur:${finding.key} — ${finding.reason}`,
    workstreamKey: finding.key,
    module: finding.module,
    moduleLabel: finding.moduleLabel
  };
}

export interface WorkstreamRollup { key: WorkstreamKey; label: string; group: WorkstreamGroup; module: string; moduleLabel: string; clients: Array<{ id: string; name: string; reason: string }> }

/** Berapa klien yang membutuhkan tiap jalur (hanya jalur yang menyala di ≥1 klien). */
export function rollupWorkstreams(perClient: Array<{ id: string; name: string; findings: WorkstreamFinding[] }>): WorkstreamRollup[] {
  const map = new Map<WorkstreamKey, WorkstreamRollup>();
  perClient.forEach(c => c.findings.filter(f => f.status === 'flagged').forEach(f => {
    const cur = map.get(f.key) ?? { key: f.key, label: f.label, group: f.group, module: f.module, moduleLabel: f.moduleLabel, clients: [] };
    cur.clients.push({ id: c.id, name: c.name, reason: f.reason });
    map.set(f.key, cur);
  }));
  return [...map.values()].sort((a, b) => b.clients.length - a.clients.length);
}
