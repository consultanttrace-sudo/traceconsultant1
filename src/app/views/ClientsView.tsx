import { useEffect, useState } from 'react';
import { ArrowRight, X, Trash2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { createClient } from '@supabase/supabase-js';
import { requireReactSession, asArray, useTraceCollections, inputStyle } from './_shared';

export type TraceOutletRecord={id:string;client_id:string;name:string;notes:string|null;created_at:string;updated_at:string};
function isOutletRecord(x:unknown):x is TraceOutletRecord{return typeof x==='object'&&x!==null&&typeof (x as Record<string,unknown>).id==='string'&&typeof (x as Record<string,unknown>).client_id==='string';}
/** Add/remove outlets for one client (migration 054 — trace_outlets). Feeds the "saran outlet" datalist in ScopeSelectors.tsx everywhere else. */
function OutletsSection({clientId,outlets,onAdded,onDeleted}:{clientId:string;outlets:TraceOutletRecord[];onAdded:(o:TraceOutletRecord)=>void;onDeleted:(id:string)=>void}){
  const [name,setName]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [deletingId,setDeletingId]=useState('');
  const add=async()=>{
    if(!name.trim()||busy)return;
    setBusy(true);setError('');
    try{
      const supabase=await requireReactSession();
      const {data,error:e}=await supabase.rpc('trace_create_outlet',{p_client_id:clientId,p_name:name.trim(),p_notes:null});
      if(e)throw e;
      if(data)onAdded(data as TraceOutletRecord);
      setName('');
    }catch(err){setError(err instanceof Error?err.message:'Outlet gagal disimpan.');}
    finally{setBusy(false);}
  };
  const remove=async(id:string)=>{
    setDeletingId(id);setError('');
    try{
      const supabase=await requireReactSession();
      const {error:e}=await supabase.rpc('trace_delete_outlet',{p_id:id});
      if(e)throw e;
      onDeleted(id);
    }catch(err){setError(err instanceof Error?err.message:'Outlet gagal dihapus.');}
    finally{setDeletingId('');}
  };
  return <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid rgba(23,23,23,.08)'}}>
    <div className="trace-muted" style={{fontSize:11,marginBottom:8}}>OUTLET ({outlets.length}) — jadi saran di selector outlet setiap modul</div>
    {outlets.length===0&&<div className="trace-muted" style={{fontSize:12,marginBottom:8}}>Belum ada outlet untuk klien ini.</div>}
    <div style={{display:'grid',gap:6,marginBottom:8}}>
      {outlets.map(o=><div key={o.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13}}>
        <span>{o.name}</span>
        <button className="trace-icon-btn" style={{color:'#b91c1c'}} disabled={deletingId===o.id} onClick={()=>remove(o.id)}><Trash2 size={13}/></button>
      </div>)}
    </div>
    <div style={{display:'flex',gap:8}}>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="mis. Kemang" style={{...inputStyle,flex:1}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}/>
      <button className="trace-button" disabled={busy||!name.trim()} onClick={add}>{busy?'…':'+ Outlet'}</button>
    </div>
    {error&&<div className="trace-alert" style={{marginTop:8}}>{error}</div>}
  </div>;
}

export type TraceClientRecord={id:string;name:string;package:string;status:string;pic_name:string|null;drive_folder_link:string|null;notes:string|null;created_at:string;updated_at:string};
export const CLIENT_PACKAGES=['Starter','Professional','Professional 1 Tahun'] as const;
export const CLIENT_STATUSES=['Aktif','Trial','Nonaktif'] as const;
export function emptyClientForm(){return {name:'',package:'Starter' as string,status:'Trial' as string,pic_name:'',drive_folder_link:'',notes:''};}
export function ClientFormFields({form,setForm}:{form:ReturnType<typeof emptyClientForm>;setForm:(f:ReturnType<typeof emptyClientForm>)=>void}){
  return <div style={{display:'grid',gap:10}}>
    <label>Nama Klien<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="mis. Kopi Senja" style={inputStyle}/></label>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <label>Paket<select value={form.package} onChange={e=>setForm({...form,package:e.target.value})} style={inputStyle}>{CLIENT_PACKAGES.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
      <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={inputStyle}>{CLIENT_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
    </div>
    <label>PIC internal (opsional)<input value={form.pic_name} onChange={e=>setForm({...form,pic_name:e.target.value})} placeholder="mis. Dewi" style={inputStyle}/></label>
    <label>Link folder Drive (opsional)<input value={form.drive_folder_link} onChange={e=>setForm({...form,drive_folder_link:e.target.value})} placeholder="https://drive.google.com/…" style={inputStyle}/></label>
    <label>Catatan (opsional)<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="target omset, komisi disepakati, dll" style={{...inputStyle,minHeight:70}}/></label>
  </div>;
}
export function ClientsView(){
  const live=useTraceCollections([],['clients','outlets']);
  const clients=asArray(live.data.clients).filter((x):x is TraceClientRecord=>typeof x==='object'&&x!==null&&typeof (x as Record<string,unknown>).id==='string');
  const outlets=asArray(live.data.outlets).filter(isOutletRecord);
  const [query,setQuery]=useState('');
  const [reloadTick,setReloadTick]=useState(0);
  const [localClients,setLocalClients]=useState<TraceClientRecord[]|null>(null);
  const [localOutlets,setLocalOutlets]=useState<TraceOutletRecord[]|null>(null);
  useEffect(()=>{if(!live.loading)setLocalClients(clients);},[live.loading,live.data.clients]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(!live.loading)setLocalOutlets(outlets);},[live.loading,live.data.outlets]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows=localClients??clients;
  const outletRows=localOutlets??outlets;
  const filtered=rows.filter(c=>JSON.stringify(c).toLowerCase().includes(query.toLowerCase()));
  const [createOpen,setCreateOpen]=useState(false);
  const [createForm,setCreateForm]=useState(emptyClientForm());
  const [createBusy,setCreateBusy]=useState(false);
  const [createError,setCreateError]=useState('');
  const createClient=async()=>{
    if(!createForm.name.trim()||createBusy)return;
    setCreateBusy(true);setCreateError('');
    try{
      const supabase=await requireReactSession();
      const {data,error}=await supabase.rpc('trace_create_client',{p_name:createForm.name.trim(),p_package:createForm.package,p_status:createForm.status,p_pic_name:createForm.pic_name.trim(),p_drive_folder_link:createForm.drive_folder_link.trim(),p_notes:createForm.notes.trim()});
      if(error)throw error;
      if(data)setLocalClients(prev=>[...(prev??rows),data as TraceClientRecord]);
      setCreateForm(emptyClientForm());setCreateOpen(false);
    }catch(e){setCreateError(e instanceof Error?e.message:'Klien gagal disimpan.');}
    finally{setCreateBusy(false);}
  };
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26,display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
      <div><div className="trace-muted" style={{fontSize:12}}>KLIEN</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Daftar klien dari sumber production.</h1><div className="trace-muted">Tambah, ubah, dan hapus klien lewat RPC ber-audit — bukan lagi read-only.</div></div>
      <Dialog.Root open={createOpen} onOpenChange={o=>{setCreateOpen(o);if(!o){setCreateForm(emptyClientForm());setCreateError('');}}}>
        <Dialog.Trigger asChild><button className="trace-button">+ Tambah Klien</button></Dialog.Trigger>
        <Dialog.Portal><Dialog.Overlay className="trace-dialog-overlay"/><Dialog.Content className="trace-dialog-content"><Dialog.Close className="trace-icon-btn trace-dialog-close"><X size={16}/></Dialog.Close><Dialog.Title asChild><h2>Tambah Klien</h2></Dialog.Title>
          <ClientFormFields form={createForm} setForm={setCreateForm}/>
          {createError&&<div className="trace-alert" style={{marginTop:10}}>{createError}</div>}
          <button className="trace-button" style={{marginTop:14}} disabled={createBusy||!createForm.name.trim()} onClick={createClient}>{createBusy?'Menyimpan…':'Simpan Klien'}</button>
        </Dialog.Content></Dialog.Portal>
      </Dialog.Root>
    </div>
    <div className="trace-card"><input placeholder="Cari klien…" value={query} onChange={e=>setQuery(e.target.value)} style={{maxWidth:320}}/>
      {live.loading&&!localClients?<div className="trace-muted" style={{marginTop:12}}>Memuat…</div>:live.error&&!localClients?<div className="trace-muted" style={{marginTop:12}}>{live.error}</div>:filtered.length===0?<div className="trace-muted" style={{marginTop:12}}>Tidak ada klien yang cocok.</div>:<div style={{marginTop:14,display:'grid',gap:8}}>{filtered.map(c=><ClientRow key={c.id} client={c}
        outlets={outletRows.filter(o=>o.client_id===c.id)}
        onOutletAdded={o=>setLocalOutlets(prev=>[...(prev??outletRows),o])}
        onOutletDeleted={id=>setLocalOutlets(prev=>(prev??outletRows).filter(x=>x.id!==id))}
        onUpdated={updated=>setLocalClients(prev=>(prev??rows).map(x=>x.id===updated.id?updated:x))} onDeleted={id=>setLocalClients(prev=>(prev??rows).filter(x=>x.id!==id))}/>)}</div>}
    </div>
  </div>
}
export function ClientRow({client,outlets,onOutletAdded,onOutletDeleted,onUpdated,onDeleted}:{client:TraceClientRecord;outlets:TraceOutletRecord[];onOutletAdded:(o:TraceOutletRecord)=>void;onOutletDeleted:(id:string)=>void;onUpdated:(c:TraceClientRecord)=>void;onDeleted:(id:string)=>void}){
  const [open,setOpen]=useState(false);
  const [form,setForm]=useState(()=>({name:client.name,package:client.package,status:client.status,pic_name:client.pic_name??'',drive_folder_link:client.drive_folder_link??'',notes:client.notes??''}));
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [confirmDelete,setConfirmDelete]=useState(false);
  useEffect(()=>{if(open)setForm({name:client.name,package:client.package,status:client.status,pic_name:client.pic_name??'',drive_folder_link:client.drive_folder_link??'',notes:client.notes??''});},[open,client]);
  const save=async()=>{
    if(!form.name.trim()||busy)return;
    setBusy(true);setError('');
    try{
      const supabase=await requireReactSession();
      const {data,error:e}=await supabase.rpc('trace_update_client',{p_id:client.id,p_name:form.name.trim(),p_package:form.package,p_status:form.status,p_pic_name:form.pic_name.trim(),p_drive_folder_link:form.drive_folder_link.trim(),p_notes:form.notes.trim()});
      if(e)throw e;
      if(data)onUpdated(data as TraceClientRecord);
      setOpen(false);
    }catch(err){setError(err instanceof Error?err.message:'Klien gagal diperbarui.');}
    finally{setBusy(false);}
  };
  const remove=async()=>{
    if(busy)return; setBusy(true);setError('');
    try{
      const supabase=await requireReactSession();
      const {error:e}=await supabase.rpc('trace_delete_client',{p_id:client.id});
      if(e)throw e;
      onDeleted(client.id); setOpen(false);
    }catch(err){setError(err instanceof Error?err.message:'Klien gagal dihapus.');}
    finally{setBusy(false);}
  };
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button style={{all:'unset',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',border:'1px solid rgba(23,23,23,.08)',borderRadius:11,width:'100%'}}><div><strong style={{fontSize:13}}>{client.name}</strong><div className="trace-muted" style={{fontSize:11,marginTop:2}}>{client.status} · {client.package}</div></div><ArrowRight size={15} className="trace-muted"/></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="trace-dialog-overlay"/><Dialog.Content className="trace-dialog-content"><Dialog.Close className="trace-icon-btn trace-dialog-close"><X size={16}/></Dialog.Close><Dialog.Title asChild><h2>{client.name}</h2></Dialog.Title>
      <ClientFormFields form={form} setForm={setForm}/>
      {error&&<div className="trace-alert" style={{marginTop:10}}>{error}</div>}
      <OutletsSection clientId={client.id} outlets={outlets} onAdded={onOutletAdded} onDeleted={onOutletDeleted}/>
      <div style={{display:'flex',gap:8,marginTop:14,justifyContent:'space-between'}}>
        {confirmDelete?<div style={{display:'flex',gap:8,alignItems:'center'}}><span className="trace-muted" style={{fontSize:12}}>Yakin hapus klien ini?</span><button className="trace-button" style={{background:'#b91c1c'}} disabled={busy} onClick={remove}>{busy?'Menghapus…':'Ya, hapus'}</button><button className="trace-icon-btn" onClick={()=>setConfirmDelete(false)}>Batal</button></div>:<button className="trace-icon-btn" style={{color:'#b91c1c'}} onClick={()=>setConfirmDelete(true)}><Trash2 size={14}/></button>}
        <button className="trace-button" disabled={busy||!form.name.trim()} onClick={save}>{busy?'Menyimpan…':'Simpan Perubahan'}</button>
      </div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

