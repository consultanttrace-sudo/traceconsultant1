import assert from 'node:assert/strict';
import { calculateChange } from '../dist/core/calculation.js';
import { assessEvidence } from '../dist/core/evidence.js';
import { explainScore } from '../dist/core/intelligence.js';

const c = calculateChange({metric:'COGS', current:86, previous:70, currentPeriod:'Aug 2026', previousPeriod:'Jul 2026', source:'P&L'});
assert.equal(c.status, 'calculated');
assert.equal(Number(c.changePct.toFixed(2)), 22.86);
assert.match(c.explanation, /Formula/);

const e = assessEvidence([
  {id:'1',metric:'Revenue',status:'available',source:'P&L'},
  {id:'2',metric:'Conversion',status:'unavailable'},
  {id:'3',metric:'Owner note',status:'manual'}
]);
assert.equal(e.completenessPct, 66.67);
assert.deepEqual(e.missing, ['Conversion']);

const s = explainScore([
  {key:'fit',label:'Consulting Fit',value:80,weight:20,evidence:['website']},
  {key:'growth',label:'Growth Signal',value:60,weight:20,evidence:['reviews']}
], [
  {id:'1',metric:'Website',status:'available',source:'Website'},
  {id:'2',metric:'Transactions',status:'unavailable'}
]);
assert.equal(s.score, 70);
assert.ok(s.confidencePct > 0 && s.confidencePct <= 100);
assert.ok(s.why.some(x => x.includes('Consulting Fit')));

console.log('PASS calculation/evidence/intelligence core');

const missing = explainScore([
  {key:'fit',label:'Fit',value:80,weight:50,evidence:['x']},
  {key:'growth',label:'Growth',value:null,weight:50,evidence:[]}
], [{id:'1',metric:'Fit',status:'available',source:'source'}]);
assert.equal(missing.score, 80);
assert.equal(missing.dimensions.find(d => d.key === 'growth')?.contribution, null);
console.log('missing dimension is not treated as zero: PASS');
