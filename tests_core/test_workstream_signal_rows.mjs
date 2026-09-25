import assert from 'node:assert/strict';
import { buildClientHealth } from '../dist/core/portfolioHealth.js';
import { diagnoseClient, summarizePlan } from '../dist/core/workstreams.js';
import { signalsFromRows, signalWindow, failedSignals, SIGNAL_RESOURCES } from '../dist/core/workstreamSignals.js';

const NOW = '2026-09-22T00:00:00.000Z';
const C = 'c1', OTHER = 'c2';
const sig = (data, o = {}) => signalsFromRows({ clientId: C, data, unavailable: [], period: '', nowIso: NOW, ...o });

const pos = (id, type, at, org = C, amount = 10000) => ({ id, organization_id: org, event_type: type, amount, occurred_at: at });
const salesEv = (prefix, day, n, org = C) => Array.from({ length: n }, (_, i) => pos(`${prefix}${i}`, 'sale', `${day}T10:00:00.000Z`, org));

// ───────────── signalWindow ─────────────
const w = signalWindow('2026-08', NOW);
assert.equal(w.startMs, Date.UTC(2026, 7, 1));
assert.equal(w.endMs, Date.UTC(2026, 8, 1));
assert.equal(w.prevStartMs, Date.UTC(2026, 6, 1));
assert.equal(w.checkFreshness, false, 'bulan lampau: jeda data bukan masalah');
assert.equal(signalWindow('2026-09', NOW).checkFreshness, true, 'bulan berjalan: data basi harus terdeteksi');
const rolling = signalWindow('', NOW);
assert.equal(rolling.endMs - rolling.startMs, 30 * 86_400_000 + 1);
assert.equal(rolling.checkFreshness, true);
assert.equal(signalWindow('', 'bukan-tanggal'), null);
assert.equal(signalWindow('2026-13', NOW).checkFreshness, true, 'periode tidak valid jatuh ke jendela 30 hari, bukan crash');
assert.equal(signalWindow('2026-01', NOW).prevStartMs, Date.UTC(2025, 11, 1), 'Januari → pembanding Desember tahun lalu');

// ───────────── data kosong ≠ sehat ─────────────
const empty = sig({});
for (const k of ['inventory', 'erp', 'social', 'cash']) assert.equal(empty[k].status, 'nodata', `${k}: dataset kosong harus nodata, bukan ok`);

// ───────────── POS: isolasi klien & jendela periode ─────────────
const leak = sig({ pos_events: [...salesEv('a', '2026-09-20', 10), ...salesEv('b', '2026-09-20', 5, OTHER), pos('cd', 'cash_discrepancy', '2026-09-20T22:00:00.000Z', OTHER, 99999)] });
assert.equal(leak.erp.status, 'ok', 'selisih kas milik klien lain tidak boleh menyalakan jalur klien ini');
assert.match(leak.erp.reason, /^10 transaksi POS/);

const augData = { pos_events: [...salesEv('a', '2026-08-05', 10), ...salesEv('s', '2026-09-10', 3)] };
const augPeriod = sig(augData, { period: '2026-08' });
assert.equal(augPeriod.erp.status, 'ok');
assert.match(augPeriod.erp.reason, /^10 transaksi POS/, 'event bulan lain tidak ikut');
assert.equal(sig({ pos_events: salesEv('a', '2026-09-01', 10) }, { period: '2026-09' }).erp.status, 'flagged', 'bulan berjalan tanpa data baru → basi');
assert.equal(sig({ pos_events: salesEv('a', '2026-08-05', 10) }, { period: '2026-08' }).erp.status, 'ok', 'bulan lampau yang sama tidak dianggap basi');

// void 20% vs baseline bulan sebelumnya 10% → MEDIUM
const voidData = { pos_events: [
  ...salesEv('c', '2026-08-10', 10), pos('v1', 'void', '2026-08-10T11:00:00.000Z'), pos('v2', 'void', '2026-08-10T12:00:00.000Z'),
  ...salesEv('p', '2026-07-10', 10), pos('pv', 'void', '2026-07-10T11:00:00.000Z')
] };
const voidSig = sig(voidData, { period: '2026-08' });
assert.equal(voidSig.erp.status, 'flagged');
assert.equal(voidSig.erp.severity, 'medium');

// ───────────── Inventory: jendela, isolasi, angka ─────────────
const mv = (id, item, type, qty, at, org = C, cost = null) => ({ id, organization_id: org, item_id: item, movement_type: type, qty, unit_cost: cost, occurred_at: at });
const rcp = (product, item, org = C) => ({ organization_id: org, product_id: product, item_id: item, qty_per_sale: 1 });
const sl = (id, product, qty, at, client = C) => ({ id, client_id: client, product_id: product, qty, sold_at: at });
const invData = {
  inventory_movements: [mv('m1', 'A', 'sale_consumption', 30, '2026-09-10T00:00:00.000Z', C, 1000), mv('mOld', 'A', 'sale_consumption', 500, '2026-06-01T00:00:00.000Z'), mv('mX', 'A', 'sale_consumption', 999, '2026-09-10T00:00:00.000Z', OTHER)],
  inventory_recipes: [rcp('P', 'A'), rcp('P', 'A', OTHER)],
  sales: [sl('s1', 'P', 20, '2026-09-11T00:00:00.000Z'), sl('sOld', 'P', 1000, '2026-06-01T00:00:00.000Z'), sl('sX', 'P', 1000, '2026-09-11T00:00:00.000Z', OTHER), { id: 'noprod', client_id: C, product_id: null, qty: 50, sold_at: '2026-09-11T00:00:00.000Z' }]
};
const inv = sig(invData);
assert.equal(inv.inventory.status, 'flagged');
assert.match(inv.inventory.reason, /1 dari 1 item stok selisih ≥20%/);
assert.match(inv.inventory.reason, /Rp 10\.000/, '|30 − 20| × 1000: baris lama & milik klien lain tidak ikut');
// string numerik dari PostgREST diterima
assert.equal(sig({ ...invData, inventory_movements: [mv('m1', 'A', 'sale_consumption', '30', '2026-09-10T00:00:00.000Z', C, '1000')] }).inventory.status, 'flagged');

// ───────────── Sosial ─────────────
const acct = (o = {}) => ({ id: 'a1', client_id: C, is_internal_account: false, platform: 'instagram', platform_account_id: 'x', status: 'connected', last_synced_at: '2026-09-21T00:00:00.000Z', ...o });
const item = (id, at, o = {}) => ({ id, client_id: C, platform: 'instagram', content_type: 'post', posted_at: at, ...o });
const five = Array.from({ length: 5 }, (_, i) => item(`p${i}`, '2026-09-15T08:00:00.000Z'));
assert.equal(sig({ social_accounts: [acct()], content_items: five }).social.status, 'ok');
assert.equal(sig({ social_accounts: [acct({ is_internal_account: true })], content_items: five }).social.status, 'nodata', 'akun internal Trace bukan akun klien');
assert.equal(sig({ social_accounts: [acct({ client_id: OTHER })], content_items: five }).social.status, 'nodata');
const withStory = sig({ social_accounts: [acct()], content_items: [item('s', '2026-09-15T00:00:00.000Z', { content_type: 'story' }), item('n', null), ...five.slice(0, 3)] });
assert.match(withStory.social.reason, /Hanya 4 posting|4 posting/, 'story dihitung sebagai "other"; posting tanpa tanggal dibuang, bukan dihitung');

// ───────────── AR/AP ─────────────
const arInv = (id, due, amount, client = C) => ({ id, client_id: client, customer_name: 'PT X', invoice_date: '2026-05-01', due_date: due, amount });
const cashData = { ar_invoices: [arInv('i1', '2026-06-01', 10000000), arInv('i2', '2026-10-01', '10000000'), arInv('ix', '2026-06-01', 99999999, OTHER)], ar_payments: [], ap_bills: [], ap_payments: [] };
const cashSig = sig(cashData);
assert.equal(cashSig.cash.status, 'flagged');
assert.match(cashSig.cash.reason, /Piutang Rp 20\.000\.000, 50%/, 'invoice klien lain tidak ikut; amount string diterima');

// ───────────── resource tidak tersedia ≠ kosong ─────────────
const posDown = sig({ pos_events: salesEv('a', '2026-09-20', 10), ...invData }, { unavailable: ['pos_events'] });
assert.equal(posDown.erp.status, 'nodata');
assert.match(posDown.erp.reason, /pos_events tidak dapat dimuat/);
assert.equal(posDown.inventory.status, 'flagged', 'sinyal lain tidak ikut mati');
const apDown = sig(cashData, { unavailable: ['ap_bills'] });
assert.equal(apDown.cash.status, 'nodata', 'AP gagal dimuat tidak boleh dibaca sebagai "belum ada utang"');
assert.match(apDown.cash.reason, /ap_bills/);

// ───────────── tanggal referensi rusak ─────────────
const badNow = signalsFromRows({ clientId: C, data: { pos_events: salesEv('a', '2026-09-20', 10), ...invData, ...cashData }, unavailable: [], period: '', nowIso: 'rusak' });
for (const k of ['inventory', 'erp', 'social', 'cash']) assert.equal(badNow[k].status, 'nodata', `${k}: nowIso rusak → nodata`);

// ───────────── integrasi: gagal muat → jalur tetap manual + alasan; tidak pernah "stabil" ─────────────
const rec = (period, category, amount) => ({ id: `${period}-${category}`, period, category, amount });
const full = (p, rev, cogs, labor, opex) => [rec(p, 'revenue', rev), rec(p, 'cogs', cogs), rec(p, 'labor', labor), rec(p, 'opex', opex)];
const healthyRecs = ['2026-06', '2026-07', '2026-08'].flatMap(p => full(p, 100e6, 30e6, 15e6, 10e6));
const diag = (records, signals, extra = {}) => diagnoseClient(buildClientHealth({ id: C, name: 'C1', records, alerts: [], ...extra }), records, signals);
const failed = diag(healthyRecs, failedSignals('HTTP 502'));
assert.deepEqual(failed.filter(f => f.status === 'manual').map(f => f.key).sort(), ['branding', 'erp', 'inventory', 'social']);
assert.match(failed.find(f => f.key === 'erp').reason, /gagal dimuat \(HTTP 502\)/);
assert.equal(failed.find(f => f.key === 'profit').reason, diag(healthyRecs).find(f => f.key === 'profit').reason, 'cash nodata tidak mengubah jalur profit');

// finance gagal dimuat + sinyal operasional sehat ≠ "Stabil"
const okSignals = { erp: { status: 'ok', severity: null, reason: 'POS masuk rutin.' }, inventory: { status: 'ok', severity: null, reason: 'Stok wajar.' } };
const financeBroken = diag([], okSignals, { loadError: 'HTTP 502' });
assert.equal(summarizePlan(financeBroken).mode, 'belum', 'finance tidak terbaca → belum bisa dinilai, walau sinyal lain ok');
assert.equal(summarizePlan(diag(healthyRecs, okSignals)).mode, 'stabil', 'finance terbaca + sinyal ok → stabil tetap bisa');

// daftar resource: tanpa duplikat
assert.equal(new Set(SIGNAL_RESOURCES).size, SIGNAL_RESOURCES.length);
console.log('PASS workstream signal rows (jendela periode, isolasi klien, unavailable ≠ kosong, integrasi)');
