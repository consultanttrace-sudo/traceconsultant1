export type POSEventType='sale'|'void'|'refund'|'discount'|'price_override'|'payment'|'cash_discrepancy'|'comp'|'cancellation';
export interface POSEvent { id:string; organizationId:string; outletId?:string; employeeId?:string; cashierId?:string; productId?:string; type:POSEventType; amount:number; occurredAt:string; linkedSaleId?:string; sourceRecordId?:string; }
export interface POSAnomaly { code:string; title:string; severity:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'; eventType:POSEventType; entity?:string; observed:number; baseline:number|null; ratioPct:number|null; financialImpact:number|null; evidenceIds:string[]; explanation:string; confidence:'VERIFIED'|'HIGH CONFIDENCE'|'MEDIUM CONFIDENCE'|'LOW CONFIDENCE'|'INSUFFICIENT DATA'; }
export interface POSHealthResult { score:number|null; anomalies:POSAnomaly[]; metrics:{transactions:number;voidRatePct:number|null;refundRatePct:number|null;discountRatePct:number|null;priceOverrideRatePct:number|null;cashDiscrepancy:number|null}; }
const pct=(a:number,b:number)=>b>0?(a/b)*100:null;
const ratio=(v:number,b:number)=>b>0?(v/b)*100:null;
function severity(ratioPct:number){if(ratioPct>=500)return 'CRITICAL' as const;if(ratioPct>=250)return 'HIGH' as const;if(ratioPct>=150)return 'MEDIUM' as const;return 'LOW' as const;}
export function analyzePOSHealth(events:POSEvent[], previousEvents:POSEvent[]=[]):POSHealthResult{
  const sales=events.filter(e=>e.type==='sale').length; const count=(t:POSEventType)=>events.filter(e=>e.type===t).length;
  const voids=count('void'), refunds=count('refund'), discounts=count('discount'), overrides=count('price_override');
  const prevSales=previousEvents.filter(e=>e.type==='sale').length;
  const prevRate=(t:POSEventType)=>pct(previousEvents.filter(e=>e.type===t).length,prevSales);
  const mk=(type:POSEventType,title:string,current:number,severityBase:boolean):POSAnomaly|null=>{const base=prevRate(type); if(!severityBase||current===0)return null; const r=base&&base>0?current/base*100:null; return {code:`ABNORMAL_${type.toUpperCase()}_RATE`,title,severity:r===null?'LOW':severity(r),eventType:type,observed:current,baseline:base,ratioPct:r,financialImpact:events.filter(e=>e.type===type).reduce((s,e)=>s+e.amount,0)||null,evidenceIds:events.filter(e=>e.type===type).map(e=>e.id).slice(0,20),explanation:`Rate ${type} saat ini ${current.toFixed(2)}%; baseline periode pembanding ${base===null?'tidak tersedia':base.toFixed(2)+'%'}.`,confidence:base===null?'INSUFFICIENT DATA':'HIGH CONFIDENCE'};};
  const anomalies=[mk('void','Void rate abnormal',pct(voids,sales)??0,true),mk('refund','Refund rate abnormal',pct(refunds,sales)??0,true),mk('discount','Discount rate abnormal',pct(discounts,sales)??0,true),mk('price_override','Manual price override abnormal',pct(overrides,sales)??0,true)].filter(Boolean) as POSAnomaly[];
  const cash=events.filter(e=>e.type==='cash_discrepancy').reduce((s,e)=>s+Math.abs(e.amount),0); if(cash>0) anomalies.push({code:'CASH_DISCREPANCY',title:'Cash discrepancy terdeteksi',severity:'HIGH',eventType:'cash_discrepancy',observed:cash,baseline:null,ratioPct:null,financialImpact:cash,evidenceIds:events.filter(e=>e.type==='cash_discrepancy').map(e=>e.id),explanation:'Selisih kas tercatat; sistem tidak menyimpulkan fraud tanpa evidence tambahan.',confidence:'VERIFIED'});
  const sequenceAnomalies=detectSuspiciousSequences(events); anomalies.push(...sequenceAnomalies);
  const penalties=anomalies.reduce((s,a)=>s+(a.severity==='CRITICAL'?30:a.severity==='HIGH'?20:a.severity==='MEDIUM'?10:5),0); const score=sales?Math.max(0,Math.min(100,100-penalties)):null;
  return {score,anomalies,metrics:{transactions:sales,voidRatePct:pct(voids,sales),refundRatePct:pct(refunds,sales),discountRatePct:pct(discounts,sales),priceOverrideRatePct:pct(overrides,sales),cashDiscrepancy:cash||null}};
}

function detectSuspiciousSequences(events:POSEvent[]):POSAnomaly[]{
  const bySale=new Map<string,POSEvent[]>();
  for(const e of events){const key=e.linkedSaleId||e.sourceRecordId; if(!key) continue; const arr=bySale.get(key)??[]; arr.push(e); bySale.set(key,arr);}
  const findings:POSAnomaly[]=[];
  for(const [key,arr] of bySale){arr.sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)); const types=arr.map(e=>e.type);
    const suspicious=(types.includes('payment')&&types.includes('void'))||(types.includes('refund')&&types.includes('discount'));
    if(suspicious) findings.push({code:'SUSPICIOUS_TRANSACTION_SEQUENCE',title:'Urutan transaksi perlu ditinjau',severity:'MEDIUM',eventType:types.includes('void')?'void':'refund',observed:1,baseline:null,ratioPct:null,financialImpact:arr.reduce((s,e)=>s+e.amount,0)||null,evidenceIds:arr.map(e=>e.id),explanation:`Transaksi ${key} memiliki kombinasi event ${types.join(' → ')} yang perlu direview. Ini bukan bukti fraud.`,confidence:'MEDIUM CONFIDENCE'});
  }
  return findings.slice(0,50);
}
