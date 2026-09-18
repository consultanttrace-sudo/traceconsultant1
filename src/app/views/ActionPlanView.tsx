import { useEffect, useState } from 'react';
import { ArrowRight, Target } from 'lucide-react';
import { requireReactSession, asArray, useTraceCollections, inputStyle } from './_shared';

export function ActionPlanView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useState(''); const [outletId,setOutletId]=useState('');
  const [plans,setPlans]=useState<Array<Record<string,unknown>>>([]);
  const [planId,setPlanId]=useState('');
  const [items,setItems]=useState<Array<Record<string,unknown>>>([]);
  const [summary,setSummary]=useState<Record<string,unknown>|null>(null);
  const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const [objective,setObjective]=useState('');
  const emptyItem={id:'',title:'',owner:'',priority:'P2',status:'planned',dueDate:'',measure:'',baseline:'',target:'',evidence:'',dependencies:''};
  const [itemForm,setItemForm]=useState(emptyItem);

  const refresh=async()=>{
    if(!clientId)return;
    try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_list_action_plans',{p_client_id:clientId,p_outlet_id:outletId||null,p_status:'active'});if(error)throw error;setPlans(asArray(data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));}
    catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat action plan.');}
  };
  useEffect(()=>{void refresh();},[clientId,outletId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadItems=async(pid:string)=>{
    setPlanId(pid);
    try{
      const supabase=await requireReactSession();
      const [itemsRes,sumRes]=await Promise.all([supabase.rpc('trace_get_action_items',{p_plan_id:pid}),supabase.rpc('trace_action_plan_summary',{p_plan_id:pid})]);
      if(itemsRes.error) throw itemsRes.error; if(sumRes.error) throw sumRes.error;
      setItems(asArray(itemsRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      setSummary(asArray(sumRes.data)[0] as Record<string,unknown>??null);
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat item action plan.');}
  };

  const createPlan=async()=>{if(!clientId||!objective)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_create_action_plan',{p_client_id:clientId,p_outlet_id:outletId||null,p_objective:objective});if(error)throw error;setMsg('Action plan dibuat.');setObjective('');await refresh();if(data)await loadItems(String((data as Record<string,unknown>).id));}catch(e){setMsg(e instanceof Error?e.message:'Gagal membuat action plan.');}finally{setBusy(false);}};

  const editItem=(it:Record<string,unknown>)=>setItemForm({id:String(it.id),title:String(it.title),owner:String(it.owner),priority:String(it.priority),status:String(it.status),dueDate:it.due_date?String(it.due_date):'',measure:String(it.measure),baseline:it.baseline==null?'':String(it.baseline),target:it.target==null?'':String(it.target),evidence:asArray(it.evidence).join(', '),dependencies:asArray(it.dependencies).join(', ')});

  const saveItem=async()=>{
    if(!planId||!itemForm.title||!itemForm.owner||!itemForm.measure)return;
    if(itemForm.priority==='P0'&&itemForm.baseline!==''&&itemForm.target!==''&&Number(itemForm.baseline)===Number(itemForm.target)){setMsg('Prioritas P0 wajib punya target berbeda dari baseline.');return;}
    if(itemForm.status==='completed'&&!itemForm.evidence.trim()){setMsg('Status completed wajib punya evidence (minimal 1).');return;}
    setBusy(true);setMsg('');
    try{
      const supabase=await requireReactSession();
      const evidence=itemForm.evidence.split(',').map(x=>x.trim()).filter(Boolean);
      const dependencies=itemForm.dependencies.split(',').map(x=>x.trim()).filter(Boolean);
      const {error}=await supabase.rpc('trace_upsert_action_item',{p_id:itemForm.id||null,p_plan_id:planId,p_title:itemForm.title,p_owner:itemForm.owner,p_priority:itemForm.priority,p_status:itemForm.status,p_due_date:itemForm.dueDate||null,p_measure:itemForm.measure,p_baseline:itemForm.baseline===''?null:Number(itemForm.baseline),p_target:itemForm.target===''?null:Number(itemForm.target),p_evidence:evidence,p_dependencies:dependencies});
      if(error)throw error;
      setMsg('Item action plan tersimpan.');setItemForm(emptyItem);await loadItems(planId);
    }catch(e){setMsg(e instanceof Error?'Ditolak server: '+e.message:'Ditolak server.');}finally{setBusy(false);}
  };

  const priorityColor=(p:string)=>p==='P0'?'#b91c1c':p==='P1'?'#a16207':'#525252';
  const selectedPlan=plans.find(p=>String(p.id)===planId);

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>ACTION PLAN</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Rencana aksi P0-P3 dengan validasi server, bukan sekadar to-do list.</h1><div className="trace-muted">Item prioritas P0 wajib punya target beda dari baseline. Item tidak bisa ditandai "completed" tanpa evidence — server yang menolak kalau dilanggar.</div></div>
    <div className="trace-card" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <label>Klien<select value={clientId} onChange={e=>{setClientId(e.target.value);setPlanId('');setItems([]);}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      <label>Outlet (opsional)<input value={outletId} onChange={e=>setOutletId(e.target.value)} style={inputStyle}/></label>
    </div>
    {msg&&<div className="trace-muted" style={{fontSize:12}}>{msg}</div>}
    {clientId&&<>
      <div className="trace-card"><strong>Buat Action Plan Baru</strong><div style={{display:'grid',gridTemplateColumns:'3fr auto',gap:8,marginTop:10}}><input placeholder="Objective / tujuan rencana" value={objective} onChange={e=>setObjective(e.target.value)} style={inputStyle}/><button disabled={busy||!objective} onClick={createPlan} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>+ Buat Plan</button></div></div>
      <div className="trace-card"><strong>Daftar Action Plan</strong><div style={{marginTop:10,display:'grid',gap:5}}>{plans.length===0?<div className="trace-muted" style={{fontSize:12}}>Belum ada action plan.</div>:plans.map(p=><div key={String(p.id)} onClick={()=>void loadItems(String(p.id))} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13,cursor:'pointer',background:planId===String(p.id)?'#fafaf8':'transparent'}}><span>{String(p.objective)}</span><ArrowRight size={14} className="trace-muted"/></div>)}</div></div>

      {selectedPlan&&<div className="trace-card">
        <strong>{String(selectedPlan.objective)}</strong>
        {summary&&<div className="trace-muted" style={{fontSize:12,marginTop:6}}>{String(summary.completed)}/{String(summary.total)} selesai ({String(summary.completion_pct)}%) · eksekusi {String(summary.execution_pct)}% · {String(summary.blocked)} terblokir · {String(summary.overdue)} lewat tenggat</div>}
        <div style={{marginTop:12,display:'grid',gap:8}}>{items.length===0?<div className="trace-muted" style={{fontSize:12}}>Belum ada item.</div>:items.map(it=><div key={String(it.id)} onClick={()=>editItem(it)} style={{padding:12,border:'1px solid rgba(23,23,23,.08)',borderRadius:11,cursor:'pointer'}}>
          <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontWeight:700}}><span style={{color:priorityColor(String(it.priority)),marginRight:6}}>{String(it.priority)}</span>{String(it.title)}</span><span className="trace-muted" style={{fontSize:11,textTransform:'uppercase'}}>{String(it.status)}</span></div>
          <div className="trace-muted" style={{fontSize:12,marginTop:3}}>PIC: {String(it.owner)} · Ukuran: {String(it.measure)}{it.due_date?` · Tenggat: ${String(it.due_date)}`:''}</div>
          {(it.baseline!=null||it.target!=null)&&<div className="trace-muted" style={{fontSize:11,marginTop:2}}>Baseline {it.baseline==null?'—':String(it.baseline)} → Target {it.target==null?'—':String(it.target)}</div>}
        </div>)}</div>

        <div style={{marginTop:16,padding:14,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}>
          <strong>{itemForm.id?'Update Item':'Tambah Item'}</strong>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginTop:10}}>
            <input placeholder="Judul" value={itemForm.title} onChange={e=>setItemForm({...itemForm,title:e.target.value})} style={inputStyle}/>
            <input placeholder="PIC" value={itemForm.owner} onChange={e=>setItemForm({...itemForm,owner:e.target.value})} style={inputStyle}/>
            <select value={itemForm.priority} onChange={e=>setItemForm({...itemForm,priority:e.target.value})} style={inputStyle}>{['P0','P1','P2','P3'].map(p=><option key={p} value={p}>{p}</option>)}</select>
            <select value={itemForm.status} onChange={e=>setItemForm({...itemForm,status:e.target.value})} style={inputStyle}>{['planned','in_progress','blocked','completed','cancelled'].map(s=><option key={s} value={s}>{s}</option>)}</select>
            <input type="date" value={itemForm.dueDate} onChange={e=>setItemForm({...itemForm,dueDate:e.target.value})} style={inputStyle}/>
            <input placeholder="Ukuran keberhasilan (measure)" value={itemForm.measure} onChange={e=>setItemForm({...itemForm,measure:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Baseline" value={itemForm.baseline} onChange={e=>setItemForm({...itemForm,baseline:e.target.value})} style={inputStyle}/>
            <input type="number" placeholder="Target" value={itemForm.target} onChange={e=>setItemForm({...itemForm,target:e.target.value})} style={inputStyle}/>
            <input placeholder="Evidence (pisah koma)" value={itemForm.evidence} onChange={e=>setItemForm({...itemForm,evidence:e.target.value})} style={inputStyle}/>
            <input placeholder="Dependencies (pisah koma)" value={itemForm.dependencies} onChange={e=>setItemForm({...itemForm,dependencies:e.target.value})} style={inputStyle}/>
          </div>
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button disabled={busy||!itemForm.title||!itemForm.owner||!itemForm.measure} onClick={saveItem} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>{itemForm.id?'Simpan Perubahan':'+ Tambah Item'}</button>
            {itemForm.id&&<button onClick={()=>setItemForm(emptyItem)} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'9px 14px',background:'#fff',fontWeight:700}}>Batal Edit</button>}
          </div>
        </div>
      </div>}
    </>}
  </div>;
}
