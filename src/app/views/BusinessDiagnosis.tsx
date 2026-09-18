import { useEffect, useMemo, useState } from 'react';
import { compareFinancePeriods, type FinanceRecord, type FinanceEvidence } from '../../core/finance';
import { diagnoseBusiness } from '../../core/diagnosis';
import { asArray, useTraceCollections, inputStyle } from './_shared';

export function BusinessDiagnosis(){
  const [clientId,setClientId]=useState(''); const [period,setPeriod]=useState(''); const [previous,setPrevious]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const live=useTraceCollections([],clientId?['finance']:[],clientId);
  const records=useMemo<FinanceRecord[]>(()=>asArray(live.data.finance).filter((x):x is Record<string,unknown>=>!!x).filter(x=>!clientId||String(x.client_id??'')===clientId).map(x=>({id:String(x.id),period:String(x.period??''),amount:Number(x.amount),category:x.category as FinanceRecord['category'],outletId:x.outlet_id?String(x.outlet_id):undefined,evidence:x.evidence_source?{id:String(x.id),source:x.evidence_source as FinanceEvidence['source']}:undefined})).filter(x=>x.period&&Number.isFinite(x.amount)),[live.data.finance,clientId]);
  const periods=useMemo(()=>[...new Set(records.map(r=>r.period))].sort().reverse(),[records]);
  useEffect(()=>{if(!period&&periods[0])setPeriod(periods[0]);},[period,periods]);
  const autoPrevious=period?periods.find(p=>p<period)||'': '';
  const effectivePrevious=previous||autoPrevious;
  const report=period?diagnoseBusiness(compareFinancePeriods(records,period,effectivePrevious||undefined),[]):null;
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card trace-hero"><div className="trace-section-kicker">TRACE · BUSINESS DIAGNOSIS ENGINE</div><h1>Diagnosis berbasis evidence, bukan tebakan.</h1><p className="trace-muted">TRACE sekarang membaca finance production, membandingkan periode, menghitung perubahan, lalu menjelaskan finding dan limitation. Root cause tetap tidak diklaim jika evidence belum cukup.</p></div>
    <div className="trace-card" style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10}}><label>Client / Scope<select value={clientId} onChange={e=>{setClientId(e.target.value);setPeriod('');setPrevious('')}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label><label>Periode<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="">Pilih periode</option>{periods.map(p=><option key={p}>{p}</option>)}</select></label><label>Bandingkan<select value={previous} onChange={e=>setPrevious(e.target.value)}><option value="">Otomatis ({autoPrevious||'—'})</option>{periods.filter(p=>p!==period).map(p=><option key={p}>{p}</option>)}</select></label></div>
    {live.loading?<div className="trace-card trace-muted">Memuat finance production…</div>:live.error?<div className="trace-card trace-alert">{live.error}</div>:!period?<div className="trace-card"><strong>Pilih periode untuk mulai diagnosis.</strong><div className="trace-muted" style={{marginTop:6}}>TRACE tidak akan membuat diagnosis tanpa data periode yang tersedia.</div></div>:report&&<>
      <div className="trace-kpis"><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>FINDINGS</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{report.findings.length}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>CURRENT</div><div style={{fontSize:20,fontWeight:800,marginTop:6}}>{report.currentPeriod}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>PREVIOUS</div><div style={{fontSize:20,fontWeight:800,marginTop:6}}>{report.previousPeriod??'Tidak tersedia'}</div></div></div>
      <div className="trace-card"><strong>Kesimpulan</strong><div style={{marginTop:8,lineHeight:1.6}}>{report.conclusion}</div>{report.limitations.map(x=><div key={x} className="trace-muted" style={{marginTop:7}}>Limitation: {x}</div>)}</div>
      <div style={{display:'grid',gap:10}}>{report.findings.map(f=><div className="trace-card" key={f.id}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{f.title}</strong><span className="trace-badge" data-tone={f.severity==='critical'||f.severity==='high'?'danger':f.severity==='medium'?'warning':'neutral'}>{f.severity.toUpperCase()}</span></div><div style={{display:'grid',gap:7,marginTop:10,fontSize:13}}><div><b>Masalah:</b> {f.problem}</div><div><b>Mengapa:</b> {f.cause}</div><div><b>Dampak:</b> {f.impact}</div><div><b>Rekomendasi:</b> {f.recommendation}</div>{f.evidence.map(e=><div key={e.id} className="trace-muted"><b>Evidence:</b> {e.metric} · current {e.current??'—'} · previous {e.previous??'—'} · change {e.changePct===null?'—':e.changePct.toFixed(2)+'%'} · {e.source}</div>)}</div></div>)}</div>
    </>}
  </div>
}
