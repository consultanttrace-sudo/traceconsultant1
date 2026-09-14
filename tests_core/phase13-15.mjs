import assert from 'node:assert/strict';
import {buildLeaderCommandCenter} from '../dist/core/leaderCommandCenter.js';
import {transitionTask} from '../dist/core/collaboration.js';
import {auditDiff,assertAppendOnly} from '../dist/core/auditGovernance.js';
import {calculateKPI} from '../dist/core/kpi.js';
const plan={clientId:'c1',objective:'x',items:[{id:'a',title:'A',owner:'Irwan',priority:'P1',status:'blocked',dueDate:'2020-01-01',measure:'m',evidence:[],dependencies:[]}],createdAt:new Date().toISOString(),version:1};
const cc=buildLeaderCommandCenter([{clientId:'c1',clientName:'Client A',health:'critical',healthReason:'e',kpis:[],openActions:1,blockedActions:1,dataCoveragePct:80,actionPlan:plan}]);
assert.equal(cc.counts.critical,1);assert.equal(cc.actionSummary.blocked,1);assert.equal(cc.actionSummary.overdue,1);assert.equal(cc.dataQuality.clientsWithMissingData,1);
const t={id:'t',clientId:'c1',title:'x',owner:'Irwan',createdBy:'Irwan',status:'blocked',priority:'P1',dependencies:[],evidenceIds:['e1'],updatedAt:new Date().toISOString(),version:1};
const reopened=transitionTask(t,'in_progress',1); assert.equal(reopened.version,2); assert.equal(transitionTask(reopened,'done',2).version,3);assert.throws(()=>transitionTask(t,'done',2),/CONCURRENCY_CONFLICT/);assert.throws(()=>transitionTask({...t,status:'done'},'open',1),/INVALID_STATUS_TRANSITION/);
assert.deepEqual(auditDiff({a:1,b:2},{a:1,b:3,c:4}),[{field:'b',before:2,after:3},{field:'c',before:undefined,after:4}]);assert.throws(()=>assertAppendOnly([{id:'1'}],[{id:'1'}]),/AUDIT_DUPLICATE_ID/);assert.throws(()=>assertAppendOnly([],[{id:'2'},{id:'2'}]),/AUDIT_DUPLICATE_ID/);
console.log('Phase 13-15 regression: PASS');

assert.throws(()=>calculateKPI({id:'k',name:'K',current:Number.NaN,previous:10,unit:'number',evidence:[],status:'available'}),/INVALID_KPI_CURRENT/);
assert.throws(()=>calculateKPI({id:'k',name:'K',current:10,previous:Number.POSITIVE_INFINITY,unit:'number',evidence:[],status:'available'}),/INVALID_KPI_PREVIOUS/);
