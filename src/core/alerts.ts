import type { POSAnomaly } from './posHealth.js';
import type { InventoryVariance } from './inventoryIntelligence.js';
export type AlertSeverity='INFO'|'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
export interface BusinessAlert { id:string; severity:AlertSeverity; title:string; what:string; why:string; impact:number|null; confidence:string; evidenceIds:string[]; status:'OPEN'|'ACKNOWLEDGED'|'RESOLVED'|'DISMISSED'; createdAt:string; }
export function buildAlerts(anomalies:POSAnomaly[], inventory:InventoryVariance[], now=new Date().toISOString()):BusinessAlert[]{
 const out:BusinessAlert[]=[];
 anomalies.forEach(a=>out.push({id:`anomaly:${a.code}:${a.evidenceIds[0]??'none'}`,severity:a.severity,title:a.title,what:a.explanation,why:'Baseline comparison atau event langsung menunjukkan pola yang perlu ditinjau.',impact:a.financialImpact,confidence:a.confidence,evidenceIds:a.evidenceIds,status:'OPEN',createdAt:now}));
 inventory.filter(v=>v.status==='HIGH_VARIANCE'||v.status==='WATCH').forEach(v=>out.push({id:`inventory:${v.itemId}`,severity:v.status==='HIGH_VARIANCE'?'HIGH':'MEDIUM',title:'Inventory variance terdeteksi',what:`Variance ${v.varianceQty===null?'tidak dapat dihitung':v.varianceQty.toFixed(2)} unit pada item ${v.itemId}.`,why:'Perbandingan theoretical consumption dengan actual inventory movement.',impact:v.estimatedImpact,confidence:v.expectedQty===null?'INSUFFICIENT DATA':'HIGH CONFIDENCE',evidenceIds:v.evidenceIds,status:'OPEN',createdAt:now}));
 return out;
}
