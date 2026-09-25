/**
 * Portfolio health model for the Overview dashboard.
 *
 * Everything here is derived from real finance records + persisted alerts that
 * the caller loaded per client (the API never mixes clients in one response).
 * Nothing is invented: a missing value stays null, a client without enough
 * evidence is status "nodata" and is excluded from averages instead of being
 * counted as 0.
 */
import { summarizeFinance, type FinanceRecord, type FinanceSummary } from './finance.js';
import { buildBusinessHealth } from './businessHealth.js';
import type { EvidenceItem } from './evidence.js';

export type HealthStatus = 'healthy' | 'moderate' | 'high' | 'critical' | 'nodata';
export const HEALTH_STATUSES: HealthStatus[] = ['healthy', 'moderate', 'high', 'critical', 'nodata'];
/** Same targets that businessHealth.ts scores against. */
export const HEALTH_TARGETS = { cogsPct: 35, laborPct: 20, opexPct: 15 } as const;

export function healthStatus(score: number | null): HealthStatus {
  if (score === null || !Number.isFinite(score)) return 'nodata';
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'moderate';
  if (score >= 40) return 'high';
  return 'critical';
}

export interface PortfolioAlertInput {
  id: string;
  severity: string;
  title: string;
  status: string;
  createdAt?: string | null;
}

export interface PortfolioClientInput {
  id: string;
  name: string;
  records: FinanceRecord[];
  alerts: PortfolioAlertInput[];
  /** Set when this client's data could not be loaded; the client is shown as "nodata". */
  loadError?: string | null;
}

export type DriverKind = 'margin' | 'cogs' | 'labor' | 'opex' | 'missing' | 'alert' | 'loaderror';

export interface ClientDriver {
  kind: DriverKind;
  title: string;
  detail: string;
  /** Short text for the pill in the priority list. */
  short: string;
  /** Higher = worse; used to order the priority list. */
  weight: number;
}

export interface ClientHealthRow {
  id: string;
  name: string;
  period: string | null;
  previousPeriod: string | null;
  score: number | null;
  previousScore: number | null;
  status: HealthStatus;
  previousStatus: HealthStatus;
  confidencePct: number | null;
  revenue: number | null;
  operatingProfit: number | null;
  operatingMarginPct: number | null;
  cogsPct: number | null;
  laborPct: number | null;
  opexPct: number | null;
  missing: string[];
  openAlerts: number;
  severeAlerts: number;
  drivers: ClientDriver[];
  loadError: string | null;
}

const isOpen = (s: string) => s === 'OPEN' || s === 'ACKNOWLEDGED';
const isSevere = (s: string) => s === 'HIGH' || s === 'CRITICAL';
const round1 = (n: number) => Math.round(n * 10) / 10;

export function periodsOf(records: FinanceRecord[]): string[] {
  return [...new Set(records.filter(r => Number.isFinite(r.amount)).map(r => r.period))].sort();
}

function scoreFor(summary: FinanceSummary): { score: number | null; confidencePct: number | null } {
  if (!summary.recordCount) return { score: null, confidencePct: null };
  // The Overview only loads finance. POS and inventory evidence are declared unavailable (not loaded here)
  // so "confidence" reflects the real evidence coverage instead of claiming 100% from finance alone.
  const evidence: EvidenceItem[] = [
    { id: 'finance', metric: 'Financial data', status: 'available', value: summary.operatingProfit, period: summary.period, source: 'Supabase trace_finance_records' },
    { id: 'pos', metric: 'POS events', status: 'unavailable', notes: 'Tidak dimuat di Overview; buka Business Health per klien.' },
    { id: 'inventory', metric: 'Inventory movements', status: 'unavailable', notes: 'Tidak dimuat di Overview; buka Business Health per klien.' }
  ];
  const health = buildBusinessHealth({ finance: summary, evidence });
  return { score: health.score === null ? null : Math.round(health.score), confidencePct: health.confidencePct === null ? null : Math.round(health.confidencePct) };
}

function driversFor(s: FinanceSummary, alerts: PortfolioAlertInput[], loadError: string | null): ClientDriver[] {
  const out: ClientDriver[] = [];
  if (loadError) {
    out.push({ kind: 'loaderror', title: 'Data klien tidak dapat dimuat', detail: loadError, short: 'Gagal memuat', weight: 5 });
    return out;
  }
  if (s.operatingMarginPct !== null && s.operatingMarginPct < 0) {
    out.push({ kind: 'margin', title: 'Operating profit negatif', detail: `Margin ${round1(s.operatingMarginPct)}%`, short: `${round1(s.operatingMarginPct)}% margin`, weight: 100 + Math.abs(s.operatingMarginPct) });
  }
  const over = (kind: 'cogs' | 'labor' | 'opex', value: number | null, target: number, label: string) => {
    if (value !== null && value > target) {
      out.push({ kind, title: `${label} di atas target`, detail: `${round1(value)}% dari revenue · target ≤${target}%`, short: `${round1(value)}% · target ≤${target}%`, weight: 50 + (value - target) });
    }
  };
  over('cogs', s.cogsPct, HEALTH_TARGETS.cogsPct, 'COGS');
  over('labor', s.laborPct, HEALTH_TARGETS.laborPct, 'Labor');
  over('opex', s.opexPct, HEALTH_TARGETS.opexPct, 'OPEX');
  const severe = alerts.filter(a => isOpen(a.status) && isSevere(a.severity));
  if (severe.length) {
    out.push({ kind: 'alert', title: severe[0].title, detail: `${severe.length} alert ${severe.length > 1 ? 'tinggi/kritis' : severe[0].severity.toLowerCase()} masih terbuka`, short: `${severe.length} terbuka`, weight: 80 + severe.length });
  }
  if (s.recordCount && s.missingMetrics.length) {
    out.push({ kind: 'missing', title: 'Data finance belum lengkap', detail: `Belum ada: ${s.missingMetrics.join(', ')}`, short: `Butuh ${s.missingMetrics.join(', ')}`, weight: 20 + s.missingMetrics.length });
  }
  return out.sort((a, b) => b.weight - a.weight);
}

/** `period` = fixed period for every client; null = each client's own latest period. */
export function buildClientHealth(client: PortfolioClientInput, period: string | null = null): ClientHealthRow {
  const periods = periodsOf(client.records);
  const effective = period ?? periods.at(-1) ?? null;
  const idx = effective ? periods.indexOf(effective) : -1;
  const previousPeriod = idx > 0 ? periods[idx - 1] : null;
  const summary = summarizeFinance(client.records, effective ?? '');
  const current = effective && client.records.some(r => r.period === effective) ? scoreFor(summary) : { score: null, confidencePct: null };
  const previous = previousPeriod ? scoreFor(summarizeFinance(client.records, previousPeriod)) : { score: null, confidencePct: null };
  const hasPeriodData = !!effective && summary.recordCount > 0;
  const openAlerts = client.alerts.filter(a => isOpen(a.status));
  return {
    id: client.id,
    name: client.name,
    period: hasPeriodData ? effective : null,
    previousPeriod,
    score: current.score,
    previousScore: previous.score,
    status: healthStatus(current.score),
    previousStatus: healthStatus(previous.score),
    confidencePct: current.confidencePct,
    revenue: hasPeriodData ? summary.revenue : null,
    operatingProfit: hasPeriodData ? summary.operatingProfit : null,
    operatingMarginPct: hasPeriodData ? summary.operatingMarginPct : null,
    cogsPct: hasPeriodData ? summary.cogsPct : null,
    laborPct: hasPeriodData ? summary.laborPct : null,
    opexPct: hasPeriodData ? summary.opexPct : null,
    missing: hasPeriodData ? summary.missingMetrics : ['Revenue', 'COGS', 'Labor', 'OPEX'],
    openAlerts: openAlerts.length,
    severeAlerts: openAlerts.filter(a => isSevere(a.severity)).length,
    drivers: hasPeriodData
      ? driversFor(summary, client.alerts, null)
      : client.loadError
        ? driversFor(summary, client.alerts, client.loadError)
        : [{ kind: 'missing' as const, title: 'Belum ada data finance', detail: effective && periods.length ? `Tidak ada data untuk periode ${effective}` : 'Isi Revenue, COGS, Labor, dan OPEX', short: 'Belum ada data', weight: 10 }],
    loadError: client.loadError ?? null
  };
}

export type StatusCounts = Record<HealthStatus, number>;
const emptyCounts = (): StatusCounts => ({ healthy: 0, moderate: 0, high: 0, critical: 0, nodata: 0 });

export interface PortfolioSummary {
  rows: ClientHealthRow[];
  scoredCount: number;
  averageScore: number | null;
  previousAverageScore: number | null;
  /** Points of change vs previous period; only when the same clients have both scores. */
  scoreDelta: number | null;
  averageConfidencePct: number | null;
  counts: StatusCounts;
  previousCounts: StatusCounts;
  atRiskCount: number;
  atRiskPct: number | null;
  complete: number;
  coveragePct: number | null;
  openAlerts: number;
  severeAlerts: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarizePortfolio(rows: ClientHealthRow[]): PortfolioSummary {
  const scored = rows.filter(r => r.score !== null);
  const counts = emptyCounts();
  const previousCounts = emptyCounts();
  rows.forEach(r => { counts[r.status] += 1; previousCounts[r.previousStatus] += 1; });
  const pairs = scored.filter(r => r.previousScore !== null);
  const currentPair = avg(pairs.map(r => r.score as number));
  const previousPair = avg(pairs.map(r => r.previousScore as number));
  const atRisk = counts.high + counts.critical;
  const complete = rows.filter(r => r.period !== null && r.missing.length === 0).length;
  const confidences = scored.map(r => r.confidencePct).filter((v): v is number => v !== null);
  const averageScore = avg(scored.map(r => r.score as number));
  return {
    rows,
    scoredCount: scored.length,
    averageScore: averageScore === null ? null : Math.round(averageScore),
    previousAverageScore: avg(scored.map(r => r.previousScore).filter((v): v is number => v !== null)),
    scoreDelta: currentPair !== null && previousPair !== null ? round1(currentPair - previousPair) : null,
    averageConfidencePct: avg(confidences) === null ? null : Math.round(avg(confidences) as number),
    counts,
    previousCounts,
    atRiskCount: atRisk,
    atRiskPct: scored.length ? Math.round((atRisk / scored.length) * 100) : null,
    complete,
    coveragePct: rows.length ? Math.round((complete / rows.length) * 100) : null,
    openAlerts: rows.reduce((s, r) => s + r.openAlerts, 0),
    severeAlerts: rows.reduce((s, r) => s + r.severeAlerts, 0)
  };
}

export interface MarginTrendPoint {
  period: string;
  marginPct: number | null;
  revenue: number | null;
  /** Clients that contributed (had revenue + all cost categories that period). */
  clients: number;
  cogsPct: number | null;
  laborPct: number | null;
  opexPct: number | null;
}

/** Portfolio margin per period = Σ operating profit / Σ revenue over clients that have complete data that period. */
export function buildMarginTrend(clients: PortfolioClientInput[], months: number): MarginTrendPoint[] {
  const all = [...new Set(clients.flatMap(c => periodsOf(c.records)))].sort();
  const windowed = months > 0 ? all.slice(-months) : all;
  return windowed.map(period => {
    let revenue = 0, profit = 0, cogs = 0, labor = 0, opex = 0, n = 0;
    clients.forEach(c => {
      const s = summarizeFinance(c.records, period);
      if (s.revenue !== null && s.revenue > 0 && s.operatingProfit !== null && s.cogs !== null && s.labor !== null && s.opex !== null) {
        revenue += s.revenue; profit += s.operatingProfit; cogs += s.cogs; labor += s.labor; opex += s.opex; n += 1;
      }
    });
    return {
      period,
      marginPct: n ? round1((profit / revenue) * 100) : null,
      revenue: n ? revenue : null,
      clients: n,
      cogsPct: n ? round1((cogs / revenue) * 100) : null,
      laborPct: n ? round1((labor / revenue) * 100) : null,
      opexPct: n ? round1((opex / revenue) * 100) : null
    };
  });
}

export interface TrendReading {
  fromPeriod: string;
  toPeriod: string;
  deltaPts: number;
  periods: number;
  /** Cost line that moved the most against the margin, when it can be identified. */
  driver: 'COGS' | 'Labor' | 'OPEX' | null;
  driverDeltaPts: number | null;
}

/** Reads the last `span` periods (default 3) that have a margin value. */
export function readTrend(points: MarginTrendPoint[], span = 3): TrendReading | null {
  const valid = points.filter(p => p.marginPct !== null);
  if (valid.length < 2) return null;
  const tail = valid.slice(-Math.min(span, valid.length));
  const first = tail[0], last = tail[tail.length - 1];
  const deltaPts = round1((last.marginPct as number) - (first.marginPct as number));
  const moves: Array<['COGS' | 'Labor' | 'OPEX', number]> = [];
  if (first.cogsPct !== null && last.cogsPct !== null) moves.push(['COGS', round1(last.cogsPct - first.cogsPct)]);
  if (first.laborPct !== null && last.laborPct !== null) moves.push(['Labor', round1(last.laborPct - first.laborPct)]);
  if (first.opexPct !== null && last.opexPct !== null) moves.push(['OPEX', round1(last.opexPct - first.opexPct)]);
  // The cost that moved in the direction that explains the margin change.
  const explaining = moves.filter(([, d]) => (deltaPts < 0 ? d > 0 : d < 0)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return {
    fromPeriod: first.period, toPeriod: last.period, deltaPts, periods: tail.length,
    driver: explaining.length && Math.abs(explaining[0][1]) >= 0.1 ? explaining[0][0] : null,
    driverDeltaPts: explaining.length ? explaining[0][1] : null
  };
}

export type ImpactLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface PortfolioInsight {
  headline: string;
  detail: string;
  impact: ImpactLevel;
  confidencePct: number | null;
}

export function buildInsight(summary: PortfolioSummary): PortfolioInsight {
  const scored = summary.rows.filter(r => r.score !== null);
  if (!scored.length) {
    return {
      headline: summary.rows.length ? 'Belum ada klien dengan data finance yang cukup untuk dinilai.' : 'Belum ada klien terdaftar.',
      detail: summary.rows.length ? 'Lengkapi Revenue, COGS, Labor, dan OPEX agar skor bisa dihitung.' : 'Tambahkan klien lalu isi data finance-nya.',
      impact: 'unknown',
      confidencePct: null
    };
  }
  const tally: Array<[string, number]> = [
    ['Operating profit negatif', scored.filter(r => r.operatingMarginPct !== null && r.operatingMarginPct < 0).length],
    ['COGS di atas target', scored.filter(r => r.cogsPct !== null && r.cogsPct > HEALTH_TARGETS.cogsPct).length],
    ['Labor di atas target', scored.filter(r => r.laborPct !== null && r.laborPct > HEALTH_TARGETS.laborPct).length],
    ['OPEX di atas target', scored.filter(r => r.opexPct !== null && r.opexPct > HEALTH_TARGETS.opexPct).length]
  ];
  const top = [...tally].sort((a, b) => b[1] - a[1])[0];
  const byStatus: ImpactLevel = summary.counts.critical > 0 || (summary.atRiskPct ?? 0) >= 25 ? 'high' : summary.counts.high > 0 ? 'medium' : 'low';
  const share = top[1] / scored.length;
  const byBreach: ImpactLevel = share >= 0.5 ? 'high' : share >= 0.2 ? 'medium' : 'low';
  const rank: Record<ImpactLevel, number> = { unknown: 0, low: 1, medium: 2, high: 3 };
  const impact: ImpactLevel = rank[byStatus] >= rank[byBreach] ? byStatus : byBreach;
  return {
    headline: top[1] > 0
      ? `${top[0]} pada ${top[1]} dari ${scored.length} klien yang dinilai.`
      : `Tidak ada metrik finance yang melewati target pada ${scored.length} klien yang dinilai.`,
    detail: 'Dihitung dari data finance per klien (skor hanya dari evidence yang tersedia).',
    impact,
    confidencePct: summary.averageConfidencePct
  };
}

/** Rows for "Prioritas Klien": worst score first, each with its heaviest driver. */
export function buildPriorityList(rows: ClientHealthRow[], limit = 4): Array<{ row: ClientHealthRow; driver: ClientDriver }> {
  return rows
    .filter(r => r.drivers.length > 0)
    .sort((a, b) => (b.drivers[0].weight - a.drivers[0].weight) || ((a.score ?? 101) - (b.score ?? 101)))
    .slice(0, limit)
    .map(row => ({ row, driver: row.drivers[0] }));
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV for the Export button — exactly the numbers shown on screen, blanks where data is missing. */
export function portfolioToCsv(rows: ClientHealthRow[]): string {
  const head = ['Klien', 'Periode', 'Skor', 'Status', 'Confidence %', 'Revenue', 'Operating profit', 'Margin %', 'COGS %', 'Labor %', 'OPEX %', 'Alert terbuka', 'Data belum ada'];
  const lines = rows.map(r => [r.name, r.period, r.score, r.status, r.confidencePct, r.revenue, r.operatingProfit, r.operatingMarginPct === null ? null : round1(r.operatingMarginPct), r.cogsPct === null ? null : round1(r.cogsPct), r.laborPct === null ? null : round1(r.laborPct), r.opexPct === null ? null : round1(r.opexPct), r.openAlerts, r.missing.join('; ')].map(csvEscape).join(','));
  return [head.join(','), ...lines].join('\n');
}
