import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { calculateKPIs, type KPIInput, type KPIResult } from '../../core/kpi';
import { requireReactSession, asArray, useTraceCollections, money, inputStyle } from './_shared';

export function KpiTrackingView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useState(''); const [outletId,setOutletId]=useState('');
  const [period,setPeriod]=useState(new Date().toISOString().slice(0,7));
  const [subjectType,setSubjectType]=useState<'organization'|'outlet'|'employee'>('organization');
  const [employeeId,setEmployeeId]=useState('');
  const [indicators,setIndicators]=useState<Array<Record<string,unknown>>>([]);
  const [employees,setEmployees]=useState<Array<Record<string,unknown>>>([]);
  const [values,setValues]=useState<Array<Record<string,unknown>>>([]);
  const [trend,setTrend]=useState<Array<Record<string,unknown>>>([]);
  const [trendIndicator,setTrendIndicator]=useState('');
  const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const [indForm,setIndForm]=useState({name:'',unit:'number',category:'',formula:'',target:''});
  const emptyVal={indicatorId:'',current:'',previous:'',target:'',status:'manual',notes:''};
  const [valForm,setValForm]=useState(emptyVal);

  const refresh=async()=>{
    if(!clientId)return;
    try{
      const supabase=await requireReactSession();
      const [indRes,empRes,valRes]=await Promise.all([
        supabase.rpc('trace_list_kpi_indicators',{p_client_id:clientId}),
        supabase.rpc('trace_list_employees',{p_client_id:clientId,p_outlet_id:outletId||null,p_status:'active'}),
        supabase.rpc('trace_list_kpi_values',{p_client_id:clientId,p_period:period,p_subject_type:subjectType,p_employee_id:subjectType==='employee'?(employeeId||null):null,p_outlet_id:outletId||null}),
      ]);
      if(indRes.error) throw indRes.error; if(empRes.error) throw empRes.error; if(valRes.error) throw valRes.error;
      setIndicators(asArray(indRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setEmployees(asArray(empRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setValues(asArray(valRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat data KPI.');}
  };
  useEffect(()=>{void refresh();},[clientId,outletId,period,subjectType,employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTrend=async(indicatorId:string)=>{setTrendIndicator(indicatorId);try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_kpi_value_trend',{p_client_id:clientId,p_indicator_id:indicatorId,p_subject_type:subjectType,p_employee_id:subjectType==='employee'?(employeeId||null):null,p_limit:12});if(error)throw error;setTrend(asArray(data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));}catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat tren.');}};

  const createIndicator=async()=>{if(!clientId||!indForm.name)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_create_kpi_indicator',{p_client_id:clientId,p_name:indForm.name,p_unit:indForm.unit,p_category:indForm.category||null,p_formula_description:indForm.formula||null,p_default_target:indForm.target?Number(indForm.target):null});if(error)throw error;setMsg('Indikator ditambahkan.');setIndForm({name:'',unit:'number',category:'',formula:'',target:''});await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal menambah indikator.');}finally{setBusy(false);}};
  const saveValue=async()=>{if(!clientId||!valForm.indicatorId||valForm.current==='')return;if(subjectType==='employee'&&!employeeId){setMsg('Pilih karyawan dulu untuk subjek individu.');return;}setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_upsert_kpi_value',{p_client_id:clientId,p_outlet_id:outletId||null,p_indicator_id:valForm.indicatorId,p_subject_type:subjectType,p_employee_id:subjectType==='employee'?employeeId:null,p_period:period,p_current_value:Number(valForm.current),p_previous_value:valForm.previous===''?null:Number(valForm.previous),p_target_value:valForm.target===''?null:Number(valForm.target),p_status:valForm.status,p_evidence:[],p_notes:valForm.notes||null});if(error)throw error;setMsg('Nilai KPI tersimpan.');setValForm(emptyVal);await refresh();}catch(e){setMsg(e instanceof Error?'Gagal menyimpan nilai KPI: '+e.message:'Gagal menyimpan nilai KPI: '+'(tidak diketahui).');}finally{setBusy(false);}};

  const kpiInputs:KPIInput[]=values.map(v=>({id:String(v.id),name:String(v.indicator_name),current:v.current_value==null?null:Number(v.current_value),previous:v.previous_value==null?null:Number(v.previous_value),unit:(v.unit as KPIInput['unit'])??'number',evidence:[],status:(v.status as KPIInput['status'])??'manual',target:v.target_value==null?null:Number(v.target_value)}));
  const results:KPIResult[]=calculateKPIs(kpiInputs);
  const unitById=new Map(kpiInputs.map(k=>[k.id,k.unit]));
  const fmtUnit=(unit:string,n:number|null)=>n==null?'—':unit==='currency'?money(n):unit==='percent'?`${n}%`:n.toLocaleString('id-ID');

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>KPI · TRACKING</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>KPI per organisasi, outlet, atau individu karyawan.</h1><div className="trace-muted">Perhitungan perubahan/target gap pakai mesin yang sama dengan Analytics (calculateKPI) — bukan logika duplikat.</div></div>
    <div className="trace-card" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
      <label>Klien<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      <label>Outlet (opsional)<input value={outletId} onChange={e=>setOutletId(e.target.value)} style={inputStyle}/></label>
      <label>Periode<input type="month" value={period} onChange={e=>setPeriod(e.target.value)} style={inputStyle}/></label>
      <label>Subjek<select value={subjectType} onChange={e=>setSubjectType(e.target.value as any)} style={inputStyle}>{['organization','outlet','employee'].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    </div>
    {subjectType==='employee'&&clientId&&<div className="trace-card"><label>Karyawan<select value={employeeId} onChange={e=>setEmployeeId(e.target.value)} style={inputStyle}><option value="">Pilih karyawan</option>{employees.map(e=><option key={String(e.id)} value={String(e.id)}>{String(e.name)}</option>)}</select></label></div>}
    {msg&&<div className="trace-muted" style={{fontSize:12}}>{msg}</div>}
    {clientId&&<>
      <div className="trace-card"><strong>Definisi Indikator</strong>
        <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:6}}>{indicators.map(i=><span key={String(i.id)} onClick={()=>void loadTrend(String(i.id))} style={{cursor:'pointer',fontSize:12,padding:'4px 9px',borderRadius:999,background:trendIndicator===String(i.id)?'#171717':'#f2f2ee',color:trendIndicator===String(i.id)?'#fff':'inherit'}}>{String(i.name)}</span>)}</div>
        <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr 1.3fr 1fr auto',gap:8,marginTop:10}}>
          <input placeholder="Nama indikator" value={indForm.name} onChange={e=>setIndForm({...indForm,name:e.target.value})} style={inputStyle}/>
          <select value={indForm.unit} onChange={e=>setIndForm({...indForm,unit:e.target.value})} style={inputStyle}>{['number','currency','percent'].map(u=><option key={u} value={u}>{u}</option>)}</select>
          <input placeholder="Kategori" value={indForm.category} onChange={e=>setIndForm({...indForm,category:e.target.value})} style={inputStyle}/>
          <input placeholder="Deskripsi formula" value={indForm.formula} onChange={e=>setIndForm({...indForm,formula:e.target.value})} style={inputStyle}/>
          <input type="number" placeholder="Target default" value={indForm.target} onChange={e=>setIndForm({...indForm,target:e.target.value})} style={inputStyle}/>
          <button disabled={busy||!indForm.name} onClick={createIndicator} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>+ Indikator</button>
        </div>
      </div>
      {trendIndicator&&<div className="trace-card"><strong>Tren — {String(indicators.find(i=>String(i.id)===trendIndicator)?.name)}</strong><div style={{marginTop:8,display:'grid',gap:4}}>{trend.length===0?<div className="trace-muted" style={{fontSize:12}}>Belum ada histori.</div>:trend.map((t,idx)=><div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,fontSize:12,padding:'4px 0',borderTop:'1px solid rgba(23,23,23,.06)'}}><span>{String(t.period)}</span><span>{String(t.current_value)}</span><span className="trace-muted">Target {t.target_value==null?'—':String(t.target_value)}</span></div>)}</div></div>}
      <div className="trace-card"><strong>Input Nilai KPI — {period}</strong>
        <div style={{display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr 1fr 1fr auto',gap:8,marginTop:10}}>
          <select value={valForm.indicatorId} onChange={e=>setValForm({...valForm,indicatorId:e.target.value})} style={inputStyle}><option value="">Indikator</option>{indicators.map(i=><option key={String(i.id)} value={String(i.id)}>{String(i.name)}</option>)}</select>
          <input type="number" placeholder="Nilai sekarang" value={valForm.current} onChange={e=>setValForm({...valForm,current:e.target.value})} style={inputStyle}/>
          <input type="number" placeholder="Nilai periode lalu" value={valForm.previous} onChange={e=>setValForm({...valForm,previous:e.target.value})} style={inputStyle}/>
          <input type="number" placeholder="Target" value={valForm.target} onChange={e=>setValForm({...valForm,target:e.target.value})} style={inputStyle}/>
          <select value={valForm.status} onChange={e=>setValForm({...valForm,status:e.target.value})} style={inputStyle}>{['manual','available','unavailable'].map(s=><option key={s} value={s}>{s}</option>)}</select>
          <button disabled={busy||!valForm.indicatorId||valForm.current===''} onClick={saveValue} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Simpan</button>
        </div>
      </div>
      <div className="trace-card"><strong>Hasil KPI Periode {period}</strong>
        <div style={{marginTop:10,display:'grid',gap:8}}>{results.length===0?<div className="trace-muted" style={{fontSize:12}}>Belum ada nilai untuk kombinasi klien/periode/subjek ini.</div>:results.map(r=><div key={r.id} style={{padding:12,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}>
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700}}><span>{r.name}</span><span>{fmtUnit(unitById.get(r.id)??'number',r.current)}</span></div>
          <div className="trace-muted" style={{fontSize:12,marginTop:4}}>{r.conclusion}</div>
          <div style={{display:'flex',gap:14,marginTop:6,fontSize:12}}>{r.changePct!=null&&<span style={{color:r.changePct>=0?'#15803d':'#b91c1c'}}>{r.changePct>0?'+':''}{r.changePct}% vs periode lalu</span>}{r.targetGap!=null&&<span className="trace-muted">Gap ke target: {fmtUnit(unitById.get(r.id)??'number',r.targetGap)}</span>}</div>
        </div>)}</div>
      </div>
    </>}
  </div>;
}
