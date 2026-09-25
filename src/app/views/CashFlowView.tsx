import { useEffect, useState } from 'react';
import { buildCashFlowStatement, type CashFlowInput } from '../../core/cashFlowStatement';
import { buildIncomeStatement } from '../../core/financeStatement';
import { filterFinanceRecordsByOutlet, type FinanceRecord, type FinanceStatementSection } from '../../core/finance';
import { totalMonthlyDepreciation, type FixedAsset } from '../../core/fixedAssets';
import { fmtFieldAmount, loadTraceCollections, asArray, useTraceCollections, inputStyle } from './_shared';
import { useClientScope } from '../clientScope';
import { useOutletScope, usePeriodScope } from '../scopeStore';
import { OutletSelector, PeriodSelector } from '../components/ScopeSelectors';
import { TracePageHeader, TraceCard } from '../components/TraceUI';

export function CashFlowView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useClientScope();
  const [outletId]=useOutletScope();
  const [financeRaw,setFinanceRaw]=useState<Array<Record<string,unknown>>>([]);
  const [fixedAssetsRaw,setFixedAssetsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState('');

  const refresh=async()=>{
    if(!clientId){ setFinanceRaw([]); setFixedAssetsRaw([]); return; }
    setLoading(true); setMsg('');
    try{
      const {data}=await loadTraceCollections([],['finance','fixed_assets'],clientId);
      setFinanceRaw(asArray(data.finance).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      setFixedAssetsRaw(asArray(data.fixed_assets).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
    }catch(e){ setMsg(e instanceof Error?e.message:'Gagal memuat data keuangan.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{void refresh()},[clientId]);

  // labaBersih: dari buildIncomeStatement, fungsi yang sama dipakai FinanceEntry — tidak dihitung ulang.
  // Difilter ke outlet yang dipilih di scope global (kosong = semua outlet/pusat, seperti sebelumnya).
  const records:FinanceRecord[]=filterFinanceRecordsByOutlet(financeRaw.map(r=>({id:String(r.id),period:String(r.period),amount:Number(r.amount),category:r.category as FinanceRecord['category'],outletId:r.outlet_id?String(r.outlet_id):undefined,accountLabel:r.account_label?String(r.account_label):undefined,statementSection:r.statement_section?r.statement_section as FinanceStatementSection:undefined})),outletId);
  const periods=[...new Set(records.map(r=>r.period))].sort();
  const ps=usePeriodScope('latest',periods); const effectivePeriod=ps.period;
  const incomeStatement=effectivePeriod&&ps.hasData!==false?buildIncomeStatement(records,effectivePeriod):null;

  // bebanPenyusutan: dari totalMonthlyDepreciation, fungsi yang sama dipakai AccountingView — tidak dihitung ulang.
  const fixedAssetsList:FixedAsset[]=fixedAssetsRaw.map(r=>({id:String(r.id),clientId:String(r.client_id),name:String(r.name),acquisitionDate:String(r.acquisition_date),acquisitionCost:Number(r.acquisition_cost),usefulLifeMonths:Number(r.useful_life_months),residualValue:Number(r.residual_value)}));
  const bebanPenyusutan=fixedAssetsList.length?totalMonthlyDepreciation(fixedAssetsList):null;

  // Field lain belum punya sumber data yang sudah dipakai di modul lain — dibiarkan null,
  // bukan ditebak/dipaksa 0, supaya missingInputs dari buildCashFlowStatement tetap jujur.
  const cashFlowInput:CashFlowInput={
    period:effectivePeriod,
    labaBersih:incomeStatement?incomeStatement.labaBersih:null,
    bebanPenyusutan,
    perubahanPiutangUsaha:null,
    perubahanPersediaan:null,
    perubahanUtangUsaha:null,
    perubahanAsetTetapKotor:null,
    perubahanUtangBank:null,
    perubahanModal:null,
    prive:null,
    kasAwalPeriode:null,
  };
  const cashFlow=effectivePeriod&&ps.hasData!==false?buildCashFlowStatement(cashFlowInput):null;

  const section=(title:string,sec:{lines:{label:string;amount:number}[];total:number}|undefined)=>sec&&<div style={{marginTop:14}}>
    <strong>{title}</strong>
    <div style={{marginTop:8,display:'grid',gap:5,fontSize:13}}>
      {sec.lines.map(l=><div key={l.label} style={{display:'flex',justifyContent:'space-between',padding:'5px 0',borderTop:'1px solid rgba(23,23,23,.06)'}}><span>{l.label}</span><span>{fmtFieldAmount(l.amount)}</span></div>)}
      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderTop:'1px solid rgba(23,23,23,.14)',fontWeight:700}}><span>Total</span><span>{fmtFieldAmount(sec.total)}</span></div>
    </div>
  </div>;

  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="AKUNTANSI · LAPORAN ARUS KAS (METODE TIDAK LANGSUNG)" title="Laba di atas kertas ≠ kas di tangan." description={'Dihitung `buildCashFlowStatement()` dari Laba Bersih (`buildIncomeStatement`, sama seperti Keuangan) dan Beban Penyusutan (`totalMonthlyDepreciation`, sama seperti Akuntansi). Input lain (perubahan piutang, persediaan, utang, aset tetap, modal, prive, kas awal) belum punya sumber data terhubung — dibiarkan kosong dan selalu tampil di daftar "data belum lengkap" di bawah, bukan ditebak jadi Rp0.'} />

    <TraceCard>
      <div style={{display:'grid',gridTemplateColumns:'1fr 200px 200px',gap:10}}>
        <label>Klien<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}>
          <option value="">Pilih klien</option>
          {clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}
        </select></label>
        <OutletSelector clientId={clientId} dataOutletIds={[...new Set(financeRaw.map(r=>r.outlet_id?String(r.outlet_id):'').filter(Boolean))]}/>
        <PeriodSelector fallback="latest" available={periods}/>
      </div>
      {loading&&<div className="trace-muted" style={{marginTop:8}}>Memuat…</div>}
      {msg&&<div className="trace-muted" style={{marginTop:8}}>{msg}</div>}
      {clientId&&outletId&&<div className="trace-muted" style={{marginTop:8}}>Arus kas ini hanya menghitung record yang ditandai outlet <b>{outletId}</b>; record tingkat klien tanpa outlet tidak ikut. Kosongkan outlet untuk melihat semua.</div>}
      {clientId&&!effectivePeriod&&<div className="trace-muted" style={{marginTop:8}}>Belum ada data finance untuk klien ini — isi dulu di tab Keuangan.</div>}
      {clientId&&!loading&&ps.hasData===false&&<div className="trace-muted" style={{marginTop:8}}>Belum ada data finance untuk periode {effectivePeriod} — arus kas tidak dihitung. Pilih periode lain di atas.</div>}
    </TraceCard>

    {cashFlow&&<TraceCard>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:8}}>
        <strong>Arus Kas — Periode {cashFlow.period}</strong>
        {fixedAssetsList.length===0&&<span className="trace-muted" style={{fontSize:12}}>Belum ada aset tetap tercatat untuk klien ini (cek tab Akuntansi) — Beban Penyusutan dihitung 0 aset, bukan ditebak.</span>}
      </div>

      {section(cashFlow.operasional.title,cashFlow.operasional)}
      {section(cashFlow.investasi.title,cashFlow.investasi)}
      {section(cashFlow.pendanaan.title,cashFlow.pendanaan)}

      <div style={{marginTop:16,display:'grid',gap:5,fontSize:13,borderTop:'1px solid rgba(23,23,23,.14)',paddingTop:10}}>
        <div style={{display:'flex',justifyContent:'space-between',fontWeight:700}}><span>Kenaikan (Penurunan) Kas Bersih</span><span>{fmtFieldAmount(cashFlow.kenaikanKasBersih)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between'}}><span>Kas Awal Periode</span><span>{cashFlow.kasAwalPeriode===null?'belum ada data':fmtFieldAmount(cashFlow.kasAwalPeriode)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',fontWeight:700}}><span>Kas Akhir Periode</span><span>{cashFlow.kasAkhirPeriode===null?'belum dapat dihitung':fmtFieldAmount(cashFlow.kasAkhirPeriode)}</span></div>
      </div>

      {cashFlow.missingInputs.length>0&&<div style={{marginTop:14,fontSize:12,color:'#b91c1c'}}>
        <strong>Data belum lengkap ({cashFlow.missingInputs.length}):</strong> {cashFlow.missingInputs.join(', ')}. Baris di atas memakai asumsi Rp0 untuk item ini sampai datanya terhubung — jangan kirim laporan ini ke klien sebagai final tanpa melengkapi dulu.
      </div>}
    </TraceCard>}
  </div>;
}
