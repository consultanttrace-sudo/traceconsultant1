import { normalizeHeader, parseAmount } from './dataIntake.js';

export type CanonicalEventType = 'sale'|'void'|'refund'|'discount'|'price_override'|'payment'|'cash_discrepancy'|'comp'|'cancellation';
export type CanonicalImportStatus = 'VALID'|'INVALID'|'DUPLICATE';

export interface CanonicalPOSEventInput {
  sourceRecordId: string;
  outletId?: string;
  employeeId?: string;
  cashierId?: string;
  productId?: string;
  productName?: string;
  qty: number;
  unitPrice: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentAmount: number;
  amount: number;
  currency: string;
  occurredAt: string;
  type: CanonicalEventType;
  status: CanonicalImportStatus;
  sourceFile: string;
  sourceSheet?: string;
  sourceRow: number;
  raw: Record<string, unknown>;
  issues: string[];
}

const aliases: Record<string,string[]> = {
  sourceRecordId:['id','record id','record_id','transaction id','transaction_id','trx id','trx_id','no transaksi','nomor transaksi','invoice','invoice id','order id','order_id','receipt','receipt id','struk'],
  outletId:['outlet id','outlet_id','branch id','branch_id','cabang id','cabang_id'],
  outletName:['outlet','outlet name','nama outlet','cabang','branch','lokasi'],
  employeeId:['employee id','employee_id','staff id','staff_id','pegawai id'],
  cashierId:['cashier id','cashier_id','kasir id','kasir_id'],
  productId:['product id','product_id','item id','item_id','sku','kode produk','kode barang'],
  productName:['product','product name','product_name','item','item name','item_name','nama produk','nama barang','menu'],
  qty:['qty','quantity','jumlah','kuantitas'],
  unitPrice:['unit price','unit_price','harga satuan','harga jual','selling price','price'],
  grossAmount:['gross','gross amount','gross_amount','subtotal','total sebelum diskon'],
  discountAmount:['discount','discount amount','discount_amount','diskon','potongan'],
  netAmount:['net','net amount','net_amount','total','total amount','grand total','net sales','penjualan bersih'],
  paymentAmount:['payment','payment amount','payment_amount','paid','dibayar','jumlah bayar'],
  currency:['currency','mata uang','currency code'],
  occurredAt:['sold at','sold_at','occurred at','occurred_at','transaction date','transaction_date','tanggal transaksi','tanggal','date','datetime','timestamp','waktu'],
  type:['event type','event_type','type','jenis transaksi','jenis event','status transaksi','transaction status','status'],
  status:['status','transaction status','status transaksi']
};

export function findColumn(headers: unknown[], key: string): number {
  const normalized = headers.map(normalizeHeader);
  const candidates = aliases[key] ?? [key];
  return normalized.findIndex(h => candidates.some(a => h===a || h.includes(a)));
}

function cell(row: unknown[], headers: unknown[], key: string): unknown {
  const i=findColumn(headers,key); return i<0?null:row[i] ?? null;
}
function text(row: unknown[],headers:unknown[],key:string):string { return String(cell(row,headers,key)??'').trim(); }
function amount(row:unknown[],headers:unknown[],key:string):number|null { return parseAmount(cell(row,headers,key)); }
function canonicalType(raw:string):CanonicalEventType {
  const s=normalizeHeader(raw);
  if(/refund|retur|pengembalian/.test(s)) return 'refund';
  if(/void|batal|cancel|cancell?ation/.test(s)) return s.includes('cancel')||s.includes('batal')?'cancellation':'void';
  if(/discount|diskon|promo/.test(s)) return 'discount';
  if(/override|manual price|ubah harga|harga manual/.test(s)) return 'price_override';
  if(/payment|bayar|pembayaran/.test(s)) return 'payment';
  if(/cash discrepancy|selisih kas|cash variance/.test(s)) return 'cash_discrepancy';
  if(/comp|complimentary|gratis/.test(s)) return 'comp';
  return 'sale';
}
function isoDate(raw:string):string {
  if(!raw) return '';
  const d=new Date(raw); return Number.isNaN(d.getTime())?'':d.toISOString();
}
function deriveId(row:unknown[],headers:unknown[],rowNo:number,sourceIdentity:string):string {
  const id=text(row,headers,'sourceRecordId');
  return id || `${sourceIdentity||'source'}#row-${rowNo}`;
}

export function mapTabularRows(headers: unknown[], rows: unknown[][], sourceFile: string, sourceSheet?: string, now=new Date(), sourceIdentity=sourceFile): CanonicalPOSEventInput[] {
  const out:CanonicalPOSEventInput[]=[];
  rows.forEach((row,rowIndex)=>{
    if(!row.some(v=>String(v??'').trim()!=='')) return;
    const sourceRow=rowIndex+2;
    const sourceRecordId=deriveId(row,headers,sourceRow,sourceIdentity);
    const productName=text(row,headers,'productName');
    const qty=amount(row,headers,'qty') ?? 1;
    const unitPrice=amount(row,headers,'unitPrice') ?? 0;
    const gross=amount(row,headers,'grossAmount') ?? (qty>0?qty*unitPrice:0);
    const discount=amount(row,headers,'discountAmount') ?? 0;
    const net=amount(row,headers,'netAmount') ?? Math.max(0,gross-discount);
    const payment=amount(row,headers,'paymentAmount') ?? net;
    const amountValue=payment>0?payment:net;
    const occurredAt=isoDate(text(row,headers,'occurredAt'));
    const currency=(text(row,headers,'currency')||'IDR').toUpperCase();
    const type=canonicalType(text(row,headers,'type')||text(row,headers,'status'));
    const issues:string[]=[];
    if(!productName && type==='sale') issues.push('PRODUCT_NAME_MISSING');
    if(qty<=0) issues.push('QTY_INVALID');
    if([unitPrice,gross,discount,net,payment].some(n=>!Number.isFinite(n)||n<0)) issues.push('AMOUNT_INVALID');
    if(discount>gross) issues.push('DISCOUNT_EXCEEDS_GROSS');
    if(Math.abs(net-(gross-discount))>0.01) issues.push('TOTAL_MISMATCH');
    if(!occurredAt) issues.push('TIMESTAMP_INVALID'); else if(new Date(occurredAt)>now) issues.push('TIMESTAMP_FUTURE');
    if(!/^[A-Z]{3}$/.test(currency)) issues.push('CURRENCY_INVALID');
    const productId=text(row,headers,'productId');
    const outletId=text(row,headers,'outletId') || text(row,headers,'outletName');
    out.push({sourceRecordId,outletId:outletId||undefined,employeeId:text(row,headers,'employeeId')||undefined,cashierId:text(row,headers,'cashierId')||undefined,productId:productId||undefined,productName:productName||undefined,qty,unitPrice,grossAmount:gross,discountAmount:discount,netAmount:net,paymentAmount:payment,amount:amountValue,currency,occurredAt,type,status:issues.length?'INVALID':'VALID',sourceFile,sourceSheet,sourceRow,raw:Object.fromEntries(headers.map((h,i)=>[String(h??`column_${i+1}`),row[i]??null])),issues});
  });
  const seen=new Set<string>();
  for(const r of out){
    if(r.status!=='VALID') continue;
    if(seen.has(r.sourceRecordId)){r.status='DUPLICATE';r.issues.push('DUPLICATE_SOURCE_RECORD_ID');}
    else seen.add(r.sourceRecordId);
  }
  return out;
}

export function summarizeCanonicalImport(rows: CanonicalPOSEventInput[]) {
  const valid=rows.filter(r=>r.status==='VALID').length;
  const invalid=rows.filter(r=>r.status==='INVALID').length;
  const duplicate=rows.filter(r=>r.status==='DUPLICATE').length;
  const totals=rows.filter(r=>r.status==='VALID'&&r.type==='sale').reduce((s,r)=>({qty:s.qty+r.qty,net:s.net+r.netAmount,payment:s.payment+r.paymentAmount}),{qty:0,net:0,payment:0});
  return {total:rows.length,valid,invalid,duplicate,saleRows:rows.filter(r=>r.status==='VALID'&&r.type==='sale').length,totals};
}
