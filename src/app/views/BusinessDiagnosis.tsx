import { useEffect, useMemo, useState } from 'react';
import { compareFinancePeriods, filterFinanceRecordsByOutlet, type FinanceRecord, type FinanceEvidence } from '../../core/finance';
import { diagnoseBusiness } from '../../core/diagnosis';
import { calculateKPIs, type KPIInput, type KPIResult } from '../../core/kpi';
import { buildConsultingReport, reportToCSV } from '../../core/reporting';
import { exportConsultingReportExcel } from '../../core/consultingReportExcel';
import { asArray, useTraceCollections, inputStyle, requireReactSession } from './_shared';
import { useClientScope } from '../clientScope';
import { useOutletScope, usePeriodScope } from '../scopeStore';
import { OutletSelector, PeriodSelector } from '../components/ScopeSelectors';

export function BusinessDiagnosis(){
  const [clientId,setClientId]=useClientScope(); const [outletId]=useOutletScope(); const [previous,setPrevious]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const live=useTraceCollections([],clientId?['finance']:[],clientId);
  const allRecords=useMemo<FinanceRecord[]>(()=>asArray(live.data.finance).filter((x):x is Record<string,unknown>=>!!x).filter(x=>!clientId||String(x.client_id??'')===clientId).map(x=>({id:String(x.id),period:String(x.period??''),amount:Number(x.amount),category:x.category as FinanceRecord['category'],outletId:x.outlet_id?String(x.outlet_id):undefined,evidence:x.evidence_source?{id:String(x.id),source:x.evidence_source as FinanceEvidence['source']}:undefined})).filter(x=>x.period&&Number.isFinite(x.amount)),[live.data.finance,clientId]);
  // Difilter ke outlet yang dipilih di scope global (kosong = semua outlet/pusat, seperti sebelumnya).
  const records=useMemo(()=>filterFinanceRecordsByOutlet(allRecords,outletId),[allRecords,outletId]);
  const periods=useMemo(()=>[...new Set(records.map(r=>r.period))].sort().reverse(),[records]);
  const ps=usePeriodScope('latest',periods); const period=ps.period;
  const autoPrevious=period?periods.find(p=>p<period)||'': '';
  const effectivePrevious=previous||autoPrevious;
  const comparison=period?compareFinancePeriods(records,period,effectivePrevious||undefined):null;
  const report=period?diagnoseBusiness(compareFinancePeriods(records,period,effectivePrevious||undefined),[]):null;

  // KPI organization-level untuk periode yang sama, dipakai untuk melengkapi Laporan Client
  // (reporting.ts). Mesin hitungnya sama dengan KpiTrackingView (calculateKPIs) — bukan logika
  // duplikat — hanya sumber datanya di-scope ke level organisasi (bukan per-outlet/karyawan).
  const [kpiResults,setKpiResults]=useState<KPIResult[]>([]);
  useEffect(()=>{
    if(!clientId||!period){setKpiResults([]);return;}
    let alive=true;
    (async()=>{
      try{
        const supabase=await requireReactSession();
        const {data,error}=await supabase.rpc('trace_list_kpi_values',{p_client_id:clientId,p_period:period,p_subject_type:'organization',p_employee_id:null,p_outlet_id:outletId||null});
        if(error)throw error;
        const values=asArray(data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
        const kpiInputs:KPIInput[]=values.map(v=>({id:String(v.id),name:String(v.indicator_name),current:v.current_value==null?null:Number(v.current_value),previous:v.previous_value==null?null:Number(v.previous_value),unit:(v.unit as KPIInput['unit'])??'number',evidence:[],status:(v.status as KPIInput['status'])??'manual',target:v.target_value==null?null:Number(v.target_value)}));
        if(alive)setKpiResults(calculateKPIs(kpiInputs));
      }catch{ if(alive)setKpiResults([]); /* laporan tetap dibuat; KPI ditandai belum tersedia, bukan dianggap 0 */ }
    })();
    return ()=>{alive=false;};
  },[clientId,period,outletId]);

  const clientName=String(clients.find(c=>String(c.id)===clientId)?.name??clients.find(c=>String(c.id)===clientId)?.business_name??'');
  const consultingReport=useMemo(()=>{
    if(!clientId||!period||!comparison||!report)return null;
    const limitations=[...report.limitations];
    if(kpiResults.length===0)limitations.push('KPI organization-level belum tercatat untuk periode ini — bagian KPI pada laporan ini kosong, bukan bernilai 0.');
    return buildConsultingReport({
      title:`Laporan Konsultasi — ${clientName||clientId}`,
      clientName:clientName||clientId,
      periods:{current:period,previous:effectivePrevious||null},
      executiveSummary:report.conclusion,
      finance:comparison,
      diagnosis:report,
      kpis:kpiResults,
      evidence:[
        {source:'Finance production (Supabase)',period,detail:'Perbandingan finance dihitung dari data finance production, bukan data manual/dummy.'},
        ...(kpiResults.length?[{source:'KPI Tracking (organization-level)',period,detail:`${kpiResults.length} indikator KPI organisasi tercatat untuk periode ini.`}]:[]),
      ],
      limitations,
    });
  },[clientId,period,effectivePrevious,comparison,report,kpiResults,clientName]);

  const downloadExcel=()=>{ if(consultingReport) void exportConsultingReportExcel(consultingReport); };
  const downloadCsv=()=>{
    if(!consultingReport)return;
    const blob=new Blob(['\uFEFF'+reportToCSV(consultingReport)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`trace-laporan-konsultasi-${clientId}-${period}.csv`;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card trace-hero"><div className="trace-section-kicker">TRACE · BUSINESS DIAGNOSIS ENGINE</div><h1>Diagnosis berbasis evidence, bukan tebakan.</h1><p className="trace-muted">TRACE sekarang membaca finance production, membandingkan periode, menghitung perubahan, lalu menjelaskan finding dan limitation. Root cause tetap tidak diklaim jika evidence belum cukup.</p></div>
    <div className="trace-card" style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr',gap:10}}><label>Client / Scope<select value={clientId} onChange={e=>{setClientId(e.target.value);setPrevious('')}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label><OutletSelector clientId={clientId} dataOutletIds={[...new Set(allRecords.map(r=>r.outletId??'').filter(Boolean))]}/><PeriodSelector fallback="latest" available={periods}/><label>Bandingkan<select value={previous} onChange={e=>setPrevious(e.target.value)}><option value="">Otomatis ({autoPrevious||'—'})</option>{periods.filter(p=>p!==period).map(p=><option key={p}>{p}</option>)}</select></label></div>
    {outletId&&<div className="trace-card trace-muted" style={{fontSize:12}}>Diagnosis ini hanya membaca record yang ditandai outlet <b>{outletId}</b>; record tingkat klien tanpa outlet tidak ikut. Kosongkan outlet untuk melihat semua.</div>}
    {live.loading?<div className="trace-card trace-muted">Memuat finance production…</div>:live.error?<div className="trace-card trace-alert">{live.error}</div>:ps.hasData===false?<div className="trace-card"><strong>Belum ada data finance untuk periode {period}.</strong><div className="trace-muted" style={{marginTop:6}}>Pilih periode lain (daftar hanya berisi periode yang punya data) atau isi data finance dulu.</div></div>:!period?<div className="trace-card"><strong>Pilih periode untuk mulai diagnosis.</strong><div className="trace-muted" style={{marginTop:6}}>TRACE tidak akan membuat diagnosis tanpa data periode yang tersedia.</div></div>:report&&<>
      <div className="trace-kpis"><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>FINDINGS</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{report.findings.length}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>CURRENT</div><div style={{fontSize:20,fontWeight:800,marginTop:6}}>{report.currentPeriod}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>PREVIOUS</div><div style={{fontSize:20,fontWeight:800,marginTop:6}}>{report.previousPeriod??'Tidak tersedia'}</div></div></div>
      <div className="trace-card"><strong>Kesimpulan</strong><div style={{marginTop:8,lineHeight:1.6}}>{report.conclusion}</div>{report.limitations.map(x=><div key={x} className="trace-muted" style={{marginTop:7}}>Limitation: {x}</div>)}</div>
      <div style={{display:'grid',gap:10}}>{report.findings.map(f=><div className="trace-card" key={f.id}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{f.title}</strong><span className="trace-badge" data-tone={f.severity==='critical'||f.severity==='high'?'danger':f.severity==='medium'?'warning':'neutral'}>{f.severity.toUpperCase()}</span></div><div style={{display:'grid',gap:7,marginTop:10,fontSize:13}}><div><b>Masalah:</b> {f.problem}</div><div><b>Mengapa:</b> {f.cause}</div><div><b>Dampak:</b> {f.impact}</div><div><b>Rekomendasi:</b> {f.recommendation}</div>{f.evidence.map(e=><div key={e.id} className="trace-muted"><b>Evidence:</b> {e.metric} · current {e.current??'—'} · previous {e.previous??'—'} · change {e.changePct===null?'—':e.changePct.toFixed(2)+'%'} · {e.source}</div>)}</div></div>)}</div>
      {clientId?<div className="trace-card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div><strong>Laporan Client Lengkap</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Finance + diagnosis + KPI organization-level periode {period}{kpiResults.length===0?' (KPI belum tercatat untuk periode ini)':''}.</div></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={downloadCsv} style={{border:'1px solid rgba(23,23,23,.16)',borderRadius:9,padding:'9px 14px',background:'#fff',fontWeight:700}}>Unduh CSV</button>
          <button onClick={downloadExcel} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Unduh Excel (.xlsx)</button>
        </div>
      </div>:<div className="trace-card trace-muted" style={{fontSize:12}}>Pilih satu klien di atas untuk mengunduh Laporan Client Lengkap (laporan gabungan finance + diagnosis + KPI ini hanya bermakna per klien, bukan agregat semua klien).</div>}
    </>}
  </div>
}
