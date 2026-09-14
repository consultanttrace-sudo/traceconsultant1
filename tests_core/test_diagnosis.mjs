import assert from 'node:assert/strict';
import { compareFinancePeriods } from '../dist/core/finance.js';
import { diagnoseBusiness } from '../dist/core/diagnosis.js';

const records = [
  {id:'r1',period:'2026-07',amount:100000000,category:'revenue',evidence:{id:'e1',source:'system'}},
  {id:'r2',period:'2026-07',amount:30000000,category:'cogs',evidence:{id:'e2',source:'system'}},
  {id:'r3',period:'2026-07',amount:20000000,category:'labor',evidence:{id:'e3',source:'system'}},
  {id:'r4',period:'2026-07',amount:10000000,category:'opex',evidence:{id:'e4',source:'system'}},
  {id:'r5',period:'2026-08',amount:90000000,category:'revenue',evidence:{id:'e5',source:'system'}},
  {id:'r6',period:'2026-08',amount:32000000,category:'cogs',evidence:{id:'e6',source:'system'}},
  {id:'r7',period:'2026-08',amount:22000000,category:'labor',evidence:{id:'e7',source:'system'}},
  {id:'r8',period:'2026-08',amount:11000000,category:'opex',evidence:{id:'e8',source:'system'}}
];
const comparison = compareFinancePeriods(records, '2026-08', '2026-07');
const report = diagnoseBusiness(comparison, [
  {id:'ev1',metric:'Revenue',status:'available',value:90000000,period:'2026-08',source:'P&L'},
  {id:'ev2',metric:'COGS',status:'available',value:32000000,period:'2026-08',source:'P&L'}
]);
assert.ok(report.findings.some(f => f.id === 'revenue-decline'));
assert.ok(report.findings.some(f => f.id === 'cogs-ratio'));
assert.equal(report.currentPeriod, '2026-08');
assert.equal(report.previousPeriod, '2026-07');
assert.ok(report.findings.every(f => f.status === 'confirmed' || f.status === 'blocked' || f.status === 'suspected'));
assert.ok(report.findings.filter(f => f.confidencePct !== null).every(f => f.confidencePct >= 0 && f.confidencePct <= 100));

const blocked = diagnoseBusiness(compareFinancePeriods(records, '2026-08'));
assert.equal(blocked.previousPeriod, null);
assert.equal(blocked.findings[0].status, 'blocked');
assert.ok(blocked.limitations.some(x => x.includes('Periode pembanding')));
console.log('PASS business diagnosis core');
