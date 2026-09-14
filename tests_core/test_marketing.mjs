import assert from 'node:assert/strict';
import { summarizeMarketing, compareMarketingPeriods, marketingRoiPct, marketingRoas, diagnoseMarketing } from '../dist/core/marketing.js';

const rows = [
 {id:'a',period:'2026-08',name:'Promo A',channel:'instagram',cost:1000000,attributedRevenue:1500000,leads:100,meetings:20,conversions:10,status:'completed',sourceKind:'manual'},
 {id:'b',period:'2026-08',name:'Promo B',channel:'tiktok',cost:1000000,attributedRevenue:null,leads:50,meetings:10,conversions:5,status:'completed',sourceKind:'manual'},
 {id:'c',period:'2026-07',name:'Promo C',channel:'instagram',cost:1000000,attributedRevenue:2000000,leads:120,meetings:25,conversions:15,status:'completed',sourceKind:'manual'}
];
assert.equal(marketingRoiPct(100,150),50);
assert.equal(marketingRoas(100,150),1.5);
const s=summarizeMarketing(rows,'2026-08');
assert.equal(s.spend,2000000); assert.equal(s.attributedRevenue,1500000); assert.equal(s.roiPct,-25); assert.equal(s.dataQuality,'partial');
const c=compareMarketingPeriods(rows,'2026-08','2026-07');
assert.equal(c.changes.spend,1000000); assert.equal(c.changes.attributedRevenue,-500000); assert.equal(c.changes.attributedRevenuePct,-25);
const d=diagnoseMarketing(c);
assert.ok(d.some(x=>x.id==='marketing-attribution-missing'));
console.log('MARKETING CORE TEST: PASS');

const invalid=summarizeMarketing([{id:'bad',period:'2026-08',name:'Bad',channel:'instagram',cost:-100,attributedRevenue:1000,sourceKind:'manual'}], '2026-08');
if(invalid.dataQuality!=='partial') throw new Error('negative marketing cost must force partial data quality');
assert.equal(invalid.invalidCostCount, 1);
assert.equal(invalid.roiPct, null);
assert.equal(invalid.roas, null);
console.log('marketing invalid-cost guard: PASS');
