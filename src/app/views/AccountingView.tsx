import { useEffect, useState } from 'react';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { buildTrialBalance, calculateRecipeCogs, type Account as LedgerAccount, type JournalEntry as LedgerJournalEntry } from '../../core/accounting';
import { buildArAging, type ArInvoice, type ArPayment } from '../../core/accountsReceivable';
import { buildApAging, type ApBill, type ApPayment } from '../../core/accountsPayable';
import { buildDepreciationSchedule, totalMonthlyDepreciation, type FixedAsset } from '../../core/fixedAssets';
import { isPeriodLocked, type PeriodLock } from '../../core/periodClose';
import { buildBalanceSheet, type BalanceSheetGroup } from '../../core/balanceSheet';
import { withInferredSubTypes } from '../../core/accountSubTypeInference';
import { fmtFieldAmount, getReactSupabase, loadTraceCollections, asArray, useTraceCollections, inputStyle } from './_shared';

export type JournalLineDraft={accountId:string;debit:string|number;credit:string|number;memo:string};
export const EMPTY_JOURNAL_LINE:JournalLineDraft={accountId:'',debit:'',credit:'',memo:''};

export function AccountingView(){
  const [clientId,setClientId]=useState('');
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [accounts,setAccounts]=useState<Array<Record<string,unknown>>>([]);
  const [entries,setEntries]=useState<Array<Record<string,unknown>>>([]);
  const [lines,setLines]=useState<Array<Record<string,unknown>>>([]);
  const [arInvoicesRaw,setArInvoicesRaw]=useState<Array<Record<string,unknown>>>([]);
  const [arPaymentsRaw,setArPaymentsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [apBillsRaw,setApBillsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [apPaymentsRaw,setApPaymentsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [fixedAssetsRaw,setFixedAssetsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [periodLocksRaw,setPeriodLocksRaw]=useState<Array<Record<string,unknown>>>([]);
  const [seeding,setSeeding]=useState(false);
  const [message,setMessage]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');

  const refresh=async()=>{
    if(!clientId.trim()){setAccounts([]);setEntries([]);setLines([]);setArInvoicesRaw([]);setArPaymentsRaw([]);setApBillsRaw([]);setApPaymentsRaw([]);setFixedAssetsRaw([]);setPeriodLocksRaw([]);setLoading(false);return;}
    setLoading(true); setLoadError('');
    try{
      const {data}=await loadTraceCollections([],['accounts','journal_entries','journal_lines','ar_invoices','ar_payments','ap_bills','ap_payments','fixed_assets','period_locks'],clientId);
      setAccounts(asArray(data['accounts']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setEntries(asArray(data['journal_entries']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setLines(asArray(data['journal_lines']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setArInvoicesRaw(asArray(data['ar_invoices']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setArPaymentsRaw(asArray(data['ar_payments']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setApBillsRaw(asArray(data['ap_bills']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setApPaymentsRaw(asArray(data['ap_payments']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setFixedAssetsRaw(asArray(data['fixed_assets']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setPeriodLocksRaw(asArray(data['period_locks']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
    }catch(e){ setLoadError(e instanceof Error?e.message:'Data akuntansi tidak tersedia.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ refresh(); },[clientId]);

  const todayIso=new Date().toISOString().slice(0,10);
  const arInvoices:ArInvoice[]=arInvoicesRaw.map(r=>({id:String(r.id),clientId:String(r.client_id),customerName:String(r.customer_name),invoiceDate:String(r.invoice_date),dueDate:String(r.due_date),amount:Number(r.amount)}));
  const arPayments:ArPayment[]=arPaymentsRaw.map(r=>({invoiceId:String(r.invoice_id),amount:Number(r.amount),paidDate:String(r.paid_date)}));
  const arAging=arInvoices.length?buildArAging(arInvoices,arPayments,todayIso):null;
  const apBills:ApBill[]=apBillsRaw.map(r=>({id:String(r.id),clientId:String(r.client_id),vendorName:String(r.vendor_name),billDate:String(r.bill_date),dueDate:String(r.due_date),amount:Number(r.amount)}));
  const apPayments:ApPayment[]=apPaymentsRaw.map(r=>({billId:String(r.bill_id),amount:Number(r.amount),paidDate:String(r.paid_date)}));
  const apAging=apBills.length?buildApAging(apBills,apPayments,todayIso):null;
  const fixedAssetsList:FixedAsset[]=fixedAssetsRaw.map(r=>({id:String(r.id),clientId:String(r.client_id),name:String(r.name),acquisitionDate:String(r.acquisition_date),acquisitionCost:Number(r.acquisition_cost),usefulLifeMonths:Number(r.useful_life_months),residualValue:Number(r.residual_value)}));
  const monthlyDepreciationTotal=fixedAssetsList.length?totalMonthlyDepreciation(fixedAssetsList):0;
  const periodLocks:PeriodLock[]=periodLocksRaw.map(r=>({period:String(r.period),clientId:String(r.client_id),lockedAt:String(r.locked_at),lockedBy:String(r.locked_by)}));
  const currentPeriod=todayIso.slice(0,7);
  const currentPeriodLocked=isPeriodLocked(currentPeriod,clientId.trim(),periodLocks);

  const [arDraft,setArDraft]=useState({customerName:'',invoiceDate:todayIso,dueDate:todayIso,amount:''});
  const [arPaymentDraft,setArPaymentDraft]=useState({invoiceId:'',amount:'',paidDate:todayIso});
  const [apDraft,setApDraft]=useState({vendorName:'',billDate:todayIso,dueDate:todayIso,amount:''});
  const [apPaymentDraft,setApPaymentDraft]=useState({billId:'',amount:'',paidDate:todayIso});
  const [assetDraft,setAssetDraft]=useState({name:'',acquisitionDate:todayIso,acquisitionCost:'',usefulLifeMonths:'',residualValue:'0'});
  const [lockDraft,setLockDraft]=useState(currentPeriod);
  const [arApBusy,setArApBusy]=useState(false);

  const createArInvoice=async()=>{
    if(!clientId.trim()||!arDraft.customerName.trim()||!arDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_create_ar_invoice',{p_client_id:clientId.trim(),p_customer_name:arDraft.customerName.trim(),p_invoice_date:arDraft.invoiceDate,p_due_date:arDraft.dueDate,p_amount:Number(arDraft.amount)});
      if(error) throw error;
      setMessage('Invoice piutang dibuat.'); setArDraft({customerName:'',invoiceDate:todayIso,dueDate:todayIso,amount:''}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal membuat invoice.'); } finally{ setArApBusy(false); }
  };
  const recordArPayment=async()=>{
    if(!arPaymentDraft.invoiceId||!arPaymentDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_record_ar_payment',{p_invoice_id:arPaymentDraft.invoiceId,p_amount:Number(arPaymentDraft.amount),p_paid_date:arPaymentDraft.paidDate});
      if(error) throw error;
      setMessage('Pembayaran piutang dicatat.'); setArPaymentDraft({invoiceId:'',amount:'',paidDate:todayIso}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal mencatat pembayaran.'); } finally{ setArApBusy(false); }
  };
  const createApBill=async()=>{
    if(!clientId.trim()||!apDraft.vendorName.trim()||!apDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_create_ap_bill',{p_client_id:clientId.trim(),p_vendor_name:apDraft.vendorName.trim(),p_bill_date:apDraft.billDate,p_due_date:apDraft.dueDate,p_amount:Number(apDraft.amount)});
      if(error) throw error;
      setMessage('Tagihan utang dibuat.'); setApDraft({vendorName:'',billDate:todayIso,dueDate:todayIso,amount:''}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal membuat tagihan.'); } finally{ setArApBusy(false); }
  };
  const recordApPayment=async()=>{
    if(!apPaymentDraft.billId||!apPaymentDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_record_ap_payment',{p_bill_id:apPaymentDraft.billId,p_amount:Number(apPaymentDraft.amount),p_paid_date:apPaymentDraft.paidDate});
      if(error) throw error;
      setMessage('Pembayaran utang dicatat.'); setApPaymentDraft({billId:'',amount:'',paidDate:todayIso}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal mencatat pembayaran.'); } finally{ setArApBusy(false); }
  };
  const createFixedAsset=async()=>{
    if(!clientId.trim()||!assetDraft.name.trim()||!assetDraft.acquisitionCost||!assetDraft.usefulLifeMonths) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_create_fixed_asset',{p_client_id:clientId.trim(),p_name:assetDraft.name.trim(),p_acquisition_date:assetDraft.acquisitionDate,p_acquisition_cost:Number(assetDraft.acquisitionCost),p_useful_life_months:Number(assetDraft.usefulLifeMonths),p_residual_value:Number(assetDraft.residualValue||0)});
      if(error) throw error;
      setMessage('Aset tetap ditambahkan.'); setAssetDraft({name:'',acquisitionDate:todayIso,acquisitionCost:'',usefulLifeMonths:'',residualValue:'0'}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal menambah aset.'); } finally{ setArApBusy(false); }
  };
  const lockPeriod=async()=>{
    if(!clientId.trim()||!lockDraft) return;
    if(!window.confirm(`Kunci periode ${lockDraft} untuk klien ini? Tidak bisa dibuka lagi lewat aplikasi — jurnal baru untuk periode ini akan ditolak.`)) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_lock_period',{p_client_id:clientId.trim(),p_period:lockDraft});
      if(error) throw error;
      setMessage(`Periode ${lockDraft} dikunci.`); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal mengunci periode.'); } finally{ setArApBusy(false); }
  };

  const seedDefaultChart=async()=>{
    if(!clientId.trim()) return;
    setSeeding(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {data,error}=await supabase.rpc('trace_seed_default_chart',{p_client_id:clientId.trim()});
      if(error) throw error;
      setMessage(`Chart of accounts default dibuat (${Number(data)??0} akun baru).`);
      await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal membuat chart of accounts.'); }
    finally{ setSeeding(false); }
  };

  const ledgerAccounts:LedgerAccount[]=accounts.map(a=>({id:String(a.id),clientId:String(a.client_id??clientId),code:String(a.code),name:String(a.name),type:a.account_type as LedgerAccount['type'],active:Boolean(a.active)}));
  const ledgerEntries:LedgerJournalEntry[]=entries.map(e=>({
    id:String(e.id),clientId:String(e.client_id??clientId),date:String(e.entry_date),memo:String(e.memo),
    source:(e.source as LedgerJournalEntry['source'])??'manual',
    lines:lines.filter(l=>String(l.entry_id)===String(e.id)).map(l=>({accountId:String(l.account_id),debit:Number(l.debit),credit:Number(l.credit),memo:l.memo?String(l.memo):undefined})),
  }));
  const trialBalance=ledgerAccounts.length?buildTrialBalance(ledgerAccounts,ledgerEntries):null;
  const currentPeriodForNeraca=new Date().toISOString().slice(0,7);
  const neraca=trialBalance&&ledgerAccounts.length?buildBalanceSheet(withInferredSubTypes(ledgerAccounts),trialBalance,currentPeriodForNeraca,null):null;
  const neracaGroups:BalanceSheetGroup[]=neraca?[neraca.asetLancar,neraca.asetTetap,neraca.liabilitasLancar,neraca.liabilitasJangkaPanjang,neraca.ekuitas]:[];

  const [entryDate,setEntryDate]=useState(new Date().toISOString().slice(0,10));
  const [entryMemo,setEntryMemo]=useState('');
  const [entryLines,setEntryLines]=useState<JournalLineDraft[]>([{...EMPTY_JOURNAL_LINE},{...EMPTY_JOURNAL_LINE}]);
  const [posting,setPosting]=useState(false);
  const totalDebit=entryLines.reduce((s,l)=>s+(Number(l.debit)||0),0);
  const totalCredit=entryLines.reduce((s,l)=>s+(Number(l.credit)||0),0);
  const linesValid=entryLines.filter(l=>l.accountId&&(Number(l.debit)>0||Number(l.credit)>0)).length>=2;
  const balanced=totalDebit>0&&Math.abs(totalDebit-totalCredit)<0.005;
  const canPost=clientId.trim()&&entryMemo.trim()&&linesValid&&balanced&&!posting;

  const updateLine=(i:number,patch:Partial<JournalLineDraft>)=>setEntryLines(prev=>prev.map((l,idx)=>idx===i?{...l,...patch}:l));
  const addLine=()=>setEntryLines(prev=>[...prev,{...EMPTY_JOURNAL_LINE}]);
  const removeLine=(i:number)=>setEntryLines(prev=>prev.length>2?prev.filter((_,idx)=>idx!==i):prev);

  const postJournal=async()=>{
    if(!canPost) return;
    setPosting(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const p_lines=entryLines.filter(l=>l.accountId&&(Number(l.debit)>0||Number(l.credit)>0)).map(l=>({account_id:l.accountId,debit:Number(l.debit)||0,credit:Number(l.credit)||0,memo:l.memo.trim()||null}));
      const {error}=await supabase.rpc('trace_post_balanced_journal',{p_client_id:clientId.trim(),p_entry_date:entryDate,p_reference_type:null,p_reference_id:null,p_memo:entryMemo.trim(),p_source:'manual',p_lines});
      if(error) throw error;
      setMessage('Jurnal berhasil diposting.'); setEntryMemo(''); setEntryLines([{...EMPTY_JOURNAL_LINE},{...EMPTY_JOURNAL_LINE}]);
      await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal posting: ${e.message}`:'Gagal posting jurnal.'); }
    finally{ setPosting(false); }
  };

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>AKUNTANSI · CHART OF ACCOUNTS, JURNAL, NERACA, PIUTANG/UTANG, ASET TETAP, TUTUP BUKU</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Chart of accounts, jurnal berpasangan, Neraca, dan modul pendukungnya</h1><div className="trace-muted">Terhubung ke trace_accounts / trace_journal_entries / trace_journal_lines / trace_ar_invoices / trace_ar_payments / trace_ap_bills / trace_ap_payments / trace_fixed_assets / trace_period_locks lewat RPC masing-masing (migration 032–033) — bukan draft lokal. Sub-tipe akun untuk Neraca ditebak dari kode akun, belum jadi kolom database.</div></div>

    <div className="trace-card">
      <label>Klien / Scope (wajib)<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      {message&&<div className="trace-muted" style={{fontSize:12,marginTop:8}}>{message}</div>}
    </div>

    {clientId.trim()&&<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(280px,.8fr)',gap:16}}>
      <div className="trace-card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Chart of Accounts</strong>{accounts.length===0&&<button onClick={seedDefaultChart} disabled={seeding} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>{seeding?'Membuat…':'Buat Chart Default'}</button>}</div>
        {loading?<div className="trace-muted" style={{marginTop:12}}>Memuat…</div>:loadError?<div className="trace-muted" style={{marginTop:12}}>{loadError}</div>:accounts.length===0?<div className="trace-muted" style={{marginTop:12}}>Belum ada akun. Klik "Buat Chart Default" untuk membuat 10 akun standar (Kas, Piutang, Persediaan, Utang, Modal, Pendapatan, COGS, Labor, OPEX, Marketing).</div>:
        <div style={{marginTop:12,display:'grid',gap:5,fontSize:13}}>{[...accounts].sort((a,b)=>String(a.code).localeCompare(String(b.code))).map(a=><div key={String(a.id)} style={{display:'grid',gridTemplateColumns:'70px 1fr 100px',gap:10,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span className="trace-muted">{String(a.code)}</span><span>{String(a.name)}</span><span className="trace-muted" style={{textTransform:'capitalize'}}>{String(a.account_type)}</span></div>)}</div>}
      </div>

      <div className="trace-card" style={{alignSelf:'start'}}>
        <strong>Trial Balance</strong>
        {!trialBalance?<div className="trace-muted" style={{fontSize:12,marginTop:8}}>Buat chart of accounts dulu.</div>:
        <div style={{marginTop:10}}>
          <div style={{display:'flex',gap:9,alignItems:'center',marginBottom:8}}>{trialBalance.balanced?<CircleCheck size={16}/>:<TriangleAlert size={16}/>}<span style={{fontSize:13,fontWeight:700}}>{trialBalance.balanced?'Balanced':'Belum balanced / ada akun hilang'}</span></div>
          <div style={{display:'grid',gap:4,fontSize:12,maxHeight:260,overflowY:'auto'}}>{trialBalance.accounts.filter(r=>r.debit||r.credit).map(r=>{const acc=ledgerAccounts.find(a=>a.id===r.accountId);return <div key={r.accountId} style={{display:'grid',gridTemplateColumns:'1fr 70px 70px',gap:8,padding:'4px 0',borderTop:'1px solid rgba(23,23,23,.06)'}}><span>{acc?`${acc.code} ${acc.name}`:r.accountId}</span><span>{fmtFieldAmount(r.debit)}</span><span>{fmtFieldAmount(r.credit)}</span></div>})}</div>
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:13,marginTop:8,borderTop:'1px solid rgba(23,23,23,.12)',paddingTop:8}}><span>Total</span><span>{fmtFieldAmount(trialBalance.totalDebit)} / {fmtFieldAmount(trialBalance.totalCredit)}</span></div>
        </div>}
      </div>
    </div>}

    {clientId.trim()&&neraca&&<div className="trace-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Neraca (Balance Sheet) — {neraca.asOfPeriod}</strong><div style={{display:'flex',gap:9,alignItems:'center'}}>{neraca.balanced?<CircleCheck size={16}/>:<TriangleAlert size={16}/>}<span style={{fontSize:13,fontWeight:700}}>{neraca.balanced?'Balanced':`Selisih ${fmtFieldAmount(neraca.selisih)}`}</span></div></div>
      <div className="trace-muted" style={{fontSize:12,marginTop:6}}>Sub-tipe akun (aset lancar/tetap, liabilitas jangka pendek/panjang, dst) ditebak otomatis dari kode + tipe akun (lihat accountSubTypeInference.ts) — belum jadi kolom database tersendiri.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:14}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>Aset</div>
          {neracaGroups.slice(0,2).map(g=>g.lines.length>0&&<div key={g.subType} style={{marginBottom:10}}><div className="trace-muted" style={{fontSize:12}}>{g.label}</div>{g.lines.map(l=><div key={l.accountId} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span>{l.accountCode} {l.accountName}</span><span>{fmtFieldAmount(l.balance)}</span></div>)}<div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,borderTop:'1px solid rgba(23,23,23,.1)',paddingTop:4}}><span>Total {g.label}</span><span>{fmtFieldAmount(g.total)}</span></div></div>)}
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,marginTop:6,borderTop:'2px solid #171717',paddingTop:6}}><span>Total Aset</span><span>{fmtFieldAmount(neraca.totalAset)}</span></div>
        </div>
        <div>
          <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>Liabilitas &amp; Ekuitas</div>
          {neracaGroups.slice(2).map(g=>g.lines.length>0&&<div key={g.subType} style={{marginBottom:10}}><div className="trace-muted" style={{fontSize:12}}>{g.label}</div>{g.lines.map(l=><div key={l.accountId} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span>{l.accountCode} {l.accountName}</span><span>{fmtFieldAmount(l.balance)}</span></div>)}<div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,borderTop:'1px solid rgba(23,23,23,.1)',paddingTop:4}}><span>Total {g.label}</span><span>{fmtFieldAmount(g.total)}</span></div></div>)}
          {neraca.labaBerjalan!==null&&<div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span>Laba berjalan (belum ditutup)</span><span>{fmtFieldAmount(neraca.labaBerjalan)}</span></div>}
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,marginTop:6,borderTop:'2px solid #171717',paddingTop:6}}><span>Total Liabilitas + Ekuitas</span><span>{fmtFieldAmount(neraca.totalLiabilitasDanEkuitas)}</span></div>
        </div>
      </div>
      {neraca.missingAccountIds.length>0&&<div className="trace-muted" style={{fontSize:12,marginTop:10,color:'#b91c1c'}}>{neraca.missingAccountIds.length} akun punya saldo di jurnal tapi tidak ketemu di chart of accounts — cek data sebelum kirim laporan ke klien.</div>}
    </div>}

    {clientId.trim()&&accounts.length>0&&<div className="trace-card">
      <strong>Posting Jurnal Baru</strong>
      <div style={{display:'grid',gap:10,marginTop:10}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
          <label>Tanggal<input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} style={inputStyle}/></label>
          <label>Memo<input value={entryMemo} onChange={e=>setEntryMemo(e.target.value)} placeholder="mis. Penjualan tunai 14 Sep" style={inputStyle}/></label>
        </div>
        {entryLines.map((l,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,alignItems:'center'}}>
          <select value={l.accountId} onChange={e=>updateLine(i,{accountId:e.target.value})} style={inputStyle}><option value="">Pilih akun</option>{[...accounts].sort((a,b)=>String(a.code).localeCompare(String(b.code))).map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} · {String(a.name)}</option>)}</select>
          <input type="number" placeholder="Debit" value={l.debit} onChange={e=>updateLine(i,{debit:e.target.value,credit:e.target.value?0:l.credit})} style={inputStyle}/>
          <input type="number" placeholder="Kredit" value={l.credit} onChange={e=>updateLine(i,{credit:e.target.value,debit:e.target.value?0:l.debit})} style={inputStyle}/>
          <button onClick={()=>removeLine(i)} disabled={entryLines.length<=2} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 10px',background:'#fff',cursor:entryLines.length>2?'pointer':'not-allowed'}}><X size={14}/></button>
        </div>)}
        <button onClick={addLine} style={{justifySelf:'start',border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}}>+ Tambah baris</button>
        <div className="trace-muted" style={{fontSize:12}}>Total debit {fmtFieldAmount(totalDebit)} · Total kredit {fmtFieldAmount(totalCredit)} · {balanced?'Sudah balance.':'Belum balance — debit harus sama dengan kredit.'}</div>
        <button onClick={postJournal} disabled={!canPost} style={{justifySelf:'start',border:0,borderRadius:9,padding:'10px 16px',background:canPost?'#171717':'#eee',color:canPost?'#fff':'#999',fontWeight:700,cursor:canPost?'pointer':'not-allowed'}}>{posting?'Memposting…':'Posting Jurnal'}</button>
      </div>
    </div>}

    {clientId.trim()&&entries.length>0&&<div className="trace-card">
      <strong>Histori Jurnal</strong>
      <div style={{marginTop:10,display:'grid',gap:6,fontSize:13}}>{[...entries].sort((a,b)=>String(b.entry_date).localeCompare(String(a.entry_date))).map(e=><div key={String(e.id)} style={{padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><div style={{display:'flex',justifyContent:'space-between'}}><span>{String(e.entry_date)}</span><span className="trace-muted">{String(e.source)}</span></div><div>{String(e.memo)}</div></div>)}</div>
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Piutang Usaha (AR) &amp; Umur Piutang</strong>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Nama pelanggan<input value={arDraft.customerName} onChange={e=>setArDraft(d=>({...d,customerName:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl invoice<input type="date" value={arDraft.invoiceDate} onChange={e=>setArDraft(d=>({...d,invoiceDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jatuh tempo<input type="date" value={arDraft.dueDate} onChange={e=>setArDraft(d=>({...d,dueDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jumlah<input type="number" value={arDraft.amount} onChange={e=>setArDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <button onClick={createArInvoice} disabled={arApBusy} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>+ Invoice</button>
      </div>
      {arAging&&<div style={{marginTop:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,fontSize:12}}>{(Object.keys(arAging.buckets) as Array<keyof typeof arAging.buckets>).map(b=><div key={b} style={{border:'1px solid rgba(23,23,23,.1)',borderRadius:9,padding:8}}><div className="trace-muted">{b}</div><div style={{fontWeight:700}}>{fmtFieldAmount(arAging.buckets[b])}</div></div>)}</div>
        <div style={{marginTop:10,fontSize:13,fontWeight:700}}>Total belum tertagih: {fmtFieldAmount(arAging.totalOutstanding)}</div>
        <div style={{marginTop:10,display:'grid',gap:5,fontSize:13,maxHeight:220,overflowY:'auto'}}>{arAging.invoices.map(s=><div key={s.invoice.id} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 90px 90px',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{s.invoice.customerName}</span><span className="trace-muted">jth {s.invoice.dueDate}</span><span>{fmtFieldAmount(s.outstanding)} sisa</span><span className="trace-muted">{s.status}</span><span className="trace-muted">{s.agingBucket}</span></div>)}</div>
      </div>}
      {arInvoices.length>0&&<div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginTop:14,alignItems:'end'}}>
        <label style={{fontSize:12}}>Invoice<select value={arPaymentDraft.invoiceId} onChange={e=>setArPaymentDraft(d=>({...d,invoiceId:e.target.value}))} style={inputStyle}><option value="">Pilih invoice</option>{arInvoices.map(i=><option key={i.id} value={i.id}>{i.customerName} · {fmtFieldAmount(i.amount)}</option>)}</select></label>
        <label style={{fontSize:12}}>Jumlah bayar<input type="number" value={arPaymentDraft.amount} onChange={e=>setArPaymentDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl bayar<input type="date" value={arPaymentDraft.paidDate} onChange={e=>setArPaymentDraft(d=>({...d,paidDate:e.target.value}))} style={inputStyle}/></label>
        <button onClick={recordArPayment} disabled={arApBusy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 14px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Catat Bayar</button>
      </div>}
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Utang Usaha (AP) &amp; Umur Utang</strong>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Nama supplier<input value={apDraft.vendorName} onChange={e=>setApDraft(d=>({...d,vendorName:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl tagihan<input type="date" value={apDraft.billDate} onChange={e=>setApDraft(d=>({...d,billDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jatuh tempo<input type="date" value={apDraft.dueDate} onChange={e=>setApDraft(d=>({...d,dueDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jumlah<input type="number" value={apDraft.amount} onChange={e=>setApDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <button onClick={createApBill} disabled={arApBusy} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>+ Tagihan</button>
      </div>
      {apAging&&<div style={{marginTop:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,fontSize:12}}>{(Object.keys(apAging.buckets) as Array<keyof typeof apAging.buckets>).map(b=><div key={b} style={{border:'1px solid rgba(23,23,23,.1)',borderRadius:9,padding:8}}><div className="trace-muted">{b}</div><div style={{fontWeight:700}}>{fmtFieldAmount(apAging.buckets[b])}</div></div>)}</div>
        <div style={{marginTop:10,fontSize:13,fontWeight:700}}>Total belum dibayar: {fmtFieldAmount(apAging.totalOutstanding)}</div>
        <div style={{marginTop:10,display:'grid',gap:5,fontSize:13,maxHeight:220,overflowY:'auto'}}>{apAging.bills.map(s=><div key={s.bill.id} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 90px 90px',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{s.bill.vendorName}</span><span className="trace-muted">jth {s.bill.dueDate}</span><span>{fmtFieldAmount(s.outstanding)} sisa</span><span className="trace-muted">{s.status}</span><span className="trace-muted">{s.agingBucket}</span></div>)}</div>
      </div>}
      {apBills.length>0&&<div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginTop:14,alignItems:'end'}}>
        <label style={{fontSize:12}}>Tagihan<select value={apPaymentDraft.billId} onChange={e=>setApPaymentDraft(d=>({...d,billId:e.target.value}))} style={inputStyle}><option value="">Pilih tagihan</option>{apBills.map(b=><option key={b.id} value={b.id}>{b.vendorName} · {fmtFieldAmount(b.amount)}</option>)}</select></label>
        <label style={{fontSize:12}}>Jumlah bayar<input type="number" value={apPaymentDraft.amount} onChange={e=>setApPaymentDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl bayar<input type="date" value={apPaymentDraft.paidDate} onChange={e=>setApPaymentDraft(d=>({...d,paidDate:e.target.value}))} style={inputStyle}/></label>
        <button onClick={recordApPayment} disabled={arApBusy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 14px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Catat Bayar</button>
      </div>}
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Aset Tetap &amp; Penyusutan</strong>
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr 1fr auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Nama aset<input value={assetDraft.name} onChange={e=>setAssetDraft(d=>({...d,name:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl beli<input type="date" value={assetDraft.acquisitionDate} onChange={e=>setAssetDraft(d=>({...d,acquisitionDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Harga beli<input type="number" value={assetDraft.acquisitionCost} onChange={e=>setAssetDraft(d=>({...d,acquisitionCost:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Umur (bulan)<input type="number" value={assetDraft.usefulLifeMonths} onChange={e=>setAssetDraft(d=>({...d,usefulLifeMonths:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Nilai sisa<input type="number" value={assetDraft.residualValue} onChange={e=>setAssetDraft(d=>({...d,residualValue:e.target.value}))} style={inputStyle}/></label>
        <button onClick={createFixedAsset} disabled={arApBusy} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>+ Aset</button>
      </div>
      {fixedAssetsList.length>0&&<div style={{marginTop:14}}>
        <div style={{fontSize:13,fontWeight:700}}>Total penyusutan/bulan (semua aset): {fmtFieldAmount(monthlyDepreciationTotal)}</div>
        <div style={{marginTop:10,display:'grid',gap:5,fontSize:13}}>{fixedAssetsList.map(a=>{const sched=buildDepreciationSchedule(a,[currentPeriod]); return <div key={a.id} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{a.name}</span><span className="trace-muted">beli {a.acquisitionDate}</span><span>{fmtFieldAmount(sched.monthlyDepreciation)}/bln</span><span className="trace-muted">{sched.fullyDepreciated?'lunas susut':`sisa buku ${fmtFieldAmount(sched.schedule[0]?.bookValue)}`}</span></div>;})}</div>
      </div>}
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Tutup Buku (Period Lock)</strong>
      <div className="trace-muted" style={{fontSize:12,marginTop:6}}>Mengunci periode mencegah jurnal baru diposting ke bulan itu — tidak bisa dibuka lagi lewat aplikasi. Periode berjalan ({currentPeriod}): <b>{currentPeriodLocked?'sudah terkunci':'masih terbuka'}</b>.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,marginTop:10,maxWidth:320}}>
        <input type="month" value={lockDraft} onChange={e=>setLockDraft(e.target.value)} style={inputStyle}/>
        <button onClick={lockPeriod} disabled={arApBusy||periodLocks.some(l=>l.period===lockDraft)} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#b91c1c',color:'#fff',fontWeight:700,cursor:'pointer'}}>Kunci Periode</button>
      </div>
      {periodLocks.length>0&&<div style={{marginTop:12,display:'grid',gap:4,fontSize:13}}>{[...periodLocks].sort((a,b)=>b.period.localeCompare(a.period)).map(l=><div key={l.period} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{l.period}</span><span className="trace-muted">dikunci {String(l.lockedAt).slice(0,10)}</span></div>)}</div>}
    </div>}

    <div className="trace-card" style={{background:'#fff7ed',border:'1px solid #fed7aa'}}>
      <strong style={{fontSize:13}}>Belum termasuk di layar ini</strong>
      <div className="trace-muted" style={{fontSize:12,marginTop:6}}>COGS resep (`calculateRecipeCogs`) belum ada UI-nya di sini karena butuh input komponen resep per produk yang saat ini hidup di modul inventory — akan menyusul sebagai layar terpisah, bukan diklaim selesai di sini.</div>
    </div>
  </div>
}

