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
    candidate.fields.forEach((f) => { if (f.status === 'available') f.evidence = { sourceFile: file.name, sourceSheet: sheetName, rawValue: String(f.value ?? '') }; });
    const identity = { businessName: candidate.businessName.value, outletName: candidate.outletName.value, period: candidate.period.value };
    if (!combined) {
      combined = candidate;
      combinedIdentity = identity;
    } else if (!mergeBlocked && combinedIdentity && identity.businessName === combinedIdentity.businessName && identity.outletName === combinedIdentity.outletName && identity.period === combinedIdentity.period) {
      // Sheets are merged only when their business/outlet/period identity matches.
      // This prevents silently summing unrelated months, outlets, or businesses.
      for (const key of ['revenue','cogs','labor','opex'] as const) {
        const target = combined[key]; const incoming = candidate[key];
        if (incoming.value !== null) { target.value = (target.value ?? 0) + incoming.value; target.status = 'available'; target.evidence = incoming.evidence; }
      }
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
  const text = chunks.join('\n');
  const result = buildFromUnstructuredText(text, file.name);
  const warnings = text.trim() ? [] : ['PDF tidak memiliki text layer. OCR diperlukan untuk PDF hasil scan.'];
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
