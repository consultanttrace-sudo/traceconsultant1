export type IntakeSourceType = 'pdf' | 'xlsx' | 'xls' | 'ods' | 'csv' | 'tsv' | 'docx' | 'txt' | 'json' | 'image' | 'unknown';
export type IntakeFieldStatus = 'available' | 'calculated' | 'missing' | 'invalid' | 'not_applicable';

export interface IntakeCellEvidence {
  sourceFile: string;
  sourceSheet?: string;
  sourceRow?: number;
  sourceColumn?: string;
  rawValue?: string;
}

export interface IntakeField<T = unknown> {
  key: string;
  label: string;
  value: T | null;
  status: IntakeFieldStatus;
  evidence?: IntakeCellEvidence;
  note?: string;
}

export interface IntakeMonthlyBreakdown {
  period: string;
  revenue: number | null;
  cogs: number | null;
  labor: number | null;
  opex: number | null;
  rowCount: number;
  financeEvidence: { revenue: number; cogs: number; labor: number; opex: number };
}

export interface IntakeResult {
  businessName: IntakeField<string>;
  outletName: IntakeField<string>;
  period: IntakeField<string>;
  periodStart: string | null;
  periodEnd: string | null;
  periodCount: number;
  periods: string[];
  monthlyBreakdown: IntakeMonthlyBreakdown[];
  revenue: IntakeField<number>;
  cogs: IntakeField<number>;
  labor: IntakeField<number>;
  opex: IntakeField<number>;
  coveragePct: number;
  fields: IntakeField[];
  missingLabels: string[];
  warnings: string[];
}

const aliases: Record<string, string[]> = {
  businessName: ['business name','nama bisnis','nama usaha','company','perusahaan','coffee name','nama coffee','nama cafe','nama café'],
  outletName: ['outlet','outlet name','nama outlet','cabang','branch','lokasi'],
  period: ['period','periode','bulan','month','date','tanggal'],
  revenue: ['revenue','sales','sales revenue','penjualan','penjualan bersih','omzet','omset','total sales'],
  cogs: ['cogs','hpp','cost of goods sold','harga pokok penjualan','biaya bahan baku'],
  labor: ['labor','labour','payroll','gaji','upah','beban gaji','tenaga kerja'],
  opex: ['opex','operating expense','beban operasional','biaya operasional','operational expense']
};

export function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\u00a0]/g, ' ').replace(/\s+/g, ' ');
}

export function detectSourceType(name: string): IntakeSourceType {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'xls') return 'xls';
  if (ext === 'ods') return 'ods';
  if (ext === 'csv') return 'csv';
  if (ext === 'tsv') return 'tsv';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt') return 'txt';
  if (ext === 'json') return 'json';
  if (['png','jpg','jpeg','webp'].includes(ext ?? '')) return 'image';
  return 'unknown';
}

export function findMappedField(headers: unknown[], target: string): number {
  const names = aliases[target] ?? [target];
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex(h => names.some(alias => h === alias || h.includes(alias)));
}

export function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let cleaned = raw.replace(/Rp|IDR/gi, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!cleaned || !/[0-9]/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // The separator appearing last is treated as the decimal separator only
    // when it has 1–2 trailing digits; the other separator is then thousands.
    const decimalIsComma = lastComma > lastDot && cleaned.length - lastComma - 1 <= 2;
    const decimalIsDot = lastDot > lastComma && cleaned.length - lastDot - 1 <= 2;
    if (decimalIsComma) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    else if (decimalIsDot) cleaned = cleaned.replace(/,/g, '');
    else cleaned = cleaned.replace(/[.,]/g, '');
  } else if (lastComma >= 0) {
    const digitsAfter = cleaned.length - lastComma - 1;
    cleaned = digitsAfter === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else if (lastDot >= 0) {
    const digitsAfter = cleaned.length - lastDot - 1;
    if (digitsAfter === 3 && /^-?\d{1,3}(?:\.\d{3})+$/.test(cleaned)) cleaned = cleaned.replace(/\./g, '');
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function field<T>(key: string, label: string, value: T | null, status: IntakeFieldStatus, note?: string): IntakeField<T> {
  return { key, label, value, status, note };
}

export function buildIntakeResult(input: Partial<Record<string, unknown>>): IntakeResult {
  const specs: Array<[string,string]> = [
    ['businessName','Nama bisnis'],['outletName','Outlet'],['period','Periode'],['revenue','Revenue'],['cogs','COGS'],['labor','Labor'],['opex','OPEX']
  ];
  const fields = specs.map(([key,label]) => {
    const value = input[key] ?? null;
    return field(key, label, value as never, value === null || value === '' ? 'missing' : 'available');
  });
  const numeric = fields.filter(f => ['revenue','cogs','labor','opex'].includes(f.key));
  const available = fields.filter(f => f.status === 'available' || f.status === 'calculated').length;
  const missingLabels = fields.filter(f => f.status === 'missing').map(f => f.label);
  const warnings: string[] = [];
  if (!input.businessName) warnings.push('Nama bisnis tidak ditemukan pada file. TRACE tidak akan menebak nama bisnis.');
  if (!input.period) warnings.push('Periode tidak ditemukan atau belum dapat dipastikan.');
  if (numeric.some(f => f.status === 'missing')) warnings.push('Analisis tetap berjalan dengan data yang tersedia; metrik yang bergantung pada data hilang akan diberi batasan.');
  return {
    businessName: fields[0] as IntakeField<string>, outletName: fields[1] as IntakeField<string>, period: fields[2] as IntakeField<string>,
    revenue: fields[3] as IntakeField<number>, cogs: fields[4] as IntakeField<number>, labor: fields[5] as IntakeField<number>, opex: fields[6] as IntakeField<number>,
    coveragePct: Math.round((available / fields.length) * 100), fields, missingLabels, warnings, periodStart: null, periodEnd: null, periodCount: 0, periods: [], monthlyBreakdown: []
  };
}

export interface DelimitedAggregate {
  businessName: string | null;
  outletName: string | null;
  period: string | null;
  revenue: number | null;
  cogs: number | null;
  labor: number | null;
  opex: number | null;
  rowCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  periodCount: number;
  periods: string[];
  monthlyBreakdown: IntakeMonthlyBreakdown[];
}

function normalizePeriodToken(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const ym = raw.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2,'0')}`;
  const monthYear = raw.match(/^(\d{1,2})[-\/.](\d{4})$/);
  if (monthYear) return `${monthYear[2]}-${monthYear[1].padStart(2,'0')}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  return null;
}

function periodRange(periods: string[]): { start: string|null; end: string|null; unique: string[] } {
  const unique = [...new Set(periods.filter(Boolean))].sort();
  return { start: unique[0] ?? null, end: unique.at(-1) ?? null, unique };
}

/** Aggregate every non-empty data row while retaining the complete period dimension. */
export function aggregateDelimitedRows(headers: unknown[], rows: unknown[][]): DelimitedAggregate {
  const dataRows = rows.filter(r => r.some(v => String(v ?? '').trim() !== ''));
  const idx = (key: string) => findMappedField(headers, key);
  const first = (key: string) => {
    const i = idx(key);
    if (i < 0) return null;
    return String(dataRows.find(r => String(r[i] ?? '').trim() !== '')?.[i] ?? '').trim() || null;
  };
  const sum = (key: string) => {
    const i = idx(key);
    if (i < 0) return null;
    const values = dataRows.map(r => parseAmount(r[i])).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const periodIdx = idx('period');
  const occurredIdx = headers.map(normalizeHeader).findIndex(h => ['tanggal transaksi','transaction date','transaction_date','sold at','sold_at','occurred at','occurred_at','datetime','timestamp'].some(a => h===a || h.includes(a)));
  const periodValues = dataRows.map(r => normalizePeriodToken(periodIdx >= 0 ? r[periodIdx] : occurredIdx >= 0 ? r[occurredIdx] : null)).filter((v): v is string => !!v);
  const range = periodRange(periodValues);
  const monthlyMap = new Map<string, IntakeMonthlyBreakdown>();
  for (const row of dataRows) {
    const period = normalizePeriodToken(periodIdx >= 0 ? row[periodIdx] : occurredIdx >= 0 ? row[occurredIdx] : null);
    if (!period) continue;
    const current = monthlyMap.get(period) ?? {period,revenue:null,cogs:null,labor:null,opex:null,rowCount:0,financeEvidence:{revenue:0,cogs:0,labor:0,opex:0}};
    const add = (key:'revenue'|'cogs'|'labor'|'opex') => {
      const i = idx(key);
      const value = i >= 0 ? parseAmount(row[i]) : null;
      if (value !== null) { current[key] = (current[key] ?? 0) + value; current.financeEvidence[key] += 1; }
    };
    add('revenue'); add('cogs'); add('labor'); add('opex');
    current.rowCount += 1;
    monthlyMap.set(period,current);
  }
  const monthlyBreakdown = [...monthlyMap.values()].sort((a,b)=>a.period.localeCompare(b.period));
  const periodLabel = range.start && range.end ? range.start === range.end ? range.start : `${range.start} → ${range.end}` : first('period');
  return { businessName:first('businessName'), outletName:first('outletName'), period:periodLabel, revenue:sum('revenue'), cogs:sum('cogs'), labor:sum('labor'), opex:sum('opex'), rowCount:dataRows.length, periodStart:range.start, periodEnd:range.end, periodCount:range.unique.length, periods:range.unique, monthlyBreakdown };
}

export function applyManualCompletion(input: IntakeResult, values: Partial<Record<'businessName'|'outletName'|'period'|'revenue'|'cogs'|'labor'|'opex', unknown>>): IntakeResult {
  const result = structuredClone(input);
  for (const key of ['businessName','outletName','period','revenue','cogs','labor','opex'] as const) {
    const raw = values[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const target = result[key];
    if (['revenue','cogs','labor','opex'].includes(key)) {
      const parsed = parseAmount(raw);
      if (parsed === null || parsed < 0) { target.status = 'invalid'; target.note = 'Nilai manual harus berupa angka non-negatif yang dapat dibaca.'; continue; }
      target.value = parsed as never;
    } else {
      target.value = String(raw).trim() as never;
    }
    target.status = 'available';
    target.evidence = { sourceFile:'Manual', rawValue:String(raw) };
    target.note = 'Owner-provided manual completion; perlu review sebelum commit.';
  }
  // Manual-only and hybrid completion must feed the same monthly contract used
  // by imported files. Never leave monthlyBreakdown empty when a valid period
  // and at least one finance metric were supplied manually.
  const manualPeriod = String(result.period.value ?? '').trim();
  if (manualPeriod) {
    const normalized = normalizePeriodToken(manualPeriod);
    if (normalized) {
      result.periodStart = normalized;
      result.periodEnd = normalized;
      result.periodCount = 1;
      result.periods = [normalized];
      const existing = result.monthlyBreakdown.find(x => x.period === normalized);
      const breakdown: IntakeMonthlyBreakdown = existing ?? {
        period: normalized, revenue:null, cogs:null, labor:null, opex:null, rowCount:1,
        financeEvidence:{revenue:0,cogs:0,labor:0,opex:0}
      };
      for (const key of ['revenue','cogs','labor','opex'] as const) {
        const value = result[key].value;
        if (typeof value === 'number' && Number.isFinite(value)) {
          breakdown[key] = value;
          breakdown.financeEvidence[key] = 1;
        }
      }
      result.monthlyBreakdown = [breakdown];
    }
  }
  return calculateAvailableFinance(result);
}

export function calculateAvailableFinance(input: IntakeResult): IntakeResult {
  const result = structuredClone(input);
  // Recompute derived fields idempotently. Repeated manual completion/review must
  // never append duplicate Gross/Operating Profit fields and inflate coverage.
  result.fields = result.fields.filter(f => f.key !== 'grossProfit' && f.key !== 'operatingProfit');
  const revenue = result.revenue.value;
  const cogs = result.cogs.value;
  if (revenue !== null && cogs !== null && Number.isFinite(revenue) && Number.isFinite(cogs)) {
    result.fields.push(field('grossProfit','Gross Profit', revenue - cogs, 'calculated', 'Dihitung dari Revenue - COGS.'));
  }
  const labor = result.labor.value;
  const opex = result.opex.value;
  if (revenue !== null && cogs !== null && labor !== null && opex !== null && [revenue,cogs,labor,opex].every(Number.isFinite)) {
    result.fields.push(field('operatingProfit','Operating Profit', revenue - cogs - labor - opex, 'calculated', 'Dihitung dari Revenue - COGS - Labor - OPEX.'));
  }
  const available = result.fields.filter(f => f.status === 'available' || f.status === 'calculated').length;
  result.coveragePct = result.fields.length ? Math.round((available / result.fields.length) * 100) : 0;
  result.missingLabels = result.fields.filter(f => f.status === 'missing').map(f => f.label);
  return result;
}
