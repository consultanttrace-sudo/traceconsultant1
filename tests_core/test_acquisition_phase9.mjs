import assert from 'node:assert/strict';
import { deduplicateLeads, qualifyLead, buildPipelineMetrics, ACQUISITION_STAGES } from '../dist/core/acquisition.js';

const base = { id:'1', businessName:'Kopi Senja', city:'Bogor', phone:'+62 812-3456-7890', website:'https://www.kopisenja.id/', instagram:'@kopisenja', reviewCount:850, rating:4.6, outletCount:2 };
const dup = { ...base, id:'2', businessName:'Kopi Senja ', phone:'081234567890' };
assert.equal(deduplicateLeads([base, dup]).length, 1);

const q = qualifyLead(base, [
  {field:'phone',value:base.phone,available:true,source:'Google'},
  {field:'website',value:base.website,available:true,source:'Google'},
  {field:'instagram',value:base.instagram,available:true,source:'public'}
]);
assert.ok(q.fitScore >= 50);
assert.ok(q.dataCoveragePct >= 50);
assert.ok(['P1','P2','P3','P4'].includes(q.priority));
assert.ok(q.hypotheses.every(h => h.status === 'hypothesis'));

const metrics = buildPipelineMetrics([
  {...base, fitScore:q.fitScore, acquisitionStage:'prioritized'},
  {...base, id:'3', businessName:'Client', fitScore:80, acquisitionStage:'client'}
]);
assert.equal(metrics.total, 2);
assert.equal(metrics.byStage.client, 1);
assert.equal(metrics.conversionRate, 50);
assert.deepEqual(ACQUISITION_STAGES[0], 'discovery');
console.log('acquisition phase9: PASS');

const sparse = qualifyLead({id:'4',businessName:'Kedai Baru',category:'restaurant',city:'Bogor'});
assert.ok(sparse.fitScore < 50);
assert.ok(sparse.dataCoveragePct < 50);
console.log('acquisition fit/data-coverage separation: PASS');
