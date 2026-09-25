import assert from 'node:assert/strict';
import {
  healthStatus, buildClientHealth, summarizePortfolio, buildMarginTrend, readTrend,
  buildInsight, buildPriorityList, portfolioToCsv, periodsOf
} from '../dist/core/portfolioHealth.js';

const rec = (period, category, amount, id = `${period}-${category}`) => ({ id, period, category, amount });
const full = (period, revenue, cogs, labor, opex) => [
  rec(period, 'revenue', revenue), rec(period, 'cogs', cogs), rec(period, 'labor', labor), rec(period, 'opex', opex)
];

// status thresholds — null never becomes a status with a score
assert.equal(healthStatus(null), 'nodata');
assert.equal(healthStatus(85), 'healthy');
assert.equal(healthStatus(80), 'healthy');
assert.equal(healthStatus(79.9), 'moderate');
assert.equal(healthStatus(60), 'moderate');
assert.equal(healthStatus(45), 'high');
assert.equal(healthStatus(10), 'critical');

// a healthy client, a client over COGS target, a client with only revenue, a client with nothing
const healthy = { id: 'a', name: 'Alpha', alerts: [], records: [...full('2026-07', 100_000_000, 30_000_000, 15_000_000, 10_000_000), ...full('2026-08', 100_000_000, 30_000_000, 15_000_000, 10_000_000)] };
const pricey = { id: 'b', name: 'Bravo', alerts: [{ id: 'x', severity: 'CRITICAL', title: 'Void tinggi', status: 'OPEN' }], records: [...full('2026-07', 100_000_000, 34_000_000, 18_000_000, 14_000_000), ...full('2026-08', 100_000_000, 48_000_000, 22_000_000, 20_000_000)] };
const partial = { id: 'c', name: 'Charlie', alerts: [], records: [rec('2026-08', 'revenue', 50_000_000)] };
const empty = { id: 'd', name: 'Delta', alerts: [], records: [] };
const broken = { id: 'e', name: 'Echo', alerts: [], records: [], loadError: 'Trace data HTTP 502' };

const rows = [healthy, pricey, partial, empty, broken].map(c => buildClientHealth(c));
const byId = Object.fromEntries(rows.map(r => [r.id, r]));

assert.equal(byId.a.period, '2026-08');
assert.equal(byId.a.status, 'healthy');
assert.equal(byId.a.operatingMarginPct, 45);
assert.ok(Number.isInteger(byId.a.score) && Number.isInteger(byId.b.score), 'scores are shown as whole numbers');
assert.equal(byId.a.confidencePct, 33, 'finance-only evidence must not read as 100% confidence (POS + inventory not loaded)');
assert.ok(byId.a.drivers.length === 0, 'healthy client has no drivers');

assert.ok(byId.b.score !== null && byId.b.score < byId.a.score, 'over-target client scores lower');
assert.ok(byId.b.previousScore !== null && byId.b.previousScore > byId.b.score, 'previous period score is kept for comparison');
assert.equal(byId.b.openAlerts, 1);
assert.equal(byId.b.severeAlerts, 1);
assert.ok(byId.b.drivers.some(d => d.kind === 'cogs'), 'COGS 48% > 35% is a driver');
assert.ok(byId.b.drivers.some(d => d.kind === 'alert'), 'open critical alert is a driver');

assert.equal(byId.c.score, null, 'revenue-only client is NOT scored as 0');
assert.equal(byId.c.status, 'nodata');
assert.deepEqual(byId.c.missing, ['COGS', 'Labor', 'OPEX']);
assert.equal(byId.d.status, 'nodata');
assert.equal(byId.d.drivers[0].kind, 'missing');
assert.equal(byId.e.drivers[0].kind, 'loaderror');
assert.equal(byId.e.loadError, 'Trace data HTTP 502');

// fixed period: a client with no rows that month becomes nodata instead of falling back silently
const july = buildClientHealth(pricey, '2026-07');
assert.equal(july.period, '2026-07');
assert.equal(buildClientHealth(pricey, '2026-05').status, 'nodata');

const summary = summarizePortfolio(rows);
assert.equal(summary.scoredCount, 2, 'only clients with evidence are averaged');
assert.equal(summary.averageScore, Math.round((byId.a.score + byId.b.score) / 2));
assert.equal(summary.counts.nodata, 3);
assert.equal(summary.coveragePct, 40, '2 of 5 clients have complete finance data');
assert.equal(summary.openAlerts, 1);
assert.ok(summary.scoreDelta !== null && summary.scoreDelta < 0 || summary.scoreDelta === 0 || summary.scoreDelta > 0);
assert.equal(summarizePortfolio([]).averageScore, null);
assert.equal(summarizePortfolio([]).coveragePct, null);

// margin trend only counts clients with complete data for each period
const trend = buildMarginTrend([healthy, pricey, partial], 12);
assert.deepEqual(trend.map(p => p.period), ['2026-07', '2026-08']);
assert.equal(trend[1].clients, 2, 'partial client excluded from portfolio margin');
assert.ok(trend[1].marginPct < trend[0].marginPct, 'margin fell');
const reading = readTrend(trend);
assert.ok(reading.deltaPts < 0);
assert.equal(reading.driver, 'COGS', 'COGS moved the most against margin');
assert.equal(readTrend([trend[0]]), null, 'a single period has no trend');
assert.deepEqual(buildMarginTrend([empty], 6), []);

// insight + priority list stay evidence-based
const insight = buildInsight(summary);
assert.match(insight.headline, /COGS di atas target pada 1 dari 2 klien/);
assert.equal(insight.confidencePct, summary.averageConfidencePct);
assert.equal(insight.impact, 'high', '1 of 2 clients over COGS target (50%) is a widespread breach');
const calm = summarizePortfolio([buildClientHealth(healthy)]);
assert.equal(buildInsight(calm).impact, 'low');
assert.match(buildInsight(calm).headline, /Tidak ada metrik finance yang melewati target/);
assert.equal(buildInsight(summarizePortfolio([byId.d])).impact, 'unknown');
assert.equal(buildInsight(summarizePortfolio([])).impact, 'unknown');
const priority = buildPriorityList(rows, 3);
assert.equal(priority[0].row.id, 'b', 'alert/cogs client outranks data gaps');
assert.ok(priority.length <= 3);

// export = what is on screen
const csv = portfolioToCsv(rows);
assert.equal(csv.split('\n').length, 6);
assert.ok(csv.startsWith('Klien,Periode,Skor'));
assert.ok(csv.includes('Charlie,2026-08,,nodata'), 'missing score stays blank in CSV, not 0');
assert.deepEqual(periodsOf(healthy.records), ['2026-07', '2026-08']);

console.log('PASS portfolio health model');
