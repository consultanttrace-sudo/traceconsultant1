/**
 * Sinyal otomatis untuk jalur kerja yang sebelumnya hanya "perlu asesmen manual":
 * Inventory & Purchasing, ERP/POS, Media Sosial & Konten, plus AR/AP nyata untuk jalur Cashflow.
 *
 * Aturan yang dijaga di sini:
 * - Fungsi murni: waktu diteruskan lewat `nowIso`/`asOfIso`, tidak ada Date.now() dan tidak ada akses jaringan.
 * - Data yang tidak ada ≠ 0 dan ≠ sehat: hasilnya `nodata` dengan alasan spesifik.
 * - Anomali POS bukan bukti fraud; kalimat itu ikut ke alasan supaya konsultan tidak menuduh.
 * - Semua ambang ada di `SIGNAL_THRESHOLDS` dan BELUM dikonfirmasi user (lihat STATUS.md).
 */
import type { SignalResult, WorkstreamSignals } from './workstreams.js';
import { calculateInventoryVariance, type InventoryMovement, type RecipeComponent } from './inventoryIntelligence.js';
import { analyzePOSHealth, type POSEvent } from './posHealth.js';
import type { SocialAccount, ContentItem } from './content.js';
import { buildArAging, type ArInvoice, type ArPayment } from './accountsReceivable.js';
import { buildApAging, type ApBill, type ApPayment } from './accountsPayable.js';

export const SIGNAL_THRESHOLDS = {
  inventory: { highVarianceShareHigh: 0.3, watchShareLow: 0.5 },
  pos: { staleDays: 7 },
  social: { freshSyncDays: 7, windowDays: 30, quietPosts: 0, thinPosts: 4 },
  cash: { arOverdue60ShareMedium: 0.3, arOverdue60ShareHigh: 0.5, arOver90ShareHigh: 0.25, apOverdue30ShareMedium: 0.3 }
} as const;

const DAY_MS = 86_400_000;
const rupiah = (n: number) => `Rp ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const pct0 = (n: number) => `${Math.round(n * 100)}%`;
const ts = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};
type Sev = 'high' | 'medium' | 'low';
const RANK: Record<Sev, number> = { low: 1, medium: 2, high: 3 };
const maxSev = (xs: Sev[]): Sev => xs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'low' as Sev);
const nodata = (reason: string): SignalResult => ({ status: 'nodata', severity: null, reason });

/** Inventory & Purchasing — selisih pemakaian aktual vs seharusnya (resep × penjualan). */
export function inventorySignal(input: {
  movements: InventoryMovement[];
  recipes: RecipeComponent[];
  sales: Array<{ productId: string; qty: number; id: string }>;
}): SignalResult {
  const T = SIGNAL_THRESHOLDS.inventory;
  if (!input.movements.length) return nodata('Belum ada pergerakan stok tercatat.');
  if (!input.recipes.length) return nodata('Belum ada resep, jadi pemakaian bahan yang seharusnya tidak bisa dihitung.');
  const all = calculateInventoryVariance(input.movements, input.recipes, input.sales);
  const measurable = all.filter(v => v.status !== 'INSUFFICIENT_DATA');
  const skipped = all.length - measurable.length;
  if (!measurable.length) return nodata('Belum ada item yang bisa dibandingkan (butuh resep dan penjualan produk terkait).');
  const high = measurable.filter(v => v.status === 'HIGH_VARIANCE').sort((a, b) => (b.variancePct ?? 0) - (a.variancePct ?? 0));
  const watch = measurable.filter(v => v.status === 'WATCH');
  const coverage = skipped ? ` ${skipped} item lain belum bisa dibandingkan.` : '';
  if (high.length) {
    const priced = high.filter(v => v.estimatedImpact !== null);
    const impact = priced.length ? ` Estimasi dampak ${rupiah(priced.reduce((s, v) => s + (v.estimatedImpact as number), 0))}${priced.length < high.length ? ' (item tanpa harga satuan tidak dihitung)' : ''}.` : '';
    const top = high.slice(0, 3).map(v => v.itemId).join(', ');
    return {
      status: 'flagged',
      severity: high.length / measurable.length >= T.highVarianceShareHigh ? 'high' : 'medium',
      reason: `${high.length} dari ${measurable.length} item stok selisih ≥20% dari pemakaian seharusnya (teratas: ${top}).${impact}${coverage}`
    };
  }
  if (watch.length / measurable.length >= T.watchShareLow) {
    return { status: 'flagged', severity: 'low', reason: `${watch.length} dari ${measurable.length} item stok selisih 10–20% dari pemakaian seharusnya.${coverage}` };
  }
  return { status: 'ok', severity: null, reason: `Selisih stok wajar pada ${measurable.length} item yang bisa dibandingkan.${coverage}` };
}

/**
 * ERP / POS — apakah POS masuk rutin dan ada anomali di atas ambang.
 * `checkFreshness=false` saat meninjau periode lampau (jeda dari "sekarang" bukan masalah).
 */
export function posSignal(input: { events: POSEvent[]; previousEvents?: POSEvent[]; nowIso: string; checkFreshness?: boolean }): SignalResult {
  const T = SIGNAL_THRESHOLDS.pos;
  const previous = input.previousEvents ?? [];
  const sales = input.events.filter(e => e.type === 'sale').length;
  if (!sales) return nodata('Belum ada event penjualan POS pada periode ini.');
  const issues: Array<{ sev: Sev; text: string }> = [];

  const now = ts(input.nowIso);
  const times = input.events.map(e => ts(e.occurredAt)).filter((t): t is number => t !== null);
  const latest = times.length ? Math.max(...times) : null;
  const daysSince = now !== null && latest !== null ? Math.floor((now - latest) / DAY_MS) : null;
  if ((input.checkFreshness ?? true) && daysSince !== null && daysSince > T.staleDays) {
    issues.push({ sev: 'medium', text: `Data POS terakhir masuk ${daysSince} hari lalu (batas ${T.staleDays} hari).` });
  }

  const result = analyzePOSHealth(input.events, previous);
  // Anomali tanpa baseline pembanding (INSUFFICIENT DATA) dan fluktuasi ringan (LOW) bukan dasar menyalakan jalur.
  const meaningful = result.anomalies.filter(a => a.confidence !== 'INSUFFICIENT DATA' && a.severity !== 'LOW');
  if (meaningful.length) {
    const sev: Sev = maxSev(meaningful.map(a => (a.severity === 'MEDIUM' ? 'medium' : 'high')));
    const titles = [...new Set(meaningful.map(a => a.title))].slice(0, 2).join('; ');
    issues.push({ sev, text: `${meaningful.length} anomali POS di atas ambang (${titles}). Anomali bukan bukti fraud, perlu ditinjau.` });
  }

  if (issues.length) return { status: 'flagged', severity: maxSev(issues.map(i => i.sev)), reason: issues.map(i => i.text).join(' ') };
  const baseline = previous.length ? '' : ' Baseline periode sebelumnya belum ada, jadi rasio void/refund/diskon belum bisa dinilai.';
  const lastSeen = daysSince === null ? '' : `, terakhir ${daysSince} hari lalu`;
  return { status: 'ok', severity: null, reason: `${sales} transaksi POS tercatat${lastSeen}; tidak ada anomali di atas ambang.${baseline}` };
}

/**
 * Media Sosial & Konten — hanya yang bisa diukur otomatis: akun terhubung, sinkron segar, frekuensi posting.
 * Rapi/tidaknya feed dan daya tarik tetap penilaian manual (dinyatakan di alasan).
 */
export function socialSignal(input: { clientId: string; accounts: SocialAccount[]; content: ContentItem[]; nowIso: string }): SignalResult {
  const T = SIGNAL_THRESHOLDS.social;
  const now = ts(input.nowIso);
  if (now === null) return nodata('Tanggal referensi tidak valid, aktivitas konten tidak bisa dinilai.');
  const accounts = input.accounts.filter(a => a.clientId === input.clientId && !a.isInternalAccount);
  if (!accounts.length) return nodata('Belum ada akun sosial klien yang terhubung.');
  const connected = accounts.filter(a => a.status === 'connected');
  if (!connected.length) return nodata('Akun sosial klien terputus (expired/revoked), data konten tidak bisa dibaca.');
  const fresh = connected.filter(a => { const t = ts(a.lastSyncedAt); return t !== null && now - t <= T.freshSyncDays * DAY_MS; });
  if (!fresh.length) return nodata(`Akun terhubung tetapi belum sinkron dalam ${T.freshSyncDays} hari, jumlah posting tidak bisa dipercaya.`);

  const platforms = new Set(fresh.map(a => a.platform));
  const since = now - T.windowDays * DAY_MS;
  const posts = input.content.filter(c => {
    if (c.clientId !== input.clientId || !platforms.has(c.platform)) return false;
    const t = ts(c.postedAt);
    return t !== null && t >= since && t <= now;
  }).length;
  const scope = `${platforms.size} platform`;
  const manualNote = ' Rapi/tidaknya feed dan daya tarik konten tetap perlu asesmen langsung.';
  if (posts <= T.quietPosts) return { status: 'flagged', severity: 'medium', reason: `Tidak ada posting dalam ${T.windowDays} hari terakhir (${scope}, sinkron segar).${manualNote}` };
  if (posts < T.thinPosts) return { status: 'flagged', severity: 'low', reason: `Hanya ${posts} posting dalam ${T.windowDays} hari terakhir (${scope}), di bawah ${T.thinPosts}.${manualNote}` };
  return { status: 'ok', severity: null, reason: `${posts} posting dalam ${T.windowDays} hari terakhir (${scope}).${manualNote}` };
}

/** Cashflow nyata dari piutang (AR) dan utang supplier (AP); dipakai memperkuat jalur Profitabilitas & Kebocoran Cashflow. */
export function cashSignal(input: {
  clientId: string;
  invoices: ArInvoice[]; arPayments: ArPayment[];
  bills: ApBill[]; apPayments: ApPayment[];
  asOfIso: string;
}): SignalResult {
  const T = SIGNAL_THRESHOLDS.cash;
  if (ts(input.asOfIso) === null) return nodata('Tanggal referensi tidak valid, umur piutang/utang tidak bisa dihitung.');
  const invoices = input.invoices.filter(i => i.clientId === input.clientId && Number.isFinite(i.amount));
  const bills = input.bills.filter(b => b.clientId === input.clientId && Number.isFinite(b.amount));
  if (!invoices.length && !bills.length) return nodata('Belum ada data piutang maupun utang supplier.');

  const issues: Array<{ sev: Sev; text: string }> = [];
  const notes: string[] = [];

  if (invoices.length) {
    const ar = buildArAging(invoices, input.arPayments.filter(p => Number.isFinite(p.amount)), input.asOfIso);
    if (ar.totalOutstanding > 0) {
      const over60 = ar.buckets['61-90'] + ar.buckets['>90'];
      const s60 = over60 / ar.totalOutstanding;
      const s90 = ar.buckets['>90'] / ar.totalOutstanding;
      if (s60 >= T.arOverdue60ShareHigh || s90 >= T.arOver90ShareHigh) issues.push({ sev: 'high', text: `Piutang ${rupiah(ar.totalOutstanding)}, ${pct0(s60)} (${rupiah(over60)}) lewat jatuh tempo >60 hari.` });
      else if (s60 >= T.arOverdue60ShareMedium) issues.push({ sev: 'medium', text: `Piutang ${rupiah(ar.totalOutstanding)}, ${pct0(s60)} (${rupiah(over60)}) lewat jatuh tempo >60 hari.` });
      else notes.push(`Piutang ${rupiah(ar.totalOutstanding)}, ${pct0(s60)} lewat >60 hari.`);
    } else notes.push('Tidak ada piutang berjalan.');
  } else notes.push('Data piutang belum ada.');

  if (bills.length) {
    const ap = buildApAging(bills, input.apPayments.filter(p => Number.isFinite(p.amount)), input.asOfIso);
    if (ap.totalOutstanding > 0) {
      const over30 = ap.buckets['31-60'] + ap.buckets['61-90'] + ap.buckets['>90'];
      const s30 = over30 / ap.totalOutstanding;
      if (s30 >= T.apOverdue30ShareMedium) issues.push({ sev: 'medium', text: `Utang supplier ${rupiah(ap.totalOutstanding)}, ${pct0(s30)} (${rupiah(over30)}) telat dibayar >30 hari.` });
      else notes.push(`Utang supplier ${rupiah(ap.totalOutstanding)}, ${pct0(s30)} telat >30 hari.`);
    } else notes.push('Tidak ada utang supplier berjalan.');
  } else notes.push('Data utang supplier belum ada.');

  if (issues.length) return { status: 'flagged', severity: maxSev(issues.map(i => i.sev)), reason: issues.map(i => i.text).join(' ') };
  return { status: 'ok', severity: null, reason: notes.join(' ') };
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter baris mentah (hasil /api/trace-data per klien) → sinyal. Murni & bisa dites tanpa React.
// ─────────────────────────────────────────────────────────────────────────────

/** Resource yang dibaca untuk sinyal. Harus ada di `TraceResource` (_shared.tsx), RESOURCES trace-data.js, dan trace_read_client_dataset (dicek tes statis). */
export const SIGNAL_RESOURCES = [
  'pos_events', 'inventory_movements', 'inventory_recipes', 'sales',
  'ar_invoices', 'ar_payments', 'ap_bills', 'ap_payments',
  'social_accounts', 'content_items'
] as const;
export type SignalResourceName = (typeof SIGNAL_RESOURCES)[number];

const NEEDS = {
  inventory: ['inventory_movements', 'inventory_recipes', 'sales'],
  erp: ['pos_events'],
  social: ['social_accounts', 'content_items'],
  cash: ['ar_invoices', 'ar_payments', 'ap_bills', 'ap_payments']
} as const satisfies Record<'inventory' | 'erp' | 'social' | 'cash', readonly SignalResourceName[]>;

export interface SignalWindow { startMs: number; endMs: number; prevStartMs: number; prevEndMs: number; checkFreshness: boolean }

/**
 * Jendela waktu untuk sinyal POS & inventory. Periode "YYYY-MM" = bulan itu vs bulan sebelumnya (jeda data dari "sekarang"
 * hanya dihukum bila periode = bulan berjalan). Tanpa periode = 30 hari terakhir vs 30 hari sebelumnya.
 * Sinyal sosial & AR/AP selalu "per hari ini" (kondisi saat ini), tidak mengikuti periode.
 */
export function signalWindow(period: string, nowIso: string): SignalWindow | null {
  const now = ts(nowIso);
  if (now === null) return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]);
    const startMs = Date.UTC(y, mo - 1, 1), endMs = Date.UTC(y, mo, 1);
    return { startMs, endMs, prevStartMs: Date.UTC(y, mo - 2, 1), prevEndMs: startMs, checkFreshness: now >= startMs && now < endMs };
  }
  return { startMs: now - 30 * DAY_MS, endMs: now + 1, prevStartMs: now - 60 * DAY_MS, prevEndMs: now - 30 * DAY_MS, checkFreshness: true };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const rowsOf = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const optStr = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : String(v));
const CONTENT_TYPES = ['reel', 'post', 'video'] as const;

/** Semua sinyal gagal dimuat → tiap jalur tetap "manual" dengan alasan jelas, bukan diam-diam dianggap tanpa masalah. */
export function failedSignals(message: string): WorkstreamSignals {
  const reason = `Data operasional klien gagal dimuat (${message}), sinyal ini belum bisa dihitung.`;
  return { inventory: nodata(reason), erp: nodata(reason), social: nodata(reason), cash: nodata(reason) };
}

/**
 * Ubah dataset satu klien (kolom snake_case dari trace_read_client_dataset) menjadi sinyal jalur kerja.
 * - Baris milik klien lain dibuang (defensif; API sudah memfilter server-side).
 * - Resource yang `unavailable` (timeout / terlalu besar) ≠ kosong: sinyalnya nodata, bukan "belum ada data".
 */
export function signalsFromRows(input: { clientId: string; data: Record<string, unknown>; unavailable: readonly string[]; period: string; nowIso: string }): WorkstreamSignals {
  const { clientId, data, nowIso } = input;
  const down = new Set(input.unavailable.map(String));
  const missingOf = (key: keyof typeof NEEDS) => NEEDS[key].filter(r => down.has(r));
  const unavailableSignal = (missing: string[]) => nodata(`Data ${missing.join(', ')} tidak dapat dimuat (timeout atau terlalu besar), sinyal ini belum bisa dihitung.`);
  const owned = (resource: SignalResourceName, field: 'client_id' | 'organization_id') => rowsOf(data[resource]).filter(r => str(r[field]) === clientId);
  const win = signalWindow(input.period, nowIso);
  const badTime = nodata('Tanggal referensi tidak valid, sinyal ini belum bisa dihitung.');
  const within = (t: number | null, from: number, to: number) => t !== null && t >= from && t < to;
  const out: WorkstreamSignals = {};

  const invDown = missingOf('inventory');
  if (invDown.length) out.inventory = unavailableSignal(invDown);
  else if (!win) out.inventory = badTime;
  else {
    const movements: InventoryMovement[] = owned('inventory_movements', 'organization_id')
      .filter(r => within(ts(optStr(r.occurred_at)), win.startMs, win.endMs) && Number.isFinite(Number(r.qty)))
      .map(r => ({
        id: str(r.id), itemId: str(r.item_id), outletId: optStr(r.outlet_id), type: str(r.movement_type) as InventoryMovement['type'],
        qty: Number(r.qty), unitCost: r.unit_cost === null || r.unit_cost === undefined ? null : Number.isFinite(Number(r.unit_cost)) ? Number(r.unit_cost) : null,
        occurredAt: str(r.occurred_at)
      }));
    const recipes: RecipeComponent[] = owned('inventory_recipes', 'organization_id')
      .filter(r => Number.isFinite(Number(r.qty_per_sale)))
      .map(r => ({ productId: str(r.product_id), itemId: str(r.item_id), qtyPerSale: Number(r.qty_per_sale) }));
    const sales = owned('sales', 'client_id')
      .filter(r => !!optStr(r.product_id) && Number.isFinite(Number(r.qty)) && within(ts(optStr(r.sold_at)), win.startMs, win.endMs))
      .map(r => ({ productId: str(r.product_id), qty: Number(r.qty), id: str(r.id) }));
    out.inventory = inventorySignal({ movements, recipes, sales });
  }

  const posDown = missingOf('erp');
  if (posDown.length) out.erp = unavailableSignal(posDown);
  else if (!win) out.erp = badTime;
  else {
    const all: POSEvent[] = owned('pos_events', 'organization_id')
      .filter(r => Number.isFinite(Number(r.amount)) && ts(optStr(r.occurred_at)) !== null)
      .map(r => ({
        id: str(r.id), organizationId: str(r.organization_id), outletId: optStr(r.outlet_id), employeeId: optStr(r.employee_id),
        cashierId: optStr(r.cashier_id), productId: optStr(r.product_id), type: str(r.event_type) as POSEvent['type'],
        amount: Number(r.amount), occurredAt: str(r.occurred_at), sourceRecordId: optStr(r.source_record_id)
      }));
    const at = (e: POSEvent) => ts(e.occurredAt);
    out.erp = posSignal({
      events: all.filter(e => within(at(e), win.startMs, win.endMs)),
      previousEvents: all.filter(e => within(at(e), win.prevStartMs, win.prevEndMs)),
      nowIso, checkFreshness: win.checkFreshness
    });
  }

  const socDown = missingOf('social');
  if (socDown.length) out.social = unavailableSignal(socDown);
  else {
    const accounts: SocialAccount[] = owned('social_accounts', 'client_id').map(r => ({
      id: str(r.id), clientId: str(r.client_id), isInternalAccount: r.is_internal_account === true,
      platform: str(r.platform) as SocialAccount['platform'], platformAccountId: str(r.platform_account_id),
      status: str(r.status) as SocialAccount['status'], lastSyncedAt: optStr(r.last_synced_at) ?? null
    }));
    const content: ContentItem[] = owned('content_items', 'client_id')
      .filter(r => ts(optStr(r.posted_at)) !== null)
      .map(r => ({
        id: str(r.id), clientId: str(r.client_id), platform: str(r.platform) as ContentItem['platform'],
        contentType: (CONTENT_TYPES as readonly string[]).includes(str(r.content_type)) ? (str(r.content_type) as ContentItem['contentType']) : 'other',
        postedAt: str(r.posted_at)
      }));
    out.social = socialSignal({ clientId, accounts, content, nowIso });
  }

  const cashDown = missingOf('cash');
  if (cashDown.length) out.cash = unavailableSignal(cashDown);
  else {
    out.cash = cashSignal({
      clientId,
      invoices: owned('ar_invoices', 'client_id').map(r => ({ id: str(r.id), clientId: str(r.client_id), customerName: str(r.customer_name), invoiceDate: str(r.invoice_date), dueDate: str(r.due_date), amount: Number(r.amount) })),
      arPayments: owned('ar_payments', 'client_id').map(r => ({ invoiceId: str(r.invoice_id), amount: Number(r.amount), paidDate: str(r.paid_date) })),
      bills: owned('ap_bills', 'client_id').map(r => ({ id: str(r.id), clientId: str(r.client_id), vendorName: str(r.vendor_name), billDate: str(r.bill_date), dueDate: str(r.due_date), amount: Number(r.amount) })),
      apPayments: owned('ap_payments', 'client_id').map(r => ({ billId: str(r.bill_id), amount: Number(r.amount), paidDate: str(r.paid_date) })),
      asOfIso: nowIso.slice(0, 10)
    });
  }
  return out;
}
