import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { requireReactSession, loadTraceCollections, asArray, useTraceCollections, money, inputStyle } from './_shared';

export function StockOpnameView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useState(''); const [outletId,setOutletId]=useState('');
  const [items,setItems]=useState<Array<Record<string,unknown>>>([]);
  const [position,setPosition]=useState<Array<Record<string,unknown>>>([]);
  const [sessions,setSessions]=useState<Array<Record<string,unknown>>>([]);
  const [sessionId,setSessionId]=useState('');
  const [lines,setLines]=useState<Array<Record<string,unknown>>>([]);
  const [accounts,setAccounts]=useState<Array<Record<string,unknown>>>([]);
  const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const [receive,setReceive]=useState({itemId:'',qty:'',cost:'',ref:'',notes:''});
  const [issue,setIssue]=useState({itemId:'',qty:'',ref:'',notes:''});
  const [openForm,setOpenForm]=useState({period:new Date().toISOString().slice(0,7),notes:''});
  const [countDraft,setCountDraft]=useState<Record<string,{primary:string;secondary:string;reasonCode:string;reasonNote:string}>>({});
  const [postForm,setPostForm]=useState({invAccount:'',shrinkAccount:'',overageAccount:'',date:new Date().toISOString().slice(0,10)});

  const refresh=async()=>{
    if(!clientId)return;
    try{
      const supabase=await requireReactSession();
      const [itemsRes,posRes,sessRes,acctRes]=await Promise.all([
        supabase.rpc('trace_list_inventory_items',{p_client_id:clientId,p_outlet_id:outletId||null,p_active_only:true}),
        supabase.rpc('trace_inventory_position',{p_client_id:clientId,p_outlet_id:outletId||null}),
        supabase.rpc('trace_list_opname_sessions',{p_client_id:clientId,p_outlet_id:outletId||null}),
        loadTraceCollections([],['accounts'],clientId),
      ]);
      if(itemsRes.error) throw itemsRes.error; if(posRes.error) throw posRes.error; if(sessRes.error) throw sessRes.error;
      setItems(asArray(itemsRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setPosition(asArray(posRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setSessions(asArray(sessRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      setAccounts(asArray((acctRes as any).data?.accounts).filter((x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'));
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat data opname.');}
  };
  useEffect(()=>{void refresh();},[clientId,outletId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLines=async(sid:string)=>{
    setSessionId(sid);
    try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_get_opname_lines',{p_session_id:sid});if(error)throw error;
      const rows=asArray(data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');setLines(rows);
      const draft:typeof countDraft={};rows.forEach(r=>{draft[String(r.item_id)]={primary:r.counted_qty==null?'':String(r.counted_qty),secondary:r.secondary_counted_qty==null?'':String(r.secondary_counted_qty),reasonCode:String(r.variance_reason_code??''),reasonNote:String(r.variance_reason??'')};});setCountDraft(draft);
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat baris opname.');}
  };

  const itemName=(id:string)=>String(items.find(i=>String(i.id)===id)?.item_name??id);

  const doReceive=async()=>{if(!clientId||!receive.itemId||!receive.qty)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_receive_stock',{p_client_id:clientId,p_outlet_id:outletId||null,p_item_id:receive.itemId,p_qty:Number(receive.qty),p_unit_cost:Number(receive.cost)||0,p_source_ref:receive.ref||null,p_notes:receive.notes||null});if(error)throw error;setMsg('Stok masuk tercatat.');setReceive({itemId:'',qty:'',cost:'',ref:'',notes:''});await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal mencatat stok masuk.');}finally{setBusy(false);}};
  const doIssue=async()=>{if(!clientId||!issue.itemId||!issue.qty)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_issue_stock',{p_client_id:clientId,p_outlet_id:outletId||null,p_item_id:issue.itemId,p_qty:Number(issue.qty),p_ref_type:issue.ref||null,p_ref_id:null,p_notes:issue.notes||null});if(error)throw error;setMsg('Stok keluar tercatat.');setIssue({itemId:'',qty:'',ref:'',notes:''});await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal mencatat stok keluar.');}finally{setBusy(false);}};
  const openSession=async()=>{if(!clientId||!openForm.period)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_open_opname_session',{p_client_id:clientId,p_outlet_id:outletId||null,p_period_label:openForm.period,p_notes:openForm.notes||null});if(error)throw error;setMsg('Sesi opname dibuka.');await refresh();if(data)await loadLines(String((data as Record<string,unknown>).id));}catch(e){setMsg(e instanceof Error?e.message:'Gagal membuka sesi opname.');}finally{setBusy(false);}};
  const submitCount=async(itemId:string,isSecondary:boolean)=>{const d=countDraft[itemId];const val=isSecondary?d?.secondary:d?.primary;if(!val)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_submit_opname_count',{p_session_id:sessionId,p_item_id:itemId,p_counted_qty:Number(val),p_is_secondary:isSecondary});if(error)throw error;await loadLines(sessionId);}catch(e){setMsg(e instanceof Error?e.message:'Gagal menyimpan hasil hitung.');}finally{setBusy(false);}};
  const submitReason=async(itemId:string)=>{const d=countDraft[itemId];if(!d?.reasonCode)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_set_opname_variance_reason',{p_session_id:sessionId,p_item_id:itemId,p_reason_code:d.reasonCode,p_reason_note:d.reasonNote||null});if(error)throw error;await loadLines(sessionId);}catch(e){setMsg(e instanceof Error?e.message:'Gagal menyimpan alasan varians.');}finally{setBusy(false);}};
  const transition=async(status:string)=>{const s=sessions.find(x=>String(x.id)===sessionId);if(!s)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_transition_opname_session',{p_session_id:sessionId,p_status:status,p_expected_version:Number(s.version),p_reason:null});if(error)throw error;setMsg(`Status sesi diubah ke ${status}.`);await refresh();}catch(e){setMsg(e instanceof Error?'Transisi ditolak: '+e.message:'Transisi ditolak: '+'(tidak diketahui).');}finally{setBusy(false);}};
  const postSession=async()=>{const s=sessions.find(x=>String(x.id)===sessionId);if(!s||!postForm.invAccount||!postForm.shrinkAccount||!postForm.overageAccount)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_post_opname_session',{p_session_id:sessionId,p_expected_version:Number(s.version),p_inventory_asset_account_id:postForm.invAccount,p_shrinkage_expense_account_id:postForm.shrinkAccount,p_overage_gain_account_id:postForm.overageAccount,p_entry_date:postForm.date});if(error)throw error;setMsg('Sesi opname diposting ke jurnal.');await refresh();}catch(e){setMsg(e instanceof Error?'Gagal posting: '+e.message:'Gagal posting: '+'(tidak diketahui).');}finally{setBusy(false);}};

  const selectedSession=sessions.find(s=>String(s.id)===sessionId);

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>INVENTORY · STOCK OPNAME (FIFO)</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Kartu stok FIFO, sesi opname dual-count, dan posting varians ke jurnal.</h1><div className="trace-muted">Setiap penerimaan jadi lot FIFO tersendiri. Sesi opname men-snapshot posisi stok, lalu membandingkan dengan hitung fisik — varians butuh alasan sebelum bisa di-approve, dan approval butuh akun sebelum diposting ke jurnal.</div></div>
    <div className="trace-card" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
      <label>Klien<select value={clientId} onChange={e=>{setClientId(e.target.value);setSessionId('');setLines([]);}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      <label>Outlet (opsional)<input value={outletId} onChange={e=>setOutletId(e.target.value)} placeholder="Kosongkan untuk pusat" style={inputStyle}/></label>
    </div>
    {msg&&<div className="trace-muted" style={{fontSize:12}}>{msg}</div>}
    {clientId&&<>
      <div className="trace-card"><strong>Posisi Stok (FIFO)</strong><div style={{marginTop:10,display:'grid',gap:5,fontSize:12}}>{position.length===0?<div className="trace-muted">Belum ada stok.</div>:position.map(p=><div key={String(p.item_id)} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr',gap:8,padding:'5px 0',borderTop:'1px solid rgba(23,23,23,.06)'}}><span>{itemName(String(p.item_id))}</span><span>{String(p.qty_on_hand)}</span><span>{money(Number(p.avg_unit_cost))}/unit</span><span>{money(Number(p.value_on_hand))}</span></div>)}</div></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div className="trace-card"><strong>Terima Stok (lot baru)</strong><div style={{display:'grid',gap:8,marginTop:10}}><select value={receive.itemId} onChange={e=>setReceive({...receive,itemId:e.target.value})} style={inputStyle}><option value="">Pilih bahan</option>{items.map(i=><option key={String(i.id)} value={String(i.id)}>{String(i.item_name)}</option>)}</select><input type="number" placeholder="Qty" value={receive.qty} onChange={e=>setReceive({...receive,qty:e.target.value})} style={inputStyle}/><input type="number" placeholder="Unit cost" value={receive.cost} onChange={e=>setReceive({...receive,cost:e.target.value})} style={inputStyle}/><input placeholder="Referensi (PO/invoice)" value={receive.ref} onChange={e=>setReceive({...receive,ref:e.target.value})} style={inputStyle}/><button disabled={busy||!receive.itemId||!receive.qty} onClick={doReceive} style={{border:0,borderRadius:9,padding:'9px 12px',background:'#171717',color:'#fff',fontWeight:700}}>+ Terima</button></div></div>
        <div className="trace-card"><strong>Keluarkan Stok</strong><div style={{display:'grid',gap:8,marginTop:10}}><select value={issue.itemId} onChange={e=>setIssue({...issue,itemId:e.target.value})} style={inputStyle}><option value="">Pilih bahan</option>{items.map(i=><option key={String(i.id)} value={String(i.id)}>{String(i.item_name)}</option>)}</select><input type="number" placeholder="Qty" value={issue.qty} onChange={e=>setIssue({...issue,qty:e.target.value})} style={inputStyle}/><input placeholder="Referensi (mis. konsumsi/waste)" value={issue.ref} onChange={e=>setIssue({...issue,ref:e.target.value})} style={inputStyle}/><button disabled={busy||!issue.itemId||!issue.qty} onClick={doIssue} style={{border:0,borderRadius:9,padding:'9px 12px',background:'#171717',color:'#fff',fontWeight:700}}>− Keluarkan</button></div></div>
      </div>
      <div className="trace-card"><strong>Buka Sesi Opname Baru</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Snapshot posisi stok saat ini otomatis jadi "expected qty" untuk tiap bahan.</div><div style={{display:'grid',gridTemplateColumns:'1fr 2fr auto',gap:8,marginTop:10}}><input type="month" value={openForm.period} onChange={e=>setOpenForm({...openForm,period:e.target.value})} style={inputStyle}/><input placeholder="Catatan (opsional)" value={openForm.notes} onChange={e=>setOpenForm({...openForm,notes:e.target.value})} style={inputStyle}/><button disabled={busy} onClick={openSession} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Buka Sesi</button></div></div>
      <div className="trace-card"><strong>Riwayat Sesi</strong><div style={{marginTop:10,display:'grid',gap:5}}>{sessions.length===0?<div className="trace-muted" style={{fontSize:12}}>Belum ada sesi.</div>:sessions.map(s=><div key={String(s.id)} onClick={()=>void loadLines(String(s.id))} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13,cursor:'pointer',background:sessionId===String(s.id)?'#fafaf8':'transparent'}}><span>{String(s.period_label)}</span><span className="trace-muted" style={{textTransform:'uppercase',fontSize:11}}>{String(s.status)}</span><ArrowRight size={14} className="trace-muted"/></div>)}</div></div>
      {selectedSession&&<div className="trace-card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Sesi {String(selectedSession.period_label)} · {String(selectedSession.status).toUpperCase()}</strong>
          <div style={{display:'flex',gap:8}}>
            {String(selectedSession.status)==='counting'&&<button onClick={()=>void transition('reviewing')} disabled={busy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'7px 11px',background:'#fff',fontWeight:700}}>Tutup Hitung → Review</button>}
            {String(selectedSession.status)==='reviewing'&&<button onClick={()=>void transition('approved')} disabled={busy} style={{border:0,borderRadius:9,padding:'7px 11px',background:'#171717',color:'#fff',fontWeight:700}}>Approve</button>}
            {['counting','reviewing'].includes(String(selectedSession.status))&&<button onClick={()=>void transition('cancelled')} disabled={busy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'7px 11px',background:'#fff',color:'#b91c1c',fontWeight:700}}>Batalkan</button>}
          </div>
        </div>
        <div style={{marginTop:12,display:'grid',gap:10}}>{lines.map(l=>{const iid=String(l.item_id);const d=countDraft[iid]??{primary:'',secondary:'',reasonCode:'',reasonNote:''};const hasVariance=Number(l.variance_qty??0)!==0;return <div key={String(l.id)} style={{padding:12,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}>
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:13}}><span>{itemName(iid)}</span><span className="trace-muted">Expected: {String(l.expected_qty)}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginTop:8}}>
            <div><label style={{fontSize:11}}>Hitung 1<input type="number" value={d.primary} onChange={e=>setCountDraft({...countDraft,[iid]:{...d,primary:e.target.value}})} style={inputStyle}/></label><button onClick={()=>void submitCount(iid,false)} disabled={busy||!d.primary} style={{marginTop:6,fontSize:11,border:'1px solid rgba(23,23,23,.14)',borderRadius:7,padding:'5px 8px',background:'#fff'}}>Simpan</button></div>
            <div><label style={{fontSize:11}}>Hitung 2 (dual-count)<input type="number" value={d.secondary} onChange={e=>setCountDraft({...countDraft,[iid]:{...d,secondary:e.target.value}})} style={inputStyle}/></label><button onClick={()=>void submitCount(iid,true)} disabled={busy||!d.secondary} style={{marginTop:6,fontSize:11,border:'1px solid rgba(23,23,23,.14)',borderRadius:7,padding:'5px 8px',background:'#fff'}}>Simpan</button></div>
            <div><div style={{fontSize:11,color:'#666'}}>Varians</div><strong style={{color:hasVariance?'#b91c1c':'inherit'}}>{l.variance_qty==null?'—':String(l.variance_qty)}</strong></div>
            {hasVariance&&<div><label style={{fontSize:11}}>Alasan varians<select value={d.reasonCode} onChange={e=>setCountDraft({...countDraft,[iid]:{...d,reasonCode:e.target.value}})} style={inputStyle}><option value="">Pilih alasan</option>{['damaged','lost','expired','input_error','theft_suspected','uom_mismatch','other'].map(r=><option key={r} value={r}>{r}</option>)}</select></label><button onClick={()=>void submitReason(iid)} disabled={busy||!d.reasonCode} style={{marginTop:6,fontSize:11,border:'1px solid rgba(23,23,23,.14)',borderRadius:7,padding:'5px 8px',background:'#fff'}}>Simpan</button></div>}
          </div>
        </div>;})}</div>
        {String(selectedSession.status)==='approved'&&<div style={{marginTop:16,padding:14,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}>
          <strong>Posting ke Jurnal</strong>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,marginTop:10}}>
            <select value={postForm.invAccount} onChange={e=>setPostForm({...postForm,invAccount:e.target.value})} style={inputStyle}><option value="">Akun Persediaan</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
            <select value={postForm.shrinkAccount} onChange={e=>setPostForm({...postForm,shrinkAccount:e.target.value})} style={inputStyle}><option value="">Akun Beban Susut</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
            <select value={postForm.overageAccount} onChange={e=>setPostForm({...postForm,overageAccount:e.target.value})} style={inputStyle}><option value="">Akun Selisih Lebih</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
            <input type="date" value={postForm.date} onChange={e=>setPostForm({...postForm,date:e.target.value})} style={inputStyle}/>
            <button disabled={busy||!postForm.invAccount||!postForm.shrinkAccount||!postForm.overageAccount} onClick={postSession} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Posting</button>
          </div>
          {accounts.length===0&&<div className="trace-muted" style={{fontSize:12,marginTop:8}}>Belum ada chart of accounts untuk klien ini — buat dulu di layar Akuntansi.</div>}
        </div>}
      </div>}
    </>}
  </div>;
}

