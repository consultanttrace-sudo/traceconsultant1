import type { FinanceComparison } from './finance.js';
import type { EvidenceItem } from './evidence.js';
import { assessEvidence } from './evidence.js';

export type DiagnosisSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type DiagnosisStatus = 'confirmed' | 'suspected' | 'blocked';
export type DiagnosisArea = 'revenue' | 'cost' | 'margin' | 'profitability' | 'data_quality';

export interface DiagnosisEvidence {
  id: string;
  metric: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  changePct: number | null;
  currentPeriod: string;
  previousPeriod: string | null;
  source: string;
}

export interface DiagnosisFinding {
  id: string;
  area: DiagnosisArea;
  severity: DiagnosisSeverity;
  status: DiagnosisStatus;
  title: string;
  problem: string;
  cause: string;
  impact: string;
  recommendation: string;
  evidence: DiagnosisEvidence[];
  /** Evidence coverage, not a probability of business truth. Null means no explicit evidence was supplied. */
  confidencePct: number | null;
}

export interface DiagnosisReport {
  currentPeriod: string;
  previousPeriod: string | null;
  findings: DiagnosisFinding[];
  evidenceAssessment: ReturnType<typeof assessEvidence>;
  conclusion: string;
  limitations: string[];
}

export interface DiagnosisThresholds {
  revenueDeclinePct: number;
  cogsRatioIncreasePp: number;
  laborRatioIncreasePp: number;
  opexRatioIncreasePp: number;
  operatingMarginDeclinePp: number;
}

const DEFAULT_THRESHOLDS: DiagnosisThresholds = {
  revenueDeclinePct: 5,
  cogsRatioIncreasePp: 3,
  laborRatioIncreasePp: 3,
  opexRatioIncreasePp: 3,
  operatingMarginDeclinePp: 3
};

/**
 * Evidence-first business diagnosis. Thresholds are explicit configuration,
 * not hidden claims about what is universally "bad" for every business.
 */
export function diagnoseBusiness(
  comparison: FinanceComparison,
  evidenceItems: EvidenceItem[] = [],
  thresholds: Partial<DiagnosisThresholds> = {}
): DiagnosisReport {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const c = comparison.current;
  const p = comparison.previous;
  const evidenceAssessment = assessEvidence(evidenceItems);
  const findings: DiagnosisFinding[] = [];
  const limitations: string[] = [];

  if (!p) {
    limitations.push('Periode pembanding tidak tersedia; diagnosis perubahan antarperiode tidak dapat dikonfirmasi.');
  }
  for (const metric of c.missingMetrics) {
    limitations.push(`${metric} tidak tersedia pada periode ${c.period}; kesimpulan terkait metric tersebut dibatasi.`);
  }

  if (p) {
    const revenue = metric(comparison, 'Revenue');
    if (revenue.changePct !== null && revenue.changePct <= -t.revenueDeclinePct) {
      findings.push(makeFinding(
        'revenue-decline', 'revenue', revenue.changePct <= -10 ? 'high' : 'medium',
        'Revenue menurun dibanding periode pembanding',
        `Revenue turun ${fmtPctAbs(revenue.changePct)} dari ${fmt(revenue.previous)} menjadi ${fmt(revenue.current)}.`,
        'Penurunan revenue terkonfirmasi secara matematis; penyebab operasional belum dapat ditentukan hanya dari P&L.',
        'Penurunan revenue menekan kapasitas gross profit dan operating profit.',
        'Telusuri driver revenue: volume transaksi, average ticket, outlet, produk, channel, promo, dan perubahan periode operasional.',
        [revenue], evidenceConfidence(revenue, evidenceItems)
      ));
    }

    const cogs = metric(comparison, 'COGS');
    const cogsPp = pctPointChange(c.cogsPct, p.cogsPct);
    if (cogsPp !== null && cogsPp >= t.cogsRatioIncreasePp) {
      findings.push(makeRatioFinding('cogs-ratio', 'cost', cogsPp >= 5 ? 'high' : 'medium', 'COGS ratio memburuk',
        `COGS terhadap revenue naik ${fmtPp(cogsPp)} percentage point, dari ${fmtPct(p.cogsPct)} menjadi ${fmtPct(c.cogsPct)}.`,
        'Peningkatan rasio biaya terkonfirmasi; penyebab spesifik perlu ditelusuri ke harga bahan, waste, recipe yield, purchasing, atau mix produk.',
        'Margin kotor berpotensi tertekan meskipun revenue tidak berubah.',
        'Drill down COGS per produk/outlet dan cocokkan dengan histori harga bahan, purchasing, waste, dan perubahan recipe.',
        [cogs], evidenceConfidence(cogs, evidenceItems)
      ));
    }

    const labor = metric(comparison, 'Labor');
    const laborPp = pctPointChange(c.laborPct, p.laborPct);
    if (laborPp !== null && laborPp >= t.laborRatioIncreasePp) {
      findings.push(makeRatioFinding('labor-ratio', 'cost', laborPp >= 5 ? 'high' : 'medium', 'Labor ratio memburuk',
        `Labor terhadap revenue naik ${fmtPp(laborPp)} percentage point, dari ${fmtPct(p.laborPct)} menjadi ${fmtPct(c.laborPct)}.`,
        'Kenaikan rasio terkonfirmasi; penyebab belum dapat dipastikan tanpa payroll, jam kerja, headcount, dan revenue per outlet.',
        'Beban tenaga kerja menyerap porsi revenue yang lebih besar.',
        'Periksa payroll, headcount, jam kerja, overtime, produktivitas per outlet, dan perubahan jam operasional.',
        [labor], evidenceConfidence(labor, evidenceItems)
      ));
    }

    const opex = metric(comparison, 'OPEX');
    const opexPp = pctPointChange(c.opexPct, p.opexPct);
    if (opexPp !== null && opexPp >= t.opexRatioIncreasePp) {
      findings.push(makeRatioFinding('opex-ratio', 'cost', opexPp >= 5 ? 'high' : 'medium', 'OPEX ratio memburuk',
        `OPEX terhadap revenue naik ${fmtPp(opexPp)} percentage point, dari ${fmtPct(p.opexPct)} menjadi ${fmtPct(c.opexPct)}.`,
        'Kenaikan rasio terkonfirmasi; penyebab perlu diurai per kategori OPEX dan evidence transaksi.',
        'Operating margin tertekan oleh beban operasional relatif terhadap revenue.',
        'Drill down OPEX per kategori, outlet, vendor, dan transaksi; pisahkan biaya one-off dari biaya berulang.',
        [opex], evidenceConfidence(opex, evidenceItems)
      ));
    }

    const op = metric(comparison, 'Operating Profit');
    const marginPp = pctPointChange(c.operatingMarginPct, p.operatingMarginPct);
    if (c.operatingProfit !== null && c.operatingProfit < 0) {
      findings.push(makeFinding('operating-loss', 'profitability', 'critical', 'Operating profit negatif',
        `Operating profit periode ${c.period} adalah ${fmt(c.operatingProfit)}.`,
        'Kerugian operasi terkonfirmasi dari formula Revenue − COGS − Labor − OPEX; root cause perlu diurai dari contributors.',
        'Bisnis menghasilkan rugi pada level operasi berdasarkan data yang tersedia.',
        'Prioritaskan contributor terbesar secara absolut, lalu susun corrective action yang dapat diukur pada periode berikutnya.',
        [op], evidenceConfidence(op, evidenceItems)
      ));
    } else if (marginPp !== null && marginPp <= -t.operatingMarginDeclinePp) {
      findings.push(makeFinding('operating-margin-decline', 'profitability', marginPp <= -5 ? 'high' : 'medium', 'Operating margin menurun',
        `Operating margin turun ${fmtPpAbs(marginPp)} percentage point, dari ${fmtPct(p.operatingMarginPct)} menjadi ${fmtPct(c.operatingMarginPct)}.`,
        'Penurunan margin terkonfirmasi; diagnosis akar masalah membutuhkan breakdown revenue dan biaya.',
        'Profitabilitas relatif terhadap revenue memburuk meskipun operating profit absolut belum tentu negatif.',
        'Bandingkan perubahan revenue, COGS, labor, dan OPEX secara simultan untuk menemukan contributor terbesar.',
        [op], evidenceConfidence(op, evidenceItems)
      ));
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: 'no-material-signal', area: 'data_quality', severity: p ? 'info' : 'low', status: p ? 'confirmed' : 'blocked',
      title: p ? 'Tidak ada sinyal material berdasarkan threshold saat ini' : 'Diagnosis perubahan belum dapat dilakukan',
      problem: p ? 'Metric yang tersedia tidak melewati threshold diagnosis yang dikonfigurasi.' : 'Tidak ada periode pembanding yang cukup untuk diagnosis perubahan.',
      cause: p ? 'Tidak ditemukan perubahan yang melewati threshold eksplisit.' : 'Data periode pembanding tidak tersedia.',
      impact: p ? 'Tidak ada masalah material yang dapat dikonfirmasi oleh rule engine saat ini.' : 'Kesimpulan perubahan periode akan tidak lengkap.',
      recommendation: p ? 'Lanjutkan monitoring dan drill down bila ada perubahan operasional yang belum tercermin di P&L.' : 'Lengkapi periode pembanding sebelum menarik kesimpulan tren.',
      evidence: [], confidencePct: null
    });
  }

  const material = findings.filter(f => f.severity !== 'info');
  const conclusion = material.length
    ? `${material.length} sinyal bisnis material ditemukan pada ${c.period}. Prioritas utama: ${material.sort(prioritySort)[0].title}.`
    : `Tidak ada sinyal material yang dapat dikonfirmasi pada ${c.period} berdasarkan data dan threshold yang tersedia.`;

  return { currentPeriod: c.period, previousPeriod: p?.period ?? null, findings, evidenceAssessment, conclusion, limitations };
}

function metric(comparison: FinanceComparison, name: string): DiagnosisEvidence {
  const m = comparison.metrics.find(x => x.metric === name);
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), metric: name,
    current: m?.current ?? null, previous: m?.previous ?? null,
    change: m?.change ?? null, changePct: m?.changePct ?? null,
    currentPeriod: comparison.current.period, previousPeriod: comparison.previous?.period ?? null,
    source: 'Finance comparison'
  };
}

function makeFinding(id: string, area: DiagnosisArea, severity: DiagnosisSeverity, title: string, problem: string, cause: string, impact: string, recommendation: string, evidence: DiagnosisEvidence[], confidencePct: number | null): DiagnosisFinding {
  return { id, area, severity, status: 'confirmed', title, problem, cause, impact, recommendation, evidence, confidencePct };
}

function makeRatioFinding(id: string, area: DiagnosisArea, severity: DiagnosisSeverity, title: string, problem: string, cause: string, impact: string, recommendation: string, evidence: DiagnosisEvidence[], confidencePct: number | null): DiagnosisFinding {
  return makeFinding(id, area, severity, title, problem, cause, impact, recommendation, evidence, confidencePct);
}

function pctPointChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

function evidenceConfidence(metricEvidence: DiagnosisEvidence, items: EvidenceItem[]): number | null {
  const related = items.filter(i => i.metric.toLowerCase() === metricEvidence.metric.toLowerCase() && i.status !== 'unavailable');
  if (!related.length) return null;
  const periods = new Set(related.map(i => i.period).filter(Boolean));
  const expectedPeriods = metricEvidence.previousPeriod ? 2 : 1;
  return Math.round(Math.min(1, periods.size / expectedPeriods) * 100);
}

function prioritySort(a: DiagnosisFinding, b: DiagnosisFinding) {
  const rank: Record<DiagnosisSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  return rank[b.severity] - rank[a.severity];
}
function fmt(v: number | null): string { return v === null ? 'tidak tersedia' : Number(v).toLocaleString('id-ID'); }
function fmtPct(v: number | null): string { return v === null ? 'tidak tersedia' : `${v.toFixed(2)}%`; }
function fmtPctAbs(v: number): string { return `${Math.abs(v).toFixed(2)}%`; }
function fmtPp(v: number): string { return `${v.toFixed(2)} pp`; }
function fmtPpAbs(v: number): string { return `${Math.abs(v).toFixed(2)} pp`; }
