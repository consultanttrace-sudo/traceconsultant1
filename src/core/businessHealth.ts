import type { EvidenceItem } from './evidence.js';
import { explainScore, type ScoreDimension } from './intelligence.js';
import type { FinanceSummary } from './finance.js';
import type { POSHealthResult } from './posHealth.js';
import type { InventoryVariance } from './inventoryIntelligence.js';
export interface BusinessHealthResult { score:number|null; dimensions:Array<ScoreDimension & {methodology:string}>; confidencePct:number|null; why:string[]; evidence:ReturnType<typeof explainScore>['evidence']; }
const clamp=(v:number)=>Math.max(0,Math.min(100,v));
function average(values:number[]):number|null{return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function financeScore(f:FinanceSummary):{value:number|null;methodology:string}{
 const parts:number[]=[];
 if(f.operatingMarginPct!==null) parts.push(clamp(f.operatingMarginPct/20*100));
 if(f.cogsPct!==null) parts.push(clamp((50-f.cogsPct)/15*100));
 if(f.laborPct!==null) parts.push(clamp((35-f.laborPct)/15*100));
 if(f.opexPct!==null) parts.push(clamp((30-f.opexPct)/15*100));
 return {value:average(parts),methodology:'Rata-rata sub-score tersedia: operating margin target 20%; COGS target <=35%; labor target <=20%; OPEX target <=15%. Nilai di luar batas dikunci 0–100.'};
}
export function buildBusinessHealth(input:{finance:FinanceSummary;pos?:POSHealthResult|null;inventory?:InventoryVariance[];marketingScore?:number|null;evidence:EvidenceItem[]}):BusinessHealthResult{
 const f=input.finance; const fin=financeScore(f);
 const inv=input.inventory?.length?clamp(100-input.inventory.filter(v=>v.status==='HIGH_VARIANCE').length/input.inventory.length*100):null;
 const risk=input.pos?clamp(100-input.pos.anomalies.reduce((s,a)=>s+(a.severity==='CRITICAL'?30:a.severity==='HIGH'?20:a.severity==='MEDIUM'?10:5),0)):null;
 const dimensions=( [
  {key:'financial',label:'Financial Health',value:fin.value,weight:30,evidence:['finance'],methodology:fin.methodology},
  {key:'pos',label:'POS Health',value:input.pos?.score??null,weight:15,evidence:['pos'],methodology:'100 dikurangi penalty anomaly berbobot severity; transaksi kosong menghasilkan data tidak tersedia.'},
  {key:'cash',label:'Cash Health',value:null,weight:15,evidence:['cash'],methodology:'Belum dihitung karena canonical cash movement/reconciliation belum tersedia; tidak dipaksa menjadi 0.'},
  {key:'inventory',label:'Inventory Health',value:inv,weight:15,evidence:['inventory'],methodology:'100 dikurangi proporsi item berstatus HIGH_VARIANCE; tanpa inventory evidence hasil tidak tersedia.'},
  {key:'marketing',label:'Marketing Health',value:input.marketingScore??null,weight:10,evidence:['marketing'],methodology:'Hanya digunakan bila marketing score berasal dari data terukur; tidak ada score default.'},
  {key:'operations',label:'Operational Health',value:f.grossMarginPct===null?null:clamp(f.grossMarginPct/65*100),weight:10,evidence:['finance'],methodology:'Gross margin dibandingkan target 65%; dikunci 0–100.'},
  {key:'risk',label:'Risk Health',value:risk,weight:5,evidence:['risk'],methodology:'100 dikurangi penalty severity anomaly POS; anomaly bukan bukti fraud.'}
 ] as Array<ScoreDimension & {methodology:string}>);
 const result=explainScore(dimensions,input.evidence); return {score:result.score,dimensions:result.dimensions.map(d=>({...d,methodology:dimensions.find(x=>x.key===d.key)!.methodology})),confidencePct:result.confidencePct,why:result.why,evidence:result.evidence};
}
