import assert from 'node:assert/strict';
import {
  EMPTY_SCOPE, isPeriod, cleanPeriod, shiftPeriod, previousPeriod, currentPeriod, recentPeriods, resolvePeriod,
  reduceScope, parseScope, writeScope, reconcileScope, outletOptionsForClient, scopePatchForLink
} from '../dist/core/scope.js';

// ---- periods
assert.equal(isPeriod('2026-09'), true);
for (const bad of ['2026-13', '2026-00', '26-09', '2026-9', '', null, undefined, 202609, '2026-09-01']) assert.equal(isPeriod(bad), false, String(bad));
assert.equal(cleanPeriod('nonsense'), '');
assert.equal(previousPeriod('2026-01'), '2025-12', 'year boundary backwards');
assert.equal(shiftPeriod('2025-12', 1), '2026-01', 'year boundary forwards');
assert.equal(shiftPeriod('2026-03', -14), '2025-01');
assert.equal(previousPeriod('bad'), '');
assert.equal(currentPeriod(new Date('2026-09-21T10:00:00Z')), '2026-09');
const rp = recentPeriods(new Date('2026-02-10T00:00:00Z'), 3, '2020-05');
assert.deepEqual(rp, ['2026-02', '2026-01', '2025-12', '2020-05'].sort().reverse(), 'recent months + a chosen old month stay selectable');
assert.deepEqual(recentPeriods(new Date('2026-02-10T00:00:00Z'), 2, 'garbage'), ['2026-02', '2026-01'], 'invalid include is ignored');

// ---- resolvePeriod: explicit choice wins, module fallbacks differ on purpose
const now = new Date('2026-09-21T00:00:00Z');
assert.deepEqual(resolvePeriod('2026-06', 'current', { now }), { period: '2026-06', source: 'scope', hasData: null });
assert.deepEqual(resolvePeriod('', 'current', { now }), { period: '2026-09', source: 'default', hasData: null });
assert.deepEqual(resolvePeriod('', 'latest', { available: ['2026-03', '2026-07', '2026-05'] }), { period: '2026-07', source: 'default', hasData: true });
assert.deepEqual(resolvePeriod('', 'latest', { available: [] }), { period: '', source: 'none', hasData: null }, 'no data → nothing, not a made-up month');
assert.equal(resolvePeriod('2026-04', 'latest', { available: ['2026-07'] }).hasData, false, 'chosen month without data is reported, not silently replaced');
assert.equal(resolvePeriod('2026-04', 'latest', { available: ['2026-04'] }).hasData, true);
assert.equal(resolvePeriod('nonsense', 'none').period, '', 'invalid scope value is ignored');

// ---- reducer: outlet belongs to a client, period does not
let s = EMPTY_SCOPE;
s = reduceScope(s, { type: 'outlet', outletId: 'o1' });
assert.equal(s.outletId, '', 'outlet without a client is ignored');
s = reduceScope(s, { type: 'client', clientId: 'A' });
s = reduceScope(s, { type: 'outlet', outletId: 'oA' });
s = reduceScope(s, { type: 'period', period: '2026-08' });
assert.deepEqual(s, { clientId: 'A', outletId: 'oA', period: '2026-08' });
const same = reduceScope(s, { type: 'client', clientId: 'A' });
assert.equal(same, s, 're-selecting the same client keeps the outlet (same object)');
const toB = reduceScope(s, { type: 'client', clientId: 'B' });
assert.deepEqual(toB, { clientId: 'B', outletId: '', period: '2026-08' }, 'switching client drops the outlet but keeps the period');
assert.equal(reduceScope(s, { type: 'period', period: '2026-99' }), s, 'invalid period is rejected');
assert.equal(reduceScope(s, { type: 'period', period: '' }).period, '', 'empty clears the period');
assert.deepEqual(reduceScope(s, { type: 'reset' }), EMPTY_SCOPE);
// a deep link that names a NEW client and an outlet applies the outlet to the new client
assert.deepEqual(reduceScope(s, { type: 'set', patch: { clientId: 'B', outletId: 'oB', period: '2026-01' } }), { clientId: 'B', outletId: 'oB', period: '2026-01' });
// ...but a link naming only the client never leaks the old client's outlet
assert.equal(reduceScope(s, { type: 'set', patch: scopePatchForLink({ moduleId: 'opex', clientId: 'B' }) }).outletId, '');

// ---- URL round trip; unrelated params untouched; untrusted input dropped
assert.deepEqual(parseScope('?client=A&outlet=oA&period=2026-08&view=opex'), { clientId: 'A', outletId: 'oA', period: '2026-08' });
assert.deepEqual(parseScope('?outlet=oA&period=2026-13'), EMPTY_SCOPE, 'outlet without client and impossible month are dropped');
assert.equal(writeScope('?view=opex&range=6', { clientId: 'A', outletId: 'oA', period: '2026-08' }), '?view=opex&range=6&client=A&outlet=oA&period=2026-08');
assert.equal(writeScope('?view=opex&client=A&outlet=oA&period=2026-08', EMPTY_SCOPE), '?view=opex', 'cleared scope removes its params only');
assert.equal(writeScope('', EMPTY_SCOPE), '');
assert.equal(writeScope('', { clientId: '', outletId: 'orphan', period: '' }), '', 'orphan outlet is never written');
const rt = { clientId: 'x y&z', outletId: 'o/1', period: '2026-01' };
assert.deepEqual(parseScope(writeScope('', rt)), rt, 'special characters survive the round trip');

// ---- stale ids
const sc = { clientId: 'gone', outletId: 'oX', period: '2026-08' };
assert.deepEqual(reconcileScope(sc, { clientIds: null }), { scope: sc, dropped: [] }, 'list still loading → nothing cleared');
assert.deepEqual(reconcileScope(sc, { clientIds: ['A', 'B'] }), { scope: { clientId: '', outletId: '', period: '2026-08' }, dropped: ['client'] });
assert.deepEqual(reconcileScope({ clientId: 'A', outletId: 'zz', period: '' }, { clientIds: ['A'], outletIds: ['oA'] }).dropped, ['outlet']);
assert.deepEqual(reconcileScope({ clientId: 'A', outletId: 'oA', period: '' }, { clientIds: ['A'] }).dropped, [], 'outlets are only checked when a list is supplied');

// ---- outlet suggestions: strictly one client
const companies = [{ id: 'c1', nama: 'PT A', klienId: 'A' }, { id: 'c2', nama: 'PT B', klienId: 'B' }];
const brands = [{ id: 'b1', nama: 'Kopi A', companyId: 'c1' }, { id: 'b2', nama: 'Kopi B', companyId: 'c2' }];
const outlets = [{ id: 'o1', nama: 'Kemang', brandId: 'b1' }, { id: 'o2', nama: 'Senayan', brandId: 'b2' }, { id: 'o3', nama: 'Yatim', brandId: 'nope' }];
const forA = outletOptionsForClient({ clientId: 'A', companies, brands, outlets, dataOutletIds: ['o1', 'u-9', ''] });
assert.deepEqual(forA, [{ id: 'o1', label: 'Kemang · Kopi A', source: 'hierarchy' }, { id: 'u-9', label: 'u-9', source: 'data' }]);
assert.ok(!JSON.stringify(forA).includes('Senayan'), "another client's outlet must never be suggested");
assert.ok(!JSON.stringify(forA).includes('Yatim'), 'outlet whose brand is missing is not attributed to anyone');
assert.deepEqual(outletOptionsForClient({ clientId: '', companies, brands, outlets }), []);
assert.deepEqual(outletOptionsForClient({ clientId: 'UUID-NEW', companies, brands, outlets }), [], 'client with no hierarchy link gets no invented outlets');

// ---- outlet suggestions: real trace_outlets rows (client_id set directly, no brand chain)
const tableOutlets = [{ id: 't1', nama: 'Pusat', clientId: 'A' }, { id: 't2', nama: 'Cabang', clientId: 'B' }];
const forATable = outletOptionsForClient({ clientId: 'A', outlets: tableOutlets });
assert.deepEqual(forATable, [{ id: 't1', label: 'Pusat', source: 'hierarchy' }], 'trace_outlets row is matched straight by clientId, no company/brand needed');
assert.deepEqual(outletOptionsForClient({ clientId: 'A', outlets: [{ id: 't3', nama: 'Milik B', client_id: 'B' }] }), [], "another client's real outlet row must never be suggested");
// a client can have both real trace_outlets rows and legacy hierarchy rows at once
assert.deepEqual(
  outletOptionsForClient({ clientId: 'A', companies, brands, outlets: [...outlets, ...tableOutlets] }),
  [{ id: 'o1', label: 'Kemang · Kopi A', source: 'hierarchy' }, { id: 't1', label: 'Pusat', source: 'hierarchy' }]
);

console.log('PASS scope (periods, reducer, URL, stale ids, outlet isolation)');
