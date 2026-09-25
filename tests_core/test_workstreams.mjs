import assert from 'node:assert/strict';
import { buildClientHealth } from '../dist/core/portfolioHealth.js';
import { diagnoseClient, summarizePlan, rollupWorkstreams, WORKSTREAMS } from '../dist/core/workstreams.js';

const rec = (period, category, amount) => ({ id: `${period}-${category}`, period, category, amount });
const full = (p, rev, cogs, labor, opex) => [rec(p, 'revenue', rev), rec(p, 'cogs', cogs), rec(p, 'labor', labor), rec(p, 'opex', opex)];
const diag = (records, extra = {}) => { const row = buildClientHealth({ id: 'x', name: 'X', records, alerts: [], ...extra }); return diagnoseClient(row, records); };
const by = (f, k) => f.find(x => x.key === k);

// klien sehat: tidak ada jalur menyala, area tanpa data otomatis ditandai manual (bukan dianggap bermasalah)
const healthyRecs = ['2026-06', '2026-07', '2026-08'].flatMap(p => full(p, 100e6, 30e6, 15e6, 10e6));
const healthy = diag(healthyRecs);
assert.equal(healthy.filter(f => f.status === 'flagged').length, 0);
assert.deepEqual(healthy.filter(f => f.status === 'manual').map(f => f.key).sort(), ['branding', 'erp', 'inventory', 'social']);
assert.equal(summarizePlan(healthy).mode, 'stabil');
assert.equal(healthy.length, WORKSTREAMS.length, 'setiap jalur selalu punya satu temuan');

// COGS tinggi saja → fokus pada Food Cost
const cogsOnly = diag(['2026-06', '2026-07', '2026-08'].flatMap(p => full(p, 100e6, 44e6, 15e6, 10e6)));
assert.deepEqual(cogsOnly.filter(f => f.status === 'flagged').map(f => f.key), ['foodcost']);
assert.equal(by(cogsOnly, 'foodcost').severity, 'medium');
assert.match(by(cogsOnly, 'foodcost').reason, /COGS 44% dari revenue, target ≤35%/);
assert.equal(summarizePlan(cogsOnly).mode, 'fokus');

// semua rusak → kerja total (profit negatif, COGS/labor/OPEX tinggi, revenue turun)
const bad = diag([...full('2026-06', 100e6, 50e6, 30e6, 25e6), ...full('2026-07', 85e6, 50e6, 30e6, 25e6), ...full('2026-08', 70e6, 50e6, 30e6, 25e6)]);
const badPlan = summarizePlan(bad);
assert.equal(badPlan.mode, 'total');
assert.ok(badPlan.flagged.length >= 4);
assert.equal(badPlan.flagged[0].severity, 'high', 'yang paling parah tampil dulu');
assert.match(by(bad, 'growth').reason, /Revenue turun 30% dalam 3 periode/);
assert.equal(by(bad, 'profit').status, 'flagged');

// data kurang → pembukuan menyala, jalur lain "nodata", bukan dianggap sehat
const partial = diag([rec('2026-08', 'revenue', 50e6)]);
assert.equal(by(partial, 'pembukuan').status, 'flagged');
assert.equal(by(partial, 'foodcost').status, 'nodata');
assert.equal(by(partial, 'growth').status, 'nodata', 'satu periode tidak cukup untuk membaca tren revenue');

// klien kosong / gagal dimuat → belum bisa dinilai, tidak pernah "stabil"
const empty = diag([]);
assert.equal(by(empty, 'pembukuan').status, 'flagged');
assert.equal(summarizePlan(empty).mode, 'fokus', 'klien tanpa data: satu jalur (pembukuan) menyala');
const broken = diag([], { loadError: 'HTTP 502' });
assert.equal(by(broken, 'pembukuan').status, 'nodata');
assert.equal(summarizePlan(broken).mode, 'belum');

// rollup lintas klien
const roll = rollupWorkstreams([
  { id: 'a', name: 'A', findings: cogsOnly }, { id: 'b', name: 'B', findings: bad }, { id: 'c', name: 'C', findings: healthy }
]);
assert.equal(roll[0].key, 'foodcost');
assert.deepEqual(roll[0].clients.map(c => c.id), ['a', 'b']);
assert.ok(roll.every(r => r.clients.length > 0));
console.log('PASS workstreams');
