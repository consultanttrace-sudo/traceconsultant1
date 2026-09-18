import assert from 'node:assert/strict';
import { buildFinanceMonthlyView, assessFinanceQuality } from '../dist/core/finance.js';

const records=[];
for(let month=3;month<=8;month++){
  const period=`2026-${String(month).padStart(2,'0')}`;
  records.push(
    {id:`r-${month}`,period,amount:1000000,category:'revenue',evidence:{id:`er-${month}`,source:'imported'}},
    {id:`c-${month}`,period,amount:300000,category:'cogs',evidence:{id:`ec-${month}`,source:'imported'}},
    {id:`l-${month}`,period,amount:200000,category:'labor',evidence:{id:`el-${month}`,source:'imported'}},
    {id:`o-${month}`,period,amount:250000,category:'opex',evidence:{id:`eo-${month}`,source:'imported'}},
  );
}
const monthly=buildFinanceMonthlyView(records);
assert.equal(monthly.length,6);
assert.deepEqual(monthly.map(x=>x.period),['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08']);
assert.equal(monthly[0].grossProfit,700000);
assert.equal(monthly[0].primeCost,500000);
assert.equal(monthly[0].operatingProfit,250000);
assert.equal(monthly[0].grossMarginPct,70);
assert.equal(monthly[0].operatingMarginPct,25);
const quality=assessFinanceQuality(records);
assert.equal(quality.periods,6);
assert.equal(quality.periodsWithAllCoreMetrics,6);
assert.equal(quality.evidenceCoveragePct,100);
assert.equal(quality.duplicateRisk,0);
console.log('PASS finance intelligence assertions');
