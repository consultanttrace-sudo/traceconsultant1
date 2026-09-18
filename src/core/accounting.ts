export type AccountingAccountType = 'asset'|'liability'|'equity'|'revenue'|'cogs'|'expense';
export interface Account { id:string; clientId:string; code:string; name:string; type:AccountingAccountType; parentId?:string; active:boolean; }
export interface JournalLine { accountId:string; debit:number; credit:number; memo?:string; }
export interface JournalEntry { id:string; clientId:string; date:string; memo:string; source:'manual'|'imported'|'system'|'adjustment'; lines:JournalLine[]; }
export interface AccountingBalance { accountId:string; debit:number; credit:number; balance:number; }
export interface TrialBalance { balanced:boolean; totalDebit:number; totalCredit:number; accounts:AccountingBalance[]; missingAccountIds:string[]; }
export interface CogsInput { productId:string; qty:number; components:Array<{itemId:string;qtyPerSale:number;unitCost:number|null}>; }
export interface CogsResult { productId:string; qty:number; cogs:number|null; missingItemIds:string[]; formula:string; status:'calculated'|'insufficient_data'; }

export function buildTrialBalance(accounts:Account[], entries:JournalEntry[]):TrialBalance {
  const balances=new Map<string,{debit:number;credit:number}>(); const missing=new Set<string>();
  for(const a of accounts) balances.set(a.id,{debit:0,credit:0});
  for(const e of entries) for(const l of e.lines){
    if(!Number.isFinite(l.debit)||!Number.isFinite(l.credit)||l.debit<0||l.credit<0||(l.debit>0&&l.credit>0)||(l.debit===0&&l.credit===0)) continue;
    const b=balances.get(l.accountId); if(!b){missing.add(l.accountId);continue;} b.debit+=l.debit;b.credit+=l.credit;
  }
  const rows=accounts.filter(a=>balances.has(a.id)).map(a=>{const b=balances.get(a.id)!;return {accountId:a.id,debit:b.debit,credit:b.credit,balance:b.debit-b.credit};});
  const totalDebit=rows.reduce((s,r)=>s+r.debit,0), totalCredit=rows.reduce((s,r)=>s+r.credit,0);
  return {balanced:missing.size===0&&Math.abs(totalDebit-totalCredit)<0.005,totalDebit,totalCredit,accounts:rows,missingAccountIds:[...missing]};
}

export function calculateRecipeCogs(inputs:CogsInput[]):CogsResult[] {
  return inputs.map(i=>{
    if(!Number.isFinite(i.qty)||i.qty<=0) return {productId:i.productId,qty:i.qty,cogs:null,missingItemIds:[],formula:'qty × Σ(component qty per sale × unit cost)',status:'insufficient_data'};
    const missing=i.components.filter(c=>!Number.isFinite(c.unitCost)||c.unitCost!<0).map(c=>c.itemId);
    if(missing.length) return {productId:i.productId,qty:i.qty,cogs:null,missingItemIds:[...new Set(missing)],formula:'qty × Σ(component qty per sale × unit cost)',status:'insufficient_data'};
    const unit=i.components.reduce((s,c)=>s+c.qtyPerSale*c.unitCost!,0);
    return {productId:i.productId,qty:i.qty,cogs:i.qty*unit,missingItemIds:[],formula:'qty × Σ(component qty per sale × unit cost)',status:'calculated'};
  });
}

export interface BusinessProfitChain { revenue:number|null; cogs:number|null; grossProfit:number|null; labor:number|null; opex:number|null; operatingProfit:number|null; missing:string[]; }
export function buildProfitChain(values:{revenue?:number|null;cogs?:number|null;labor?:number|null;opex?:number|null}):BusinessProfitChain {
  const revenue=finiteOrNull(values.revenue),cogs=finiteOrNull(values.cogs),labor=finiteOrNull(values.labor),opex=finiteOrNull(values.opex);
  const missing:string[]=[]; if(revenue===null)missing.push('Revenue');if(cogs===null)missing.push('COGS');if(labor===null)missing.push('Labor');if(opex===null)missing.push('OPEX');
  const grossProfit=revenue!==null&&cogs!==null?revenue-cogs:null;
  const operatingProfit=revenue!==null&&cogs!==null&&labor!==null&&opex!==null?revenue-cogs-labor-opex:null;
  return {revenue,cogs,grossProfit,labor,opex,operatingProfit,missing};
}
function finiteOrNull(v:number|null|undefined){return typeof v==='number'&&Number.isFinite(v)?v:null;}
