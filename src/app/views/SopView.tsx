import { useEffect, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { type SOP } from '../../core/sop';
import { requireReactSession, asArray, useTraceCollections, inputStyle } from './_shared';
import { useClientScope } from '../clientScope';
import { TracePageHeader, TraceCard, TraceEmptyState } from '../components/TraceUI';

export function SopView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useClientScope();
  const [sops,setSops]=useState<Array<Record<string,unknown>>>([]);
  const [sopId,setSopId]=useState('');
  const [steps,setSteps]=useState<Array<Record<string,unknown>>>([]);
  const [progress,setProgress]=useState<Record<string,unknown>|null>(null);
  const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const emptyForm={sopKey:'',name:'',purpose:'',trigger:''};
  const [form,setForm]=useState(emptyForm);
  type DraftStep={title:string;instruction:string;owner:string;control:string;requiredEvidence:string};
  const [draftSteps,setDraftSteps]=useState<DraftStep[]>([{title:'',instruction:'',owner:'',control:'',requiredEvidence:''}]);
  const [stepDraft,setStepDraft]=useState<Record<string,{status:string;evidence:string}>>({});

  const refresh=async()=>{
    if(!clientId)return;
    try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_list_sops',{p_client_id:clientId,p_current_only:true});if(error)throw error;setSops(asArray(data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));}
    catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat SOP.');}
  };
  useEffect(()=>{void refresh();},[clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSteps=async(sid:string)=>{
    setSopId(sid);
    try{
      const supabase=await requireReactSession();
      const [stepsRes,progRes]=await Promise.all([supabase.rpc('trace_get_sop_steps',{p_sop_id:sid}),supabase.rpc('trace_sop_progress',{p_sop_id:sid})]);
      if(stepsRes.error) throw stepsRes.error; if(progRes.error) throw progRes.error;
      const rows=asArray(stepsRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
      setSteps(rows);
      const draft:typeof stepDraft={};rows.forEach(s=>{draft[String(s.id)]={status:String(s.status),evidence:asArray(s.evidence).join(', ')};});setStepDraft(draft);
      setProgress(asArray(progRes.data)[0] as Record<string,unknown>??null);
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat langkah SOP.');}
  };

  const addDraftStep=()=>setDraftSteps([...draftSteps,{title:'',instruction:'',owner:'',control:'',requiredEvidence:''}]);
  const updateDraftStep=(i:number,patch:Partial<DraftStep>)=>setDraftSteps(draftSteps.map((s,idx)=>idx===i?{...s,...patch}:s));
  const removeDraftStep=(i:number)=>setDraftSteps(draftSteps.filter((_,idx)=>idx!==i));

  const createSop=async()=>{
    if(!clientId||!form.sopKey||!form.name||!form.purpose||!form.trigger)return;
    if(draftSteps.some(s=>!s.title||!s.instruction||!s.owner||!s.control)){setMsg('Semua field langkah wajib diisi.');return;}
    setBusy(true);setMsg('');
    try{
      const supabase=await requireReactSession();
      const stepsPayload=draftSteps.map(s=>({title:s.title,instruction:s.instruction,owner:s.owner,control:s.control,required_evidence:s.requiredEvidence.split(',').map(x=>x.trim()).filter(Boolean)}));
      const {data,error}=await supabase.rpc('trace_create_sop_version',{p_client_id:clientId,p_sop_key:form.sopKey,p_name:form.name,p_purpose:form.purpose,p_trigger_condition:form.trigger,p_steps:stepsPayload});
      if(error)throw error;
      setMsg('SOP tersimpan.');setForm(emptyForm);setDraftSteps([{title:'',instruction:'',owner:'',control:'',requiredEvidence:''}]);
      await refresh(); if(data)await loadSteps(String((data as Record<string,unknown>).id));
    }catch(e){setMsg(e instanceof Error?'Gagal menyimpan SOP: '+e.message:'Gagal menyimpan SOP: '+'(tidak diketahui).');}finally{setBusy(false);}
  };
  const saveStep=async(stepId:string)=>{
    const d=stepDraft[stepId];if(!d)return;setBusy(true);setMsg('');
    try{const supabase=await requireReactSession();const evidence=d.evidence.split(',').map(x=>x.trim()).filter(Boolean);const {error}=await supabase.rpc('trace_update_sop_step',{p_step_id:stepId,p_status:d.status,p_evidence:evidence});if(error)throw error;await loadSteps(sopId);}
    catch(e){setMsg(e instanceof Error?'Ditolak server: '+e.message:'Ditolak server: '+'(tidak diketahui).');}finally{setBusy(false);}
  };

  const selectedSop=sops.find(s=>String(s.id)===sopId);

  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="SOP · VERSIONING" title="SOP dengan histori versi penuh dan evidence-gate di server." description={'Setiap kali SOP direvisi, versi lama tidak hilang — tersimpan sebagai histori. Langkah tidak bisa ditandai "done" kalau bukti wajib belum lengkap; ini ditegakkan di database, bukan cuma di layar.'} />
    <TraceCard><label>Klien<select value={clientId} onChange={e=>{setClientId(e.target.value);setSopId('');setSteps([]);}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label></TraceCard>
    {msg&&<div className="trace-muted" style={{fontSize:12}}>{msg}</div>}
    {clientId&&<>
      <TraceCard><strong>Daftar SOP (versi terkini)</strong><div style={{marginTop:10,display:'grid',gap:5}}>{sops.length===0?<TraceEmptyState message="Belum ada SOP."/>:sops.map(s=><div key={String(s.id)} onClick={()=>void loadSteps(String(s.id))} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr auto',gap:8,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13,cursor:'pointer',background:sopId===String(s.id)?'#fafaf8':'transparent'}}><span>{String(s.name)}</span><span className="trace-muted">v{String(s.version)}</span><ArrowRight size={14} className="trace-muted"/></div>)}</div></TraceCard>

      {selectedSop&&<TraceCard>
        <strong>{String(selectedSop.name)} · v{String(selectedSop.version)}</strong>
        <div className="trace-muted" style={{fontSize:12,marginTop:4}}>{String(selectedSop.purpose)} — dipicu ketika: {String(selectedSop.trigger_condition)}</div>
        {progress&&<div className="trace-muted" style={{fontSize:12,marginTop:6}}>Progres: {String(progress.done_steps)}/{String(progress.total_steps)} langkah selesai ({String(progress.completion_pct)}%){Number(progress.blocked_steps)>0?` · ${progress.blocked_steps} terblokir`:''}</div>}
        <div style={{marginTop:12,display:'grid',gap:10}}>{steps.map((s,idx)=>{const d=stepDraft[String(s.id)]??{status:'pending',evidence:''};const required=asArray(s.required_evidence).map(String);return <div key={String(s.id)} style={{padding:12,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}>
          <div style={{fontWeight:700,fontSize:13}}>{idx+1}. {String(s.title)}</div>
          <div className="trace-muted" style={{fontSize:12,marginTop:3}}>{String(s.instruction)}</div>
          <div className="trace-muted" style={{fontSize:11,marginTop:3}}>PIC: {String(s.owner)} · Kontrol: {String(s.control)}{required.length>0?` · Bukti wajib: ${required.join(', ')}`:''}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 2fr auto',gap:8,marginTop:8}}>
            <select value={d.status} onChange={e=>setStepDraft({...stepDraft,[String(s.id)]:{...d,status:e.target.value}})} style={{...inputStyle,marginTop:0}}>{['pending','in_progress','done','blocked'].map(st=><option key={st} value={st}>{st}</option>)}</select>
            <input placeholder="Bukti (pisahkan koma)" value={d.evidence} onChange={e=>setStepDraft({...stepDraft,[String(s.id)]:{...d,evidence:e.target.value}})} style={{...inputStyle,marginTop:0}}/>
            <button disabled={busy} onClick={()=>void saveStep(String(s.id))} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Simpan</button>
          </div>
        </div>;})}</div>
      </TraceCard>}

      <TraceCard><strong>Buat / Revisi SOP</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Pakai sop_key yang sama dengan SOP yang ingin direvisi untuk membuat versi baru (versi lama otomatis tersimpan sebagai histori).</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
          <input placeholder="Kunci SOP (mis. sop-penerimaan-barang)" value={form.sopKey} onChange={e=>setForm({...form,sopKey:e.target.value})} style={inputStyle}/>
          <input placeholder="Nama SOP" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} style={inputStyle}/>
          <input placeholder="Tujuan" value={form.purpose} onChange={e=>setForm({...form,purpose:e.target.value})} style={inputStyle}/>
          <input placeholder="Dipicu ketika (trigger)" value={form.trigger} onChange={e=>setForm({...form,trigger:e.target.value})} style={inputStyle}/>
        </div>
        <div style={{marginTop:14}}><strong style={{fontSize:13}}>Langkah-langkah</strong>
          {draftSteps.map((s,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1.4fr 1fr 1fr 1fr auto',gap:8,marginTop:8}}>
            <input placeholder="Judul" value={s.title} onChange={e=>updateDraftStep(i,{title:e.target.value})} style={{...inputStyle,marginTop:0}}/>
            <input placeholder="Instruksi" value={s.instruction} onChange={e=>updateDraftStep(i,{instruction:e.target.value})} style={{...inputStyle,marginTop:0}}/>
            <input placeholder="PIC" value={s.owner} onChange={e=>updateDraftStep(i,{owner:e.target.value})} style={{...inputStyle,marginTop:0}}/>
            <input placeholder="Kontrol" value={s.control} onChange={e=>updateDraftStep(i,{control:e.target.value})} style={{...inputStyle,marginTop:0}}/>
            <input placeholder="Bukti wajib (pisah koma)" value={s.requiredEvidence} onChange={e=>updateDraftStep(i,{requiredEvidence:e.target.value})} style={{...inputStyle,marginTop:0}}/>
            <button onClick={()=>removeDraftStep(i)} disabled={draftSteps.length<=1} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'0 10px',background:'#fff'}}><Trash2 size={14}/></button>
          </div>)}
          <button onClick={addDraftStep} style={{marginTop:8,border:'1px dashed rgba(23,23,23,.2)',borderRadius:9,padding:'7px 11px',background:'#fff',fontSize:12,fontWeight:700}}>+ Tambah Langkah</button>
        </div>
        <button disabled={busy||!form.sopKey||!form.name} onClick={createSop} style={{marginTop:14,border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Simpan SOP (versi baru)</button>
      </TraceCard>
    </>}
  </div>;
}
