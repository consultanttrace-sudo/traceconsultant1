import type { ActionPlan } from './actionPlan.js';
import type { KPIResult } from './kpi.js';
import type { DiagnosisReport } from './diagnosis.js';

export type HealthStatus='healthy'|'attention'|'critical'|'blocked'|'unknown';
export interface LeaderClientSnapshot { clientId:string; clientName:string; health:HealthStatus; healthReason:string; kpis:KPIResult[]; diagnosis?:DiagnosisReport; actionPlan?:ActionPlan; openActions:number; blockedActions:number; dataCoveragePct:number|null; lastActivityAt?:string; }
export interface LeaderCommandCenter { generatedAt:string; totalClients:number; counts:{healthy:number;attention:number;critical:number;blocked:number;unknown:number}; priorityClients:LeaderClientSnapshot[]; actionSummary:{open:number;blocked:number;overdue:number}; dataQuality:{clientsWithMissingData:number;averageCoveragePct:number|null}; }

export function buildLeaderCommandCenter(clients:LeaderClientSnapshot[], now=new Date()):LeaderCommandCenter {
  const counts={healthy:0,attention:0,critical:0,blocked:0,unknown:0};
  for(const c of clients) counts[c.health]++;
  const open=clients.reduce((n,c)=>n+c.openActions,0), blocked=clients.reduce((n,c)=>n+c.blockedActions,0);
  const overdue=clients.reduce((n,c)=>n+(c.actionPlan?.items.filter(i=>{if(!i.dueDate||['completed','cancelled'].includes(i.status))return false;const due=new Date(i.dueDate);return Number.isFinite(due.getTime())&&due<now;}).length??0),0);
  const coverages=clients.map(c=>c.dataCoveragePct).filter((x):x is number=>x!==null&&Number.isFinite(x)&&x>=0&&x<=100);
  const priority=[...clients].sort((a,b)=>healthRank(b.health)-healthRank(a.health)||b.blockedActions-a.blockedActions||b.openActions-a.openActions);
  return {generatedAt:now.toISOString(),totalClients:clients.length,counts,priorityClients:priority,actionSummary:{open,blocked,overdue},dataQuality:{clientsWithMissingData:clients.filter(c=>c.dataCoveragePct===null||!Number.isFinite(c.dataCoveragePct)||c.dataCoveragePct<100).length,averageCoveragePct:coverages.length?Number((coverages.reduce((a,b)=>a+b,0)/coverages.length).toFixed(1)):null}};
}
function healthRank(s:HealthStatus){return {critical:5,blocked:4,attention:3,unknown:2,healthy:1}[s]}
