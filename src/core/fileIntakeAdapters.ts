import { buildIntakeResult, calculateAvailableFinance, findMappedField, normalizeHeader, parseAmount, type IntakeResult } from './dataIntake.js';
import { mapTabularRows, type CanonicalPOSEventInput } from './canonicalImport.js';

export interface FileAdapterResult {
  result: IntakeResult;
  sourceType: string;
  sheets?: string[];
  extractedRows?: number;
  warnings: string[];
  tabularRows?: CanonicalPOSEventInput[];
}

function valueFromText(text: string, labels: string[]): string | null {
  const escaped = labels.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:=\\-]?\\s*(?:Rp\\s*)?([^\\n\\r]+)`, 'i');
  const m = text.match(re);
  return m?.[1]?.trim() || null;
}

function enrichPeriodMetadata(result: IntakeResult, periods: string[]): IntakeResult {
  const unique = [...new Set(periods.filter(Boolean))].sort();
  result.periods = unique;
  result.periodCount = unique.length;
  result.periodStart = unique[0] ?? null;
  result.periodEnd = unique.at(-1) ?? null;
  if (unique.length > 1) result.period.value = `${unique[0]} → ${unique.at(-1)}`;
  else if (unique.length === 1) result.period.value = unique[0];
  if (unique.length > 1) result.warnings.push(`Dataset mencakup ${unique.length} periode: ${unique[0]} sampai ${unique.at(-1)}. TRACE mempertahankan dimensi periode dan tidak menganggap seluruh total sebagai satu bulan.`);
  return result;
}

function normalizePeriodValue(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const ym = raw.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.]\d{1,2})?/);
  if (ym) return `${ym[1]}-${ym[2].padStart(2,'0')}`;
  const monthYear = raw.match(/^(\d{1,2})[-\/.](\d{4})$/);
  if (monthYear) return `${monthYear[2]}-${monthYear[1].padStart(2,'0')}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

function enrichMonthlyBreakdown(result: IntakeResult, rows: unknown[][], headers: unknown[], periodIndex: number, revenueIndex: number, cogsIndex: number, laborIndex: number, opexIndex: number): IntakeResult {
  const map = new Map<string,{period:string;revenue:number|null;cogs:number|null;labor:number|null;opex:number|null;rowCount:number;financeEvidence:{revenue:number;cogs:number;labor:number;opex:number}}>();
  const dateIndex = headers.map(normalizeHeader).findIndex(h => ['tanggal transaksi','transaction date','transaction_date','sold at','sold_at','occurred at','occurred_at','datetime','timestamp'].some(a=>h===a||h.includes(a)));
  for (const row of rows) {
    const period = normalizePeriodValue(periodIndex >= 0 ? row[periodIndex] : dateIndex >= 0 ? row[dateIndex] : null);
    if (!period) continue;
    const current = map.get(period) ?? {period,revenue:null,cogs:null,labor:null,opex:null,rowCount:0,financeEvidence:{revenue:0,cogs:0,labor:0,opex:0}};
    const add=(key:'revenue'|'cogs'|'labor'|'opex', index:number)=>{const value=index>=0?parseAmount(row[index]):null;if(value!==null){current[key]=(current[key]??0)+value;current.financeEvidence[key]++;}};
    add('revenue',revenueIndex); add('cogs',cogsIndex); add('labor',laborIndex); add('opex',opexIndex);
    current.rowCount++;
    map.set(period,current);
  }
  result.monthlyBreakdown=[...map.values()].sort((a,b)=>a.period.localeCompare(b.period));
  return enrichPeriodMetadata(result,result.monthlyBreakdown.map(x=>x.period));
}

function buildFromUnstructuredText(text: string, sourceFile: string): IntakeResult {
  const businessName = valueFromText(text, ['Nama Bisnis','Nama Usaha','Business Name','Company','Nama Coffee','Nama Cafe']);
  const outletName = valueFromText(text, ['Outlet','Nama Outlet','Cabang','Branch','Lokasi']);
  const period = valueFromText(text, ['Periode','Period','Bulan','Month']);
  const revenue = parseAmount(valueFromText(text, ['Revenue','Sales','Penjualan Bersih','Penjualan','Omzet','Omset','Total Sales']));
  const cogs = parseAmount(valueFromText(text, ['COGS','HPP','Cost of Goods Sold','Harga Pokok Penjualan']));
  const labor = parseAmount(valueFromText(text, ['Labor','Labour','Payroll','Gaji','Beban Gaji','Tenaga Kerja']));
  const opex = parseAmount(valueFromText(text, ['OPEX','Operating Expense','Beban Operasional','Biaya Operasional']));
  const result = calculateAvailableFinance(buildIntakeResult({businessName,outletName,period,revenue,cogs,labor,opex}));
  result.fields.forEach(f => { if (f.status === 'available') f.evidence = { sourceFile, rawValue: String(f.value ?? '') }; });
  return result;
}

// SECURITY NOTE (unresolved, tracked in SECURITY_KNOWN_ISSUES.md): the 'xlsx' package pinned in
// package.json (0.18.5) has two published high-severity advisories (GHSA-4r6h-8v6p-xvw6 prototype
// pollution, GHSA-5pgg-2g8v-p4x9 ReDoS) that are only patched in versions distributed via
// cdn.sheetjs.com — never republished to the public npm registry, so `npm install xlsx@latest`
// cannot fix this. Until someone with unrestricted network access installs the CDN-distributed
// build (or the app is migrated to an alternative library), this size cap is a partial mitigation
// only: it shrinks the worst-case input for the ReDoS path, it does NOT close the prototype
// pollution advisory. Do not remove this comment when "fixing" the dependency — replace it with a
// note of what was actually done.
const MAX_WORKBOOK_BYTES = 15 * 1024 * 1024;
export async function parseWorkbook(file: File, sourceIdentity=file.name): Promise<FileAdapterResult> {
  if (file.size > MAX_WORKBOOK_BYTES) {
    throw new Error(`File terlalu besar (maks ${MAX_WORKBOOK_BYTES / (1024*1024)}MB) untuk diproses.`);
  }
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const warnings: string[] = [];
  let combined: IntakeResult | null = null;
  let extractedRows = 0;
  let combinedIdentity: { businessName: string | null; outletName: string | null; period: string | null } | null = null;
  let mergeBlocked = false;
  const tabularRows: CanonicalPOSEventInput[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null }) as unknown[][];
    extractedRows += rows.length;
    if (!rows.length) continue;
    const headers = rows[0] ?? [];
    const indices = {
      businessName: findMappedField(headers, 'businessName'), outletName: findMappedField(headers, 'outletName'), period: findMappedField(headers, 'period'),
      revenue: findMappedField(headers, 'revenue'), cogs: findMappedField(headers, 'cogs'), labor: findMappedField(headers, 'labor'), opex: findMappedField(headers, 'opex')
    };
    const nonEmpty = rows.slice(1).filter((r: unknown[]) => r.some((v: unknown) => String(v ?? '').trim() !== ''));
    tabularRows.push(...mapTabularRows(headers, nonEmpty, file.name, sheetName, new Date(), sourceIdentity));
    const sum = (idx: number) => idx < 0 ? null : nonEmpty.map((r: unknown[]) => parseAmount(r[idx])).filter((v: number | null): v is number => v !== null).reduce((a: number,b: number)=>a+b,0);
    const first = (idx: number) => idx < 0 ? null : String(nonEmpty.find((r: unknown[]) => r[idx] !== null && String(r[idx]).trim() !== '')?.[idx] ?? '').trim() || null;
    const candidate = calculateAvailableFinance(buildIntakeResult({ businessName:first(indices.businessName), outletName:first(indices.outletName), period:first(indices.period), revenue:sum(indices.revenue), cogs:sum(indices.cogs), labor:sum(indices.labor), opex:sum(indices.opex) }));
    enrichMonthlyBreakdown(candidate, nonEmpty, headers, indices.period, indices.revenue, indices.cogs, indices.labor, indices.opex);
    candidate.fields.forEach((f) => { if (f.status === 'available') f.evidence = { sourceFile: file.name, sourceSheet: sheetName, rawValue: String(f.value ?? '') }; });
    const identity = { businessName: candidate.businessName.value, outletName: candidate.outletName.value };
    if (!combined) {
      combined = candidate;
      combinedIdentity = { ...identity, period: candidate.period.value };
    } else if (!mergeBlocked && combinedIdentity && identity.businessName === combinedIdentity.businessName && identity.outletName === combinedIdentity.outletName) {
      // Different periods within the same business/outlet are intentionally merged into one dataset,
      // while preserving monthlyBreakdown. Unrelated business/outlet contexts remain isolated.
      for (const key of ['revenue','cogs','labor','opex'] as const) {
        const target = combined[key]; const incoming = candidate[key];
        if (incoming.value !== null) { target.value = (target.value ?? 0) + incoming.value; target.status = 'available'; target.evidence = incoming.evidence; }
      }
      const allMonths=[...(combined.periods??[]),...(candidate.periods??[])].filter(Boolean);
      combined.periods=[...new Set(allMonths)].sort(); combined.periodCount=combined.periods.length; combined.periodStart=combined.periods[0]??null; combined.periodEnd=combined.periods.at(-1)??null;
      combined.period.value=combined.periods.length>1?`${combined.periods[0]} → ${combined.periods.at(-1)}`:(combined.periods[0]??null);
      const merged=new Map<string,any>();
      for(const m of [...(combined.monthlyBreakdown??[]),...(candidate.monthlyBreakdown??[])]) { const cur=merged.get(m.period)||{...m}; if(merged.has(m.period)){ for(const key of ['revenue','cogs','labor','opex'] as const){ if(m[key]!==null) cur[key]=(cur[key]??0)+m[key]; } cur.rowCount+=m.rowCount; cur.financeEvidence={revenue:(cur.financeEvidence?.revenue??0)+(m.financeEvidence?.revenue??0),cogs:(cur.financeEvidence?.cogs??0)+(m.financeEvidence?.cogs??0),labor:(cur.financeEvidence?.labor??0)+(m.financeEvidence?.labor??0),opex:(cur.financeEvidence?.opex??0)+(m.financeEvidence?.opex??0)}; } merged.set(m.period,cur); }
      combined.monthlyBreakdown=[...merged.values()].sort((a,b)=>a.period.localeCompare(b.period));
    } else if (!mergeBlocked) {
      mergeBlocked = true;
      warnings.push(`Workbook memiliki beberapa sheet dengan konteks bisnis/outlet/periode berbeda; TRACE tidak menjumlahkannya secara otomatis. Review sheet secara terpisah untuk mencegah double-counting atau pencampuran periode.`);
    }
  }
  if (!combined) warnings.push('Workbook tidak memiliki data yang dapat dipetakan.');
  if (combined) {
    const gross = combined.revenue.value !== null && combined.cogs.value !== null ? combined.revenue.value - combined.cogs.value : null;
    const op = gross !== null && combined.labor.value !== null && combined.opex.value !== null ? gross - combined.labor.value - combined.opex.value : null;
    const grossField = combined.fields.find((f) => f.key === 'grossProfit');
    const opField = combined.fields.find((f) => f.key === 'operatingProfit');
    if (gross !== null && grossField) grossField.value = gross;
    if (op !== null && opField) opField.value = op;
  }
  return { result: combined ?? buildIntakeResult({}), sourceType: file.name.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx', sheets: workbook.SheetNames, extractedRows, warnings, tabularRows };
}

export async function parseDocx(file: File): Promise<FileAdapterResult> {
  const mammoth = await import('mammoth');
  const buffer = await file.arrayBuffer();
  const out = await mammoth.extractRawText({ arrayBuffer: buffer });
  return { result: buildFromUnstructuredText(out.value, file.name), sourceType: 'docx', warnings: out.messages.map((m: { message: string }) => m.message) };
}

export async function parsePdf(file: File, onProgress?: (message: string) => void): Promise<FileAdapterResult> {
  const pdfjs = await import('pdfjs-dist');
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const chunks: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    onProgress?.(`Membaca PDF halaman ${pageNo}/${pdf.numPages}…`);
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    chunks.push(content.items.map((item: any) => String(item.str ?? '')).join(' '));
  }
  let text = chunks.join('\n');
  const warnings: string[] = [];
  if (!text.trim()) {
    // Automatic OCR fallback for scanned PDFs. The first pass uses the text
    // layer because it is faster and preserves document structure; only pages
    // without a usable text layer are rendered and sent through Tesseract.
    const Tesseract = await import('tesseract.js');
    const ocrChunks: string[] = [];
    const scale = 1.5;
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      onProgress?.(`OCR PDF halaman ${pageNo}/${pdf.numPages}…`);
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const out = await Tesseract.recognize(canvas, 'ind+eng', { logger: (m: any) => { if (m.status) onProgress?.(`OCR ${m.status}${typeof m.progress === 'number' ? ` ${Math.round(m.progress*100)}%` : ''}`); } });
      ocrChunks.push(out.data.text || '');
    }
    text = ocrChunks.join('\n');
    if (!text.trim()) warnings.push('OCR PDF tidak menemukan teks yang dapat dibaca.');
    else warnings.push('PDF tidak memiliki text layer; TRACE menggunakan OCR otomatis.');
  }
  const result = buildFromUnstructuredText(text, file.name);
  return { result, sourceType: 'pdf', extractedRows: pdf.numPages, warnings };
}

export async function parseText(file: File): Promise<FileAdapterResult> {
  const text = await file.text();
  const result = file.name.toLowerCase().endsWith('.json') ? parseJsonText(text, file.name) : buildFromUnstructuredText(text, file.name);
  return { result, sourceType: file.name.split('.').pop()?.toLowerCase() ?? 'text', warnings: [] };
}

function parseJsonText(text: string, sourceFile: string): IntakeResult {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const get = (key: string) => Object.entries(data).find(([k]) => normalizeHeader(k) === normalizeHeader(key) || normalizeHeader(k).includes(normalizeHeader(key)))?.[1] ?? null;
    return calculateAvailableFinance(buildIntakeResult({ businessName:get('businessName') ?? get('nama bisnis'), outletName:get('outlet') ?? get('nama outlet'), period:get('period') ?? get('periode'), revenue:parseAmount(get('revenue') ?? get('sales') ?? get('penjualan')), cogs:parseAmount(get('cogs') ?? get('hpp')), labor:parseAmount(get('labor') ?? get('gaji')), opex:parseAmount(get('opex') ?? get('biaya operasional')) }));
  } catch { return buildFromUnstructuredText(text, sourceFile); }
}


export async function parseImage(file: File, onProgress?: (message: string) => void): Promise<FileAdapterResult> {
  const Tesseract = await import('tesseract.js');
  onProgress?.('OCR membaca gambar…');
  const out = await Tesseract.recognize(file, 'ind+eng', { logger: (m: { status?: string; progress?: number }) => { if (m.status) onProgress?.(`OCR: ${m.status}${typeof m.progress === 'number' ? ` ${Math.round(m.progress * 100)}%` : ''}`); } });
  return { result: buildFromUnstructuredText(out.data.text, file.name), sourceType: 'image', warnings: out.data.text.trim() ? [] : ['OCR tidak menemukan teks yang dapat dibaca.'] };
}
