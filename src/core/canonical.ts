export type DataProvider = 'moka'|'pawoon'|'majoo'|'qasir'|'custom_pos'|'csv'|'excel'|'api'|'webhook'|'manual'|'unknown';
export interface DataProvenance { source: string; provider: DataProvider; recordId: string; importedAt: string; normalizedAt: string; sourceFile?: string; sourceRow?: number; }
export interface CanonicalSale { id:string; organizationId:string; outletId?:string; cashierId?:string; employeeId?:string; customerId?:string; productId?:string; productName:string; qty:number; unitPrice:number; grossAmount:number; discountAmount:number; netAmount:number; paymentAmount:number; currency:string; soldAt:string; status:'completed'|'voided'|'refunded'|'comped'|'cancelled'; source:DataProvenance; }
export interface ValidationIssue { code:string; field:string; severity:'error'|'warning'; message:string; }
export interface ValidationResult<T> { valid:boolean; value:T|null; issues:ValidationIssue[]; }

const money=(n:number)=>Number.isFinite(n)&&n>=0;
export function validateCanonicalSale(sale:CanonicalSale, now=new Date()):ValidationResult<CanonicalSale>{
  const issues:ValidationIssue[]=[];
  if(!sale.id) issues.push({code:'MISSING_ID',field:'id',severity:'error',message:'Sale ID wajib ada.'});
  if(!sale.organizationId) issues.push({code:'MISSING_ORG',field:'organizationId',severity:'error',message:'Organization wajib ada.'});
  if(!sale.productName.trim()) issues.push({code:'MISSING_PRODUCT',field:'productName',severity:'error',message:'Nama produk wajib ada.'});
  if(!Number.isFinite(sale.qty)||sale.qty<=0) issues.push({code:'INVALID_QTY',field:'qty',severity:'error',message:'Qty harus lebih besar dari 0.'});
  for(const field of ['unitPrice','grossAmount','discountAmount','netAmount','paymentAmount'] as const) if(!money(sale[field])) issues.push({code:'INVALID_AMOUNT',field,severity:'error',message:`${field} harus berupa angka >= 0.`});
  if(sale.discountAmount>sale.grossAmount) issues.push({code:'DISCOUNT_EXCEEDS_GROSS',field:'discountAmount',severity:'error',message:'Discount tidak boleh melebihi gross amount.'});
  if(Math.abs(sale.netAmount-(sale.grossAmount-sale.discountAmount))>0.01) issues.push({code:'TOTAL_MISMATCH',field:'netAmount',severity:'error',message:'Net amount tidak konsisten dengan gross - discount.'});
  if(!/^[A-Z]{3}$/.test(sale.currency)) issues.push({code:'INVALID_CURRENCY',field:'currency',severity:'error',message:'Currency harus ISO 4217 3 huruf.'});
  const d=new Date(sale.soldAt); if(Number.isNaN(d.getTime())) issues.push({code:'INVALID_TIMESTAMP',field:'soldAt',severity:'error',message:'Timestamp transaksi tidak valid.'}); else if(d>now) issues.push({code:'FUTURE_TIMESTAMP',field:'soldAt',severity:'error',message:'Timestamp transaksi berada di masa depan.'});
  if(!sale.source.provider||!sale.source.recordId) issues.push({code:'MISSING_PROVENANCE',field:'source',severity:'error',message:'Provider dan record ID wajib untuk provenance.'});
  return {valid:issues.every(i=>i.severity!=='error'),value:issues.some(i=>i.severity==='error')?null:sale,issues};
}

export interface ImportDuplicate { recordId:string; occurrences:number[]; }
export function detectDuplicateRecordIds(rows:Array<{recordId:string}>, limit=100):ImportDuplicate[]{
  const seen=new Map<string,number[]>(); rows.forEach((r,i)=>{const id=r.recordId.trim(); if(!id)return; const list=seen.get(id)??[]; list.push(i+1); seen.set(id,list);});
  return [...seen.entries()].filter(([,rows])=>rows.length>1).slice(0,limit).map(([recordId,occurrences])=>({recordId,occurrences}));
}
