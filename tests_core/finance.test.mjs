import assert from 'node:assert/strict';
import { summarizeFinance, compareFinancePeriods } from '../dist/core/finance.js';

const records = [
  { id:'r1', period:'2026-08', amount:100000000, category:'revenue', evidence:{id:'e1',source:'system'} },
  { id:'c1', period:'2026-08', amount:30000000, category:'cogs', evidence:{id:'e2',source:'system'} },
  { id:'l1', period:'2026-08', amount:10000000, category:'labor' },
  { id:'o1', period:'2026-08', amount:20000000, category:'opex' },
  { id:'r0', period:'2026-07', amount:80000000, category:'revenue' },
  { id:'c0', period:'2026-07', amount:24000000, category:'cogs' },
  { id:'l0', period:'2026-07', amount:8000000, category:'labor' },
  { id:'o0', period:'2026-07', amount:16000000, category:'opex' }
];

const s = summarizeFinance(records, '2026-08');
assert.equal(s.revenue, 100000000);
assert.equal(s.cogs, 30000000);
assert.equal(s.grossProfit, 70000000);
assert.equal(s.operatingProfit, 40000000);
assert.equal(s.grossMarginPct, 70);
assert.equal(s.cogsPct, 30);
assert.equal(s.operatingMarginPct, 40);
assert.equal(s.missingMetrics.length, 0);
assert.equal(s.evidenceCount, 2);

const cmp = compareFinancePeriods(records, '2026-08', '2026-07');
assert.equal(cmp.metrics.find(x => x.metric === 'Revenue').changePct, 25);
assert.equal(cmp.metrics.find(x => x.metric === 'COGS').changePct, 25);
assert.equal(cmp.metrics.find(x => x.metric === 'Operating Profit').changePct, 25);

const zero = compareFinancePeriods([{id:'x',period:'2026-08',amount:10,category:'revenue'},{id:'x0',period:'2026-07',amount:0,category:'revenue'}], '2026-08', '2026-07');
assert.equal(zero.metrics[0].status, 'undefined_baseline');

console.log('PASS finance core assertions');
