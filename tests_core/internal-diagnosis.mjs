import assert from 'node:assert/strict';
import {diagnoseInternalSystem} from '../dist/core/internalDiagnosis.js';
const blocked=diagnoseInternalSystem({diagnostics:[{id:'x',category:'runtime_risk',severity:'high',status:'blocked',title:'Blocked check',reason:'source unavailable',evidence:[{file:'test.ts',reason:'missing'}]}]});
assert.equal(blocked.findings[0].status,'blocked');
const cc=diagnoseInternalSystem({commandCenter:{generatedAt:new Date().toISOString(),totalClients:1,counts:{healthy:0,attention:0,critical:0,blocked:1,unknown:0},priorityClients:[],actionSummary:{open:2,blocked:1,overdue:0},dataQuality:{clientsWithMissingData:1,averageCoveragePct:80}}});
assert.equal(cc.findings.length,2); assert.match(cc.conclusion,/2 finding/);
const no=diagnoseInternalSystem({}); assert.equal(no.findings.length,0); assert.equal(no.limitations.length,1);
console.log('Internal diagnosis regression: PASS');
