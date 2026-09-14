export type FinanceSourceKind = 'system' | 'manual' | 'imported';

export interface FinanceEvidence { id: string; source: FinanceSourceKind; sourceRef?: string; capturedAt?: string; note?: string; }
export type FinanceStatementSection = 'pendapatan_usaha'|'biaya_produksi'|'biaya_usaha_lain'|'biaya_operasional'|'biaya_non_operasional'|'pendapatan_lain'|'pengeluaran_lain';
export interface FinanceRecord { id: string; period: string; amount: number; category: 'revenue' | 'cogs' | 'labor' | 'opex'; outletId?: string; evidence?: FinanceEvidence; accountLabel?: string; statementSection?: FinanceStatementSection; }

export interface FinanceSummary {
  period: string;
  revenue: number | null;
  cogs: number | null;
  grossProfit: number | null;
  labor: number | null;
  opex: number | null;
  operatingProfit: number | null;
  grossMarginPct: number | null;
  cogsPct: number | null;
  laborPct: number | null;
  opexPct: number | null;
  operatingMarginPct: number | null;
  recordCount: number;
  evidenceCount: number;
  missingMetrics: string[];
}

export interface FinanceComparison {
  current: FinanceSummary;
  previous: FinanceSummary | null;
  metrics: Array<{
    metric: string;
    current: number | null;
    previous: number | null;
    change: number | null;
    changePct: number | null;
    status: 'calculated' | 'insufficient_data' | 'undefined_baseline';
    formula: string;
  }>;
}

/** Missing categories remain null. TRACE never treats unavailable data as zero. */
export function summarizeFinance(records: FinanceRecord[], period: string): FinanceSummary {
  const scoped = records.filter(r => r.period === period && Number.isFinite(r.amount));
  const revenue = categoryTotal(scoped, 'revenue');
  const cogs = categoryTotal(scoped, 'cogs');
  const labor = categoryTotal(scoped, 'labor');
  const opex = categoryTotal(scoped, 'opex');
  const grossProfit = revenue !== null && cogs !== null ? revenue - cogs : null;
  const operatingProfit = revenue !== null && cogs !== null && labor !== null && opex !== null ? revenue - cogs - labor - opex : null;
  const evidenceCount = scoped.filter(r => r.evidence).length;
  const missingMetrics: string[] = [];
  if (revenue === null) missingMetrics.push('Revenue');
  if (cogs === null) missingMetrics.push('COGS');
  if (labor === null) missingMetrics.push('Labor');
  if (opex === null) missingMetrics.push('OPEX');
  return {
    period, revenue, cogs, grossProfit, labor, opex, operatingProfit,
    grossMarginPct: pct(grossProfit, revenue), cogsPct: pct(cogs, revenue), laborPct: pct(labor, revenue), opexPct: pct(opex, revenue), operatingMarginPct: pct(operatingProfit, revenue),
    recordCount: scoped.length, evidenceCount, missingMetrics
  };
}

export function compareFinancePeriods(records: FinanceRecord[], currentPeriod: string, previousPeriod?: string): FinanceComparison {
  const current = summarizeFinance(records, currentPeriod);
  const previous = previousPeriod ? summarizeFinance(records, previousPeriod) : null;
  const metrics = [
    ['Revenue', current.revenue, previous?.revenue ?? null], ['COGS', current.cogs, previous?.cogs ?? null], ['Gross Profit', current.grossProfit, previous?.grossProfit ?? null],
    ['Labor', current.labor, previous?.labor ?? null], ['OPEX', current.opex, previous?.opex ?? null], ['Operating Profit', current.operatingProfit, previous?.operatingProfit ?? null]
  ].map(([metric, cur, prev]) => changeMetric(String(metric), cur as number | null, prev as number | null));
  return { current, previous, metrics };
}

function changeMetric(metric: string, current: number | null, previous: number | null): FinanceComparison['metrics'][number] {
  const formula = '(current - previous) / previous × 100';
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return { metric, current, previous, change: null, changePct: null, status: 'insufficient_data', formula };
  const change = current - previous;
  if (previous === 0) return { metric, current, previous, change, changePct: null, status: 'undefined_baseline', formula };
  return { metric, current, previous, change, changePct: (change / previous) * 100, status: 'calculated', formula };
}

function categoryTotal(records: FinanceRecord[], category: FinanceRecord['category']): number | null {
  const matching = records.filter(r => r.category === category);
  return matching.length ? matching.reduce((total, r) => total + r.amount, 0) : null;
}
function pct(value: number | null, denominator: number | null): number | null {
  if (value === null || denominator === null || !Number.isFinite(value) || !Number.isFinite(denominator) || denominator === 0) return null;
  return (value / denominator) * 100;
}
