import { useEffect, useState } from 'react';
import { requireReactSession, loadTraceCollections, asArray, useTraceCollections, money, inputStyle } from './_shared';

export function OpexDetailView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [clientId,setClientId]=useState(''); const [outletId,setOutletId]=useState('');
  const [period,setPeriod]=useState(new Date().toISOString().slice(0,7));
  const [categories,setCategories]=useState<Array<Record<string,unknown>>>([]);
  const [items,setItems]=useState<Array<Record<string,unknown>>>([]);
  const [budget,setBudget]=useState<Array<Record<string,unknown>>>([]);
  const [accounts,setAccounts]=useState<Array<Record<string,unknown>>>([]);
  const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  const [catForm,setCatForm]=useState({code:'',name:''});
  const emptyItem={categoryId:'',vendor:'',desc:'',amount:'',freq:'one_time',dueDate:''};
  const [itemForm,setItemForm]=useState(emptyItem);
  const [budgetDraft,setBudgetDraft]=useState<Record<string,string>>({});
  const [postForm,setPostForm]=useState({expense:'',cash:'',ap:'',date:new Date().toISOString().slice(0,10)});

  const refresh=async()=>{
    if(!clientId)return;
    try{
      const supabase=await requireReactSession();
      const [catRes,itemRes,budgetRes,acctRes]=await Promise.all([
        supabase.rpc('trace_list_opex_categories',{p_client_id:clientId}),
        supabase.rpc('trace_list_opex_items',{p_client_id:clientId,p_outlet_id:outletId||null,p_period:period}),
        supabase.rpc('trace_opex_budget_vs_actual',{p_client_id:clientId,p_outlet_id:outletId||null,p_period:period}),
        loadTraceCollections([],['accounts'],clientId),
      ]);
      if(catRes.error) throw catRes.error; if(itemRes.error) throw itemRes.error; if(budgetRes.error) throw budgetRes.error;
      setCategories(asArray(catRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setItems(asArray(itemRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object')); setBudget(asArray(budgetRes.data).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      setAccounts(asArray((acctRes as any).data?.accounts).filter((x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'));
      const draft:Record<string,string>={}; asArray(budgetRes.data).forEach((b:any)=>{draft[String(b.opex_category_id)]=b.budget_amount==null?'':String(b.budget_amount);}); setBudgetDraft(draft);
    }catch(e){setMsg(e instanceof Error?e.message:'Gagal memuat data OPEX.');}
  };
  useEffect(()=>{void refresh();},[clientId,outletId,period]); // eslint-disable-line react-hooks/exhaustive-deps

  const catName=(id:string)=>String(categories.find(c=>String(c.id)===id)?.name??id);

  const createCategory=async()=>{if(!clientId||!catForm.name)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_create_opex_category',{p_client_id:clientId,p_code:catForm.code||null,p_name:catForm.name});if(error)throw error;setMsg('Kategori ditambahkan.');setCatForm({code:'',name:''});await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal menambah kategori.');}finally{setBusy(false);}};
  const createItem=async()=>{if(!clientId||!itemForm.categoryId||!itemForm.amount)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const isTemplate=itemForm.freq!=='one_time';const {error}=await supabase.rpc('trace_create_opex_item',{p_client_id:clientId,p_outlet_id:outletId||null,p_opex_category_id:itemForm.categoryId,p_vendor_name:itemForm.vendor||null,p_description:itemForm.desc||null,p_amount:Number(itemForm.amount),p_recurrence_frequency:itemForm.freq,p_period:isTemplate?null:period,p_due_date:itemForm.dueDate||null,p_notes:null});if(error)throw error;setMsg(isTemplate?'Template berulang dibuat.':'Item OPEX ditambahkan.');setItemForm(emptyItem);await refresh();}catch(e){setMsg(e instanceof Error?'Gagal menambah item: '+e.message:'Gagal menambah item: '+'(tidak diketahui).');}finally{setBusy(false);}};
  const generateRecurring=async()=>{if(!clientId)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_generate_recurring_opex',{p_client_id:clientId,p_period:period});if(error)throw error;setMsg(`${asArray(data).length} tagihan berulang digenerate untuk periode ini.`);await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal generate tagihan berulang.');}finally{setBusy(false);}};
  const payItem=async(id:string,amount:number)=>{setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_record_opex_payment',{p_line_item_id:id,p_paid_amount:amount,p_paid_at:new Date().toISOString(),p_payment_method:null,p_evidence_ref:null});if(error)throw error;await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal mencatat pembayaran.');}finally{setBusy(false);}};
  const saveBudget=async(categoryId:string)=>{const val=budgetDraft[categoryId];if(val===undefined)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {error}=await supabase.rpc('trace_set_opex_budget',{p_client_id:clientId,p_outlet_id:outletId||null,p_opex_category_id:categoryId,p_period:period,p_budget_amount:Number(val)||0});if(error)throw error;await refresh();}catch(e){setMsg(e instanceof Error?e.message:'Gagal menyimpan budget.');}finally{setBusy(false);}};
  const postPeriod=async()=>{if(!clientId||!postForm.expense||!postForm.cash||!postForm.ap)return;setBusy(true);setMsg('');try{const supabase=await requireReactSession();const {data,error}=await supabase.rpc('trace_post_opex_period',{p_client_id:clientId,p_outlet_id:outletId||null,p_period:period,p_opex_expense_account_id:postForm.expense,p_cash_bank_account_id:postForm.cash,p_ap_payable_account_id:postForm.ap,p_entry_date:postForm.date});if(error)throw error;const row=asArray(data)[0] as Record<string,unknown>|undefined;setMsg(row?`Diposting: total ${money(Number(row.total_amount))}, dibayar ${money(Number(row.total_paid))}, belum dibayar ${money(Number(row.total_unpaid))}.`:'Diposting.');}catch(e){setMsg(e instanceof Error?'Gagal posting: '+e.message:'Gagal posting: '+'(tidak diketahui).');}finally{setBusy(false);}};

  const totalActual=items.reduce((a,i)=>a+Number(i.amount||0),0);
  const totalPaid=items.reduce((a,i)=>a+Number(i.paid_amount||0),0);

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>OPEX · DETAIL</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>OPEX dengan template berulang otomatis dan budget vs actual.</h1><div className="trace-muted">Tagihan bulanan/kuartalan/tahunan cukup dibuat sekali sebagai template — generate otomatis tiap ganti periode. Status bayar terhitung dari due date, bukan input manual.</div></div>
    <div className="trace-card" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
      <label>Klien<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      <label>Outlet (opsional)<input value={outletId} onChange={e=>setOutletId(e.target.value)} placeholder="Kosongkan untuk pusat" style={inputStyle}/></label>
      <label>Periode<input type="month" value={period} onChange={e=>setPeriod(e.target.value)} style={inputStyle}/></label>
    </div>
    {msg&&<div className="trace-muted" style={{fontSize:12}}>{msg}</div>}
    {clientId&&<>
      <div className="trace-card"><strong>Kategori OPEX</strong>
        <div style={{marginTop:8,display:'flex',flexWrap:'wrap',gap:6}}>{categories.map(c=><span key={String(c.id)} style={{fontSize:12,padding:'4px 9px',borderRadius:999,background:'#f2f2ee'}}>{String(c.name)}</span>)}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr auto',gap:8,marginTop:10}}><input placeholder="Kode (opsional)" value={catForm.code} onChange={e=>setCatForm({...catForm,code:e.target.value})} style={inputStyle}/><input placeholder="Nama kategori" value={catForm.name} onChange={e=>setCatForm({...catForm,name:e.target.value})} style={inputStyle}/><button disabled={busy||!catForm.name} onClick={createCategory} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>+ Kategori</button></div>
      </div>
      <div className="trace-card"><strong>Tambah Item / Template Berulang</strong>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginTop:10}}>
          <select value={itemForm.categoryId} onChange={e=>setItemForm({...itemForm,categoryId:e.target.value})} style={inputStyle}><option value="">Kategori</option>{categories.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>)}</select>
          <input placeholder="Vendor" value={itemForm.vendor} onChange={e=>setItemForm({...itemForm,vendor:e.target.value})} style={inputStyle}/>
          <input placeholder="Deskripsi" value={itemForm.desc} onChange={e=>setItemForm({...itemForm,desc:e.target.value})} style={inputStyle}/>
          <input type="number" placeholder="Nominal" value={itemForm.amount} onChange={e=>setItemForm({...itemForm,amount:e.target.value})} style={inputStyle}/>
          <select value={itemForm.freq} onChange={e=>setItemForm({...itemForm,freq:e.target.value})} style={inputStyle}>{['one_time','monthly','quarterly','yearly'].map(f=><option key={f} value={f}>{f}</option>)}</select>
          {itemForm.freq==='one_time'&&<input type="date" placeholder="Jatuh tempo" value={itemForm.dueDate} onChange={e=>setItemForm({...itemForm,dueDate:e.target.value})} style={inputStyle}/>}
          <button disabled={busy||!itemForm.categoryId||!itemForm.amount} onClick={createItem} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>{itemForm.freq==='one_time'?'+ Tambah Item':'+ Buat Template'}</button>
        </div>
        {itemForm.freq!=='one_time'&&<div className="trace-muted" style={{fontSize:12,marginTop:6}}>Template belum langsung muncul sebagai tagihan bulan ini — klik "Generate Tagihan Berulang" di bawah.</div>}
      </div>
      <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Tagihan Periode {period}</strong><button disabled={busy} onClick={generateRecurring} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'7px 11px',background:'#fff',fontWeight:700,fontSize:12}}>Generate Tagihan Berulang</button></div>
        <div className="trace-muted" style={{fontSize:12,marginTop:6}}>Total {money(totalActual)} · Dibayar {money(totalPaid)} · Belum dibayar {money(totalActual-totalPaid)}</div>
        <div style={{marginTop:10,display:'grid',gap:5}}>{items.length===0?<div className="trace-muted" style={{fontSize:12}}>Belum ada tagihan periode ini.</div>:items.map(i=><div key={String(i.id)} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13,alignItems:'center'}}>
          <span>{catName(String(i.opex_category_id))}{i.vendor_name?` · ${String(i.vendor_name)}`:''}</span>
          <span>{money(Number(i.amount))}</span>
          <span className="trace-muted">{i.due_date?String(i.due_date):'—'}</span>
          <span style={{textTransform:'uppercase',fontSize:11,fontWeight:700,color:String(i.payment_status)==='paid'?'#15803d':String(i.payment_status)==='overdue'?'#b91c1c':'#a16207'}}>{String(i.payment_status)}</span>
          {String(i.payment_status)!=='paid'&&<button onClick={()=>void payItem(String(i.id),Number(i.amount)-Number(i.paid_amount||0))} disabled={busy} style={{fontSize:11,border:'1px solid rgba(23,23,23,.14)',borderRadius:7,padding:'5px 8px',background:'#fff'}}>Tandai Lunas</button>}
        </div>)}</div>
      </div>
      <div className="trace-card"><strong>Budget vs Actual</strong>
        <div style={{marginTop:10,display:'grid',gap:5}}>{budget.map(b=><div key={String(b.opex_category_id)} style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr 1fr auto',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.06)',fontSize:13,alignItems:'center'}}>
          <span>{String(b.category_name)}</span>
          <input type="number" value={budgetDraft[String(b.opex_category_id)]??''} onChange={e=>setBudgetDraft({...budgetDraft,[String(b.opex_category_id)]:e.target.value})} style={{...inputStyle,marginTop:0}}/>
          <span>Actual {money(Number(b.actual_amount))}</span>
          <span style={{color:Number(b.variance_amount)<0?'#b91c1c':'#15803d'}}>Selisih {money(Number(b.variance_amount))}{b.variance_pct!=null?` (${b.variance_pct}%)`:''}</span>
          <button onClick={()=>void saveBudget(String(b.opex_category_id))} disabled={busy} style={{fontSize:11,border:'1px solid rgba(23,23,23,.14)',borderRadius:7,padding:'5px 8px',background:'#fff'}}>Simpan</button>
        </div>)}</div>
      </div>
      <div className="trace-card"><strong>Posting Periode ke Jurnal</strong>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,marginTop:10}}>
          <select value={postForm.expense} onChange={e=>setPostForm({...postForm,expense:e.target.value})} style={inputStyle}><option value="">Akun Beban OPEX</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
          <select value={postForm.cash} onChange={e=>setPostForm({...postForm,cash:e.target.value})} style={inputStyle}><option value="">Akun Kas/Bank</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
          <select value={postForm.ap} onChange={e=>setPostForm({...postForm,ap:e.target.value})} style={inputStyle}><option value="">Akun Hutang OPEX</option>{accounts.map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} {String(a.name)}</option>)}</select>
          <input type="date" value={postForm.date} onChange={e=>setPostForm({...postForm,date:e.target.value})} style={inputStyle}/>
          <button disabled={busy||!postForm.expense||!postForm.cash||!postForm.ap} onClick={postPeriod} style={{border:0,borderRadius:9,padding:'9px 14px',background:'#171717',color:'#fff',fontWeight:700}}>Posting</button>
        </div>
      </div>
    </>}
  </div>;
}
