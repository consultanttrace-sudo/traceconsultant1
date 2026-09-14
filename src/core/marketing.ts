export type MarketingChannel = 'instagram' | 'tiktok' | 'facebook' | 'google' | 'website' | 'whatsapp' | 'offline' | 'other';
export type MarketingSourceKind = 'system' | 'manual' | 'imported';

export interface MarketingEvidence {
  id?: string;
  sourceKind: MarketingSourceKind;
  source?: string;
  reference?: string;
  period?: string;
  note?: string;
}

export interface MarketingActivity {
  id: string;
  period: string; // YYYY-MM
  name: string;
  channel: MarketingChannel;
  objective?: string;
  cost: number;
  attributedRevenue: number | null;
  leads?: number | null;
  meetings?: number | null;
  conversions?: number | null;
  impressions?: number | null;
  engagement?: number | null;
  status?: 'planned' | 'active' | 'completed' | 'cancelled';
  sourceKind: MarketingSourceKind;
  evidence?: MarketingEvidence[];
}

export interface MarketingPeriodComparison {
  period: string;
  previousPeriod: string | null;
  current: MarketingSummary;
  previous: MarketingSummary | null;
  changes: MarketingChanges;
  limitations: string[];
}

export interface MarketingSummary {
  period: string;
  spend: number;
  attributedRevenue: number | null;
  roiPct: number | null;
  roas: number | null;
  activities: number;
  completedActivities: number;
  leads: number | null;
  meetings: number | null;
  conversions: number | null;
  conversionRatePct: number | null;
  impressions: number | null;
  engagement: number | null;
  dataQuality: 'complete' | 'partial' | 'insufficient';
  invalidCostCount: number;
}

export interface MarketingChanges {
  spend: number | null;
  spendPct: number | null;
  attributedRevenue: number | null;
  attributedRevenuePct: number | null;
  roiPctPoint: number | null;
  leads: number | null;
  meetings: number | null;
  conversions: number | null;
}

export interface MarketingInsight {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  status: 'confirmed' | 'suspected' | 'blocked';
  title: string;
  finding: string;
  cause: string;
  impact: string;
  recommendation: string;
  evidence: string[];
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export function marketingRoiPct(cost: number, revenue: number | null): number | null {
  if (!(cost > 0) || revenue === null || !Number.isFinite(revenue)) return null;
  return ((revenue - cost) / cost) * 100;
}

export function marketingRoas(cost: number, revenue: number | null): number | null {
  if (!(cost > 0) || revenue === null || !Number.isFinite(revenue)) return null;
  return revenue / cost;
}

export function summarizeMarketing(activities: MarketingActivity[], period: string): MarketingSummary {
  const rows = activities.filter(x => x.period === period);
  // Invalid negative spend must not be silently converted into zero.
  // Keep the summary mathematically conservative and disclose the invalid input.
  const invalidCostCount = rows.filter(x => !Number.isFinite(Number(x.cost)) || Number(x.cost) < 0).length;
  const validSpend = rows.reduce((s, x) => s + (Number.isFinite(Number(x.cost)) && Number(x.cost) >= 0 ? Number(x.cost) : 0), 0);
  // Keep valid spend visible for operational review, but NEVER calculate ROI/ROAS
  // from a partial cost denominator. Invalid rows make financial attribution incomplete.
  const spend = validSpend;
  const revenueValues = rows.map(x => n(x.attributedRevenue)).filter((x): x is number => x !== null);
  const attributedRevenue = revenueValues.length ? revenueValues.reduce((s, x) => s + x, 0) : null;
  const leads = sumNullable(rows.map(x => n(x.leads)));
  const meetings = sumNullable(rows.map(x => n(x.meetings)));
  const conversions = sumNullable(rows.map(x => n(x.conversions)));
  const impressions = sumNullable(rows.map(x => n(x.impressions)));
  const engagement = sumNullable(rows.map(x => n(x.engagement)));
  const conversionRatePct = leads !== null && leads > 0 && conversions !== null ? (conversions / leads) * 100 : null;
  const completeSignals = rows.length > 0 && revenueValues.length === rows.length && rows.every(x => Number.isFinite(Number(x.cost)) && Number(x.cost) >= 0);
  return {
    period, spend, attributedRevenue,
    roiPct: invalidCostCount ? null : marketingRoiPct(spend, attributedRevenue),
    roas: invalidCostCount ? null : marketingRoas(spend, attributedRevenue),
    activities: rows.length,
    completedActivities: rows.filter(x => x.status === 'completed' || x.status === undefined).length,
    leads, meetings, conversions, conversionRatePct, impressions, engagement,
    dataQuality: !rows.length ? 'insufficient' : completeSignals ? 'complete' : 'partial',
    invalidCostCount
  };
}

function sumNullable(values: Array<number | null>): number | null {
  if (!values.length || values.every(x => x === null)) return null;
  return values.reduce<number>((s, x) => s + (x ?? 0), 0);
}

function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function compareMarketingPeriods(activities: MarketingActivity[], period: string, previousPeriod: string | null): MarketingPeriodComparison {
  const current = summarizeMarketing(activities, period);
  const previous = previousPeriod ? summarizeMarketing(activities, previousPeriod) : null;
  const limitations: string[] = [];
  if (!previous) limitations.push('Periode pembanding marketing tidak tersedia.');
  if (current.dataQuality !== 'complete') limitations.push('Sebagian aktivitas belum memiliki attributed revenue atau memiliki input cost yang perlu direview; ROI/ROAS dapat tidak lengkap.');
  if (current.invalidCostCount > 0) limitations.push(`Terdapat ${current.invalidCostCount} aktivitas dengan cost invalid; ROI/ROAS sengaja tidak dihitung agar tidak menggunakan denominator yang salah.`);
  if (current.leads === null) limitations.push('Data leads tidak tersedia pada periode ini.');
  if (current.conversions === null) limitations.push('Data conversions tidak tersedia pada periode ini.');
  return {
    period, previousPeriod, current, previous,
    changes: previous ? {
      spend: current.spend - previous.spend,
      spendPct: pctChange(current.spend, previous.spend),
      attributedRevenue: current.attributedRevenue !== null && previous.attributedRevenue !== null ? current.attributedRevenue - previous.attributedRevenue : null,
      attributedRevenuePct: pctChange(current.attributedRevenue, previous.attributedRevenue),
      roiPctPoint: current.roiPct !== null && previous.roiPct !== null ? current.roiPct - previous.roiPct : null,
      leads: current.leads !== null && previous.leads !== null ? current.leads - previous.leads : null,
      meetings: current.meetings !== null && previous.meetings !== null ? current.meetings - previous.meetings : null,
      conversions: current.conversions !== null && previous.conversions !== null ? current.conversions - previous.conversions : null
    } : { spend: null, spendPct: null, attributedRevenue: null, attributedRevenuePct: null, roiPctPoint: null, leads: null, meetings: null, conversions: null },
    limitations
  };
}

export function diagnoseMarketing(comparison: MarketingPeriodComparison): MarketingInsight[] {
  const c = comparison.current;
  const p = comparison.previous;
  const out: MarketingInsight[] = [];
  if (!c.activities) return [{ id:'marketing-data-missing', severity:'low', status:'blocked', title:'Data marketing belum tersedia', finding:`Tidak ada aktivitas marketing pada ${c.period}.`, cause:'Tidak ada record aktivitas pada periode.', impact:'Efektivitas channel/campaign belum dapat dinilai.', recommendation:'Masukkan aktivitas dan evidence marketing yang benar.', evidence:[] }];
  if (!p) return [{ id:'marketing-no-comparison', severity:'info', status:'blocked', title:'Periode pembanding belum tersedia', finding:`Aktivitas marketing tersedia pada ${c.period}, tetapi periode pembanding belum tersedia.`, cause:'Data periode sebelumnya tidak tersedia.', impact:'Tren marketing belum dapat dikonfirmasi.', recommendation:'Lengkapi periode sebelumnya untuk analisis perubahan.', evidence:[`Period: ${c.period}`] }];
  const attributionIncomplete = c.activities > 0 && c.dataQuality !== 'complete';
  if (c.spend > 0 && attributionIncomplete) out.push({ id:'marketing-attribution-missing', severity:'medium', status:'confirmed', title:'Spend ada tetapi attributed revenue belum lengkap', finding:`Spend ${money(c.spend)} tercatat, namun attributed revenue belum tersedia untuk seluruh aktivitas.`, cause:'Attribution/evidence revenue belum diisi.', impact:'ROI dan ROAS tidak dapat dikonfirmasi penuh.', recommendation:'Lengkapi attributed revenue hanya jika ada evidence yang mendukung; jangan mengalokasikan revenue outlet secara otomatis.', evidence:[`Spend ${money(c.spend)}`, `Data quality: ${c.dataQuality}`] });
  if (comparison.changes.roiPctPoint !== null && comparison.changes.roiPctPoint < -5) out.push({ id:'marketing-roi-decline', severity:'high', status:'confirmed', title:'ROI marketing menurun', finding:`ROI turun ${Math.abs(comparison.changes.roiPctPoint).toFixed(2)} pp dari periode sebelumnya.`, cause:'Perubahan ROI terkonfirmasi secara matematis; driver campaign/channel belum dapat dipastikan dari summary saja.', impact:'Efisiensi spend marketing memburuk.', recommendation:'Drill down campaign, channel, audience, spend, dan evidence attributed revenue sebelum mengubah budget.', evidence:[`ROI current ${pct(c.roiPct)}`, `ROI previous ${pct(p.roiPct)}`] });
  if (comparison.changes.spendPct !== null && comparison.changes.spendPct > 20 && comparison.changes.attributedRevenuePct !== null && comparison.changes.attributedRevenuePct < 0) out.push({ id:'marketing-spend-revenue-mismatch', severity:'high', status:'confirmed', title:'Spend naik sementara attributed revenue turun', finding:`Spend naik ${comparison.changes.spendPct.toFixed(2)}% sementara attributed revenue turun ${Math.abs(comparison.changes.attributedRevenuePct).toFixed(2)}%.`, cause:'Mismatch perubahan spend dan attributed revenue terkonfirmasi; akar masalah campaign belum teridentifikasi.', impact:'Efisiensi investasi marketing berpotensi memburuk.', recommendation:'Audit campaign-level spend, creative, channel, targeting, timing, dan attribution evidence.', evidence:[`Spend change ${comparison.changes.spendPct.toFixed(2)}%`, `Attributed revenue change ${comparison.changes.attributedRevenuePct.toFixed(2)}%`] });
  if (out.length === 0) out.push({ id:'marketing-no-material-signal', severity:'info', status:'confirmed', title:'Tidak ada sinyal marketing material', finding:`Tidak ada perubahan material yang dapat dikonfirmasi pada ${c.period}.`, cause:'Metric tersedia tidak melewati rule diagnosis.', impact:'Tidak ada masalah marketing material yang dapat dikonfirmasi.', recommendation:'Lanjutkan monitoring dan kumpulkan evidence channel/campaign secara konsisten.', evidence:[`Activities ${c.activities}`, `Data quality ${c.dataQuality}`] });
  return out;
}

function money(v:number){ return `Rp${Math.round(v).toLocaleString('id-ID')}`; }
function pct(v:number|null){ return v === null ? 'N/A' : `${v.toFixed(2)}%`; }
