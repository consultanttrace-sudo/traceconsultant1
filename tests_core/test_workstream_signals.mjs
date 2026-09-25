import assert from 'node:assert/strict';
import { buildClientHealth } from '../dist/core/portfolioHealth.js';
import { diagnoseClient, summarizePlan, taskDraftFromFinding, WORKSTREAMS } from '../dist/core/workstreams.js';
import { inventorySignal, posSignal, socialSignal, cashSignal, SIGNAL_THRESHOLDS } from '../dist/core/workstreamSignals.js';

const NOW = '2026-09-22T00:00:00.000Z';

// ───────────── Inventory ─────────────
const mv = (id, itemId, type, qty, unitCost = null) => ({ id, itemId, type, qty, unitCost, occurredAt: '2026-09-10T00:00:00.000Z' });
const rc = (productId, itemId, qtyPerSale = 1) => ({ productId, itemId, qtyPerSale });
const sale = (id, productId, qty) => ({ id, productId, qty });

assert.equal(inventorySignal({ movements: [], recipes: [rc('P', 'A')], sales: [sale('s', 'P', 5)] }).status, 'nodata', 'tanpa pergerakan stok = nodata');
assert.equal(inventorySignal({ movements: [mv('m', 'A', 'sale_consumption', 5)], recipes: [], sales: [sale('s', 'P', 5)] }).status, 'nodata', 'tanpa resep = nodata');
const noSales = inventorySignal({ movements: [mv('m', 'A', 'sale_consumption', 5)], recipes: [rc('P', 'A')], sales: [] });
assert.equal(noSales.status, 'nodata', 'tanpa penjualan, pemakaian seharusnya tidak bisa dihitung; bukan dianggap sehat');
assert.equal(noSales.severity, null);

// A: seharusnya 20, aktual 30 → 50% (HIGH_VARIANCE). B: 10 vs 10 (NORMAL). C: tanpa resep → tidak bisa dibandingkan.
const invHigh = inventorySignal({
  movements: [mv('m1', 'A', 'sale_consumption', 30, 1000), mv('m2', 'B', 'sale_consumption', 10), mv('m3', 'C', 'waste', 5)],
  recipes: [rc('P', 'A'), rc('Q', 'B')],
  sales: [sale('s1', 'P', 20), sale('s2', 'Q', 10)]
});
assert.equal(invHigh.status, 'flagged');
assert.equal(invHigh.severity, 'high', '1 dari 2 item terukur = 50% ≥ ambang 30%');
assert.match(invHigh.reason, /1 dari 2 item stok selisih ≥20%/);
assert.match(invHigh.reason, /Rp 10\.000/, 'dampak = |30-20| × 1000');
assert.match(invHigh.reason, /1 item lain belum bisa dibandingkan/, 'item tanpa resep dilaporkan, tidak disembunyikan');

const invOk = inventorySignal({ movements: [mv('m2', 'B', 'sale_consumption', 10)], recipes: [rc('Q', 'B')], sales: [sale('s2', 'Q', 10)] });
assert.equal(invOk.status, 'ok');

// 2 dari 3 item selisih 15% (WATCH) → menyala rendah; selisih tanpa harga satuan tidak mengarang nilai rupiah
const invWatch = inventorySignal({
  movements: [mv('a', 'A1', 'sale_consumption', 115), mv('b', 'A2', 'sale_consumption', 115), mv('c', 'A3', 'sale_consumption', 100)],
  recipes: [rc('P1', 'A1'), rc('P2', 'A2'), rc('P3', 'A3')],
  sales: [sale('s1', 'P1', 100), sale('s2', 'P2', 100), sale('s3', 'P3', 100)]
});
assert.equal(invWatch.status, 'flagged');
assert.equal(invWatch.severity, 'low');
assert.doesNotMatch(invWatch.reason, /Rp/);
const invNoCost = inventorySignal({ movements: [mv('m1', 'A', 'sale_consumption', 30)], recipes: [rc('P', 'A')], sales: [sale('s1', 'P', 20)] });
assert.equal(invNoCost.status, 'flagged');
assert.doesNotMatch(invNoCost.reason, /Estimasi dampak/, 'tanpa harga satuan → tidak ada angka rupiah karangan');

// ───────────── POS ─────────────
const ev = (id, type, occurredAt, amount = 10000, extra = {}) => ({ id, organizationId: 'org', type, amount, occurredAt, ...extra });
const sales10 = (day) => Array.from({ length: 10 }, (_, i) => ev(`s${day}-${i}`, 'sale', `2026-09-${day}T10:00:00.000Z`));

assert.equal(posSignal({ events: [], nowIso: NOW }).status, 'nodata');
assert.equal(posSignal({ events: [ev('v', 'void', '2026-09-20T10:00:00.000Z')], nowIso: NOW }).status, 'nodata', 'hanya void tanpa penjualan ≠ sehat');

const posOk = posSignal({ events: sales10('20'), nowIso: NOW });
assert.equal(posOk.status, 'ok');
assert.match(posOk.reason, /10 transaksi POS tercatat, terakhir 1 hari lalu/);
assert.match(posOk.reason, /Baseline periode sebelumnya belum ada/, 'kelemahan bukti disebut, bukan disembunyikan');

const posStale = posSignal({ events: sales10('01'), nowIso: NOW });
assert.equal(posStale.status, 'flagged');
assert.equal(posStale.severity, 'medium');
assert.match(posStale.reason, /terakhir masuk 20 hari lalu/);
assert.equal(posSignal({ events: sales10('01'), nowIso: NOW, checkFreshness: false }).status, 'ok', 'periode lampau tidak dihukum karena jeda');

// selisih kas → HIGH (VERIFIED), dengan penafian bukan fraud
const posCash = posSignal({ events: [...sales10('20'), ev('cd', 'cash_discrepancy', '2026-09-20T22:00:00.000Z', 50000)], nowIso: NOW });
assert.equal(posCash.status, 'flagged');
assert.equal(posCash.severity, 'high');
assert.match(posCash.reason, /bukan bukti fraud/);

// void rate 20% vs baseline 10% → rasio 200% = MEDIUM; tanpa baseline anomali diabaikan
const cur = [...sales10('20'), ev('v1', 'void', '2026-09-20T11:00:00.000Z'), ev('v2', 'void', '2026-09-20T12:00:00.000Z')];
const prev = [...sales10('10'), ev('pv1', 'void', '2026-09-10T11:00:00.000Z')];
const posVoid = posSignal({ events: cur, previousEvents: prev, nowIso: NOW });
assert.equal(posVoid.status, 'flagged');
assert.equal(posVoid.severity, 'medium');
assert.equal(posSignal({ events: cur, nowIso: NOW }).status, 'ok', 'tanpa baseline, rasio void tidak bisa dinilai → tidak menyalakan jalur');

// ───────────── Sosial ─────────────
const acc = (o = {}) => ({ id: 'a1', clientId: 'c1', isInternalAccount: false, platform: 'instagram', platformAccountId: 'x', status: 'connected', lastSyncedAt: '2026-09-21T00:00:00.000Z', ...o });
const post = (id, postedAt, o = {}) => ({ id, clientId: 'c1', platform: 'instagram', contentType: 'post', postedAt, ...o });
const posts = (n, day = '15') => Array.from({ length: n }, (_, i) => post(`p${i}`, `2026-09-${day}T08:00:00.000Z`));
const soc = (o) => socialSignal({ clientId: 'c1', accounts: [acc()], content: [], nowIso: NOW, ...o });

assert.equal(soc({ accounts: [] }).status, 'nodata');
assert.equal(soc({ accounts: [acc({ isInternalAccount: true })] }).status, 'nodata', 'akun internal Trace tidak dihitung sebagai akun klien');
assert.equal(soc({ accounts: [acc({ clientId: 'c2' })] }).status, 'nodata', 'akun klien lain tidak bocor');
assert.equal(soc({ accounts: [acc({ status: 'expired' })] }).status, 'nodata');
assert.match(soc({ accounts: [acc({ lastSyncedAt: '2026-09-01T00:00:00.000Z' })] }).reason, /belum sinkron dalam 7 hari/);
assert.equal(soc({ accounts: [acc({ lastSyncedAt: null })] }).status, 'nodata', 'tidak pernah sinkron → 0 posting tidak boleh dianggap "tidak posting"');
assert.equal(socialSignal({ clientId: 'c1', accounts: [acc()], content: [], nowIso: 'bukan-tanggal' }).status, 'nodata');

const quiet = soc({ content: [] });
assert.equal(quiet.status, 'flagged');
assert.equal(quiet.severity, 'medium');
assert.match(quiet.reason, /Tidak ada posting dalam 30 hari/);
assert.equal(soc({ content: posts(2) }).severity, 'low');
assert.match(soc({ content: posts(2) }).reason, /Hanya 2 posting/);
const healthySocial = soc({ content: posts(5) });
assert.equal(healthySocial.status, 'ok');
assert.match(healthySocial.reason, /tetap perlu asesmen langsung/, 'feed rapi/tidak tetap manual');
// hanya posting di jendela 30 hari, milik klien ini, di platform yang sinkronnya segar
const noisy = [...posts(1), post('old', '2026-07-01T00:00:00.000Z'), post('other', '2026-09-15T00:00:00.000Z', { clientId: 'c2' }), post('tt', '2026-09-15T00:00:00.000Z', { platform: 'tiktok' }), post('future', '2026-10-15T00:00:00.000Z')];
assert.match(soc({ content: noisy }).reason, /Hanya 1 posting/);

// ───────────── Cashflow AR/AP ─────────────
const inv = (id, dueDate, amount, o = {}) => ({ id, clientId: 'c1', customerName: 'PT X', invoiceDate: '2026-05-01', dueDate, amount, ...o });
const bill = (id, dueDate, amount, o = {}) => ({ id, clientId: 'c1', vendorName: 'Supplier', billDate: '2026-05-01', dueDate, amount, ...o });
const cash = (o) => cashSignal({ clientId: 'c1', invoices: [], arPayments: [], bills: [], apPayments: [], asOfIso: '2026-09-22', ...o });

assert.equal(cash({}).status, 'nodata');
assert.equal(cash({ invoices: [inv('i', '2026-06-01', 1, { clientId: 'c2' })] }).status, 'nodata', 'data klien lain tidak dihitung');
assert.equal(cash({ invoices: [inv('i', '2026-06-01', 1e7)], asOfIso: 'salah' }).status, 'nodata');

// >90 hari = 50% dari total → tinggi
const arHigh = cash({ invoices: [inv('i1', '2026-06-01', 10e6), inv('i2', '2026-10-01', 10e6)] });
assert.equal(arHigh.status, 'flagged');
assert.equal(arHigh.severity, 'high');
assert.match(arHigh.reason, /Piutang Rp 20\.000\.000, 50% \(Rp 10\.000\.000\) lewat jatuh tempo >60 hari/);
// 35% lewat 61–90 hari → sedang; pembayaran sebagian mengurangi outstanding
const arMed = cash({ invoices: [inv('i1', '2026-07-20', 3.5e6), inv('i2', '2026-10-01', 6.5e6)] });
assert.equal(arMed.severity, 'medium');
const arPaid = cash({ invoices: [inv('i1', '2026-06-01', 10e6), inv('i2', '2026-10-01', 10e6)], arPayments: [{ invoiceId: 'i1', amount: 10e6, paidDate: '2026-08-01' }] });
assert.equal(arPaid.status, 'ok', 'invoice lunas tidak dihitung sebagai piutang telat');
// utang supplier telat >30 hari
const apLate = cash({ bills: [bill('b1', '2026-08-01', 6e6), bill('b2', '2026-10-01', 4e6)] });
assert.equal(apLate.status, 'flagged');
assert.equal(apLate.severity, 'medium');
assert.match(apLate.reason, /Utang supplier Rp 10\.000\.000, 60% \(Rp 6\.000\.000\) telat dibayar >30 hari/);
const cashOk = cash({ invoices: [inv('i', '2026-10-01', 5e6)], bills: [bill('b', '2026-10-01', 5e6)] });
assert.equal(cashOk.status, 'ok');
const onlyAr = cash({ invoices: [inv('i', '2026-10-01', 5e6)] });
assert.match(onlyAr.reason, /Data utang supplier belum ada/, 'sisi yang tidak punya data disebut, bukan dianggap bersih');

// ───────────── Integrasi diagnoseClient ─────────────
const rec = (period, category, amount) => ({ id: `${period}-${category}`, period, category, amount });
const full = (p, rev, cogs, labor, opex) => [rec(p, 'revenue', rev), rec(p, 'cogs', cogs), rec(p, 'labor', labor), rec(p, 'opex', opex)];
const P = ['2026-06', '2026-07', '2026-08'];
const healthyRecs = P.flatMap(p => full(p, 100e6, 30e6, 15e6, 10e6));
const thinRecs = P.flatMap(p => full(p, 100e6, 40e6, 25e6, 27e6)); // margin 8% → jalur profit menyala sedang
const diag = (records, signals) => { const row = buildClientHealth({ id: 'c1', name: 'C1', records, alerts: [] }); return diagnoseClient(row, records, signals); };
const by = (f, k) => f.find(x => x.key === k);

const base = diag(healthyRecs);
assert.deepEqual(diag(healthyRecs, {}), base, 'tanpa sinyal, hasil identik dengan perilaku lama');

const withSig = diag(healthyRecs, { inventory: invHigh, erp: posOk, social: soc({ accounts: [] }), cash: arHigh });
assert.equal(withSig.length, WORKSTREAMS.length, 'tiap jalur tetap punya tepat satu temuan');
assert.equal(by(withSig, 'inventory').status, 'flagged');
assert.equal(by(withSig, 'inventory').severity, 'high');
assert.equal(by(withSig, 'erp').status, 'ok');
assert.equal(by(withSig, 'social').status, 'manual', 'sinyal nodata → tetap asesmen manual, bukan sehat');
assert.match(by(withSig, 'social').reason, /Belum ada akun sosial klien yang terhubung\. Nilai feed/);
assert.equal(by(withSig, 'branding').status, 'manual', 'branding tidak punya sinyal otomatis');
assert.equal(by(withSig, 'profit').status, 'flagged', 'AR macet menyalakan jalur cashflow walau margin sehat');
assert.equal(by(withSig, 'profit').severity, 'high');
assert.match(by(withSig, 'profit').reason, /Operating margin 45%.*Piutang Rp 20\.000\.000/);
assert.equal(summarizePlan(withSig).mode, 'fokus');

// margin tipis (medium) + AR tinggi → severity naik ke high; alasan margin tidak hilang
const thin = diag(thinRecs, { cash: arHigh });
assert.equal(by(thin, 'profit').severity, 'high');
assert.match(by(thin, 'profit').reason, /Margin tipis \(8%/);
// margin tinggi tapi sudah menyala high, sinyal cash medium tidak menurunkannya
const neg = diag(P.flatMap(p => full(p, 100e6, 50e6, 30e6, 25e6)), { cash: arMed });
assert.equal(by(neg, 'profit').severity, 'high');
// sinyal cash ok/nodata tidak mengubah status jalur profit; nodata tidak menambah alasan
assert.equal(by(diag(healthyRecs, { cash: cashOk }), 'profit').status, 'ok');
assert.equal(by(diag(healthyRecs, { cash: cash({}) }), 'profit').reason, by(base, 'profit').reason);
// margin belum bisa dihitung + cash ok ≠ jalur profit sehat
const partialRecs = [rec('2026-08', 'revenue', 50e6)];
assert.equal(by(diag(partialRecs, { cash: cashOk }), 'profit').status, 'nodata');

// temuan dari sinyal bisa jadi tugas nyata dengan evidence yang menyebut alasannya
const draft = taskDraftFromFinding(by(withSig, 'inventory'), NOW);
assert.equal(draft.priority, 'P1');
assert.match(draft.evidenceNote, /^jalur:inventory — 1 dari 2 item stok selisih/);
assert.equal(draft.dueDateIso, '2026-09-25T00:00:00.000Z');

// ambang tercatat eksplisit (bisa dikoreksi user), bukan angka tersebar di logika
assert.equal(SIGNAL_THRESHOLDS.social.thinPosts, 4);
console.log('PASS workstream signals (inventory, POS, sosial, AR/AP, integrasi diagnoseClient)');
