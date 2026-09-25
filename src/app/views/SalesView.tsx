import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';
import { buildSalesDashboard, type SaleLine } from '../../core/salesAnalytics';
import { fmtFieldAmount, getReactSupabase, loadTraceCollections, asArray, useTraceCollections, inputStyle } from './_shared';
import { useClientScope } from '../clientScope';
import { TracePageHeader, TraceCard } from '../components/TraceUI';

export const CHANNEL_OPTIONS:Array<[SaleLine['channel'],string]>=[['dine_in','Dine-in'],['gofood','GoFood'],['grabfood','GrabFood'],['shopeefood','ShopeeFood'],['other','Lainnya']];
export type ProductDraft={id:string|null;version:number|null;clientId:string;outletId:string;productName:string;menuCategory:string;price:number|string};
export const EMPTY_PRODUCT_DRAFT:ProductDraft={id:null,version:null,clientId:'',outletId:'',productName:'',menuCategory:'',price:''};
export type SaleDraft={clientId:string;outletId:string;productId:string;channel:SaleLine['channel'];qty:number|string;soldAt:string};
export const EMPTY_SALE_DRAFT:SaleDraft={clientId:'',outletId:'',productId:'',channel:'dine_in',qty:1,soldAt:new Date().toISOString().slice(0,16)};

export function SalesView(){
  const [tab,setTab]=useState<'produk'|'transaksi'|'dashboard'>('dashboard');
  const [products,setProducts]=useState<Array<Record<string,unknown>>>([]);
  const [sales,setSales]=useState<Array<Record<string,unknown>>>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [clientId,setClientId]=useClientScope();
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [productDraft,setProductDraft]=useState<ProductDraft>(EMPTY_PRODUCT_DRAFT);
  const [saleDraft,setSaleDraft]=useState<SaleDraft>(EMPTY_SALE_DRAFT);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);

  const refresh=async()=>{
    setLoading(true); setLoadError('');
    try{
      const {data}=await loadTraceCollections([],clientId?['products','sales']:[],clientId);
      setProducts(asArray(data['products']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setSales(asArray(data['sales']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
    }catch(e){ setLoadError(e instanceof Error?e.message:'Data penjualan tidak tersedia.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ refresh(); },[clientId]);

  const scopedProducts=products.filter(p=>String(p.client_id??'')===clientId.trim());
  const scopedSales=sales.filter(s=>String(s.client_id??'')===clientId.trim());
  const activeProducts=scopedProducts.filter(p=>p.active!==false);

  const saveProduct=async()=>{
    if(!clientId.trim()||!productDraft.productName.trim()||productDraft.price==='') return;
    setSaving(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_upsert_product',{
        p_id:productDraft.id, p_client_id:clientId.trim(), p_outlet_id:productDraft.outletId.trim()||null,
        p_product_name:productDraft.productName.trim(), p_menu_category:productDraft.menuCategory.trim()||null,
        p_price:Number(productDraft.price), p_active:true, p_expected_version:productDraft.version,
      });
      if(error) throw error;
      setMessage('Produk tersimpan.'); setProductDraft(EMPTY_PRODUCT_DRAFT); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal menyimpan produk.'); }
    finally{ setSaving(false); }
  };

  const recordSale=async()=>{
    const product=activeProducts.find(p=>String(p.id)===saleDraft.productId);
    if(!clientId.trim()||!product||saleDraft.qty==='') return;
    setSaving(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_record_sale',{
        p_client_id:clientId.trim(), p_outlet_id:saleDraft.outletId.trim()||null, p_product_id:product.id,
        p_product_name_snapshot:String(product.product_name), p_menu_category_snapshot:product.menu_category?String(product.menu_category):null,
        p_qty:Number(saleDraft.qty), p_unit_price:Number(product.price), p_channel:saleDraft.channel,
        p_sold_at:new Date(saleDraft.soldAt).toISOString(),
      });
      if(error) throw error;
      setMessage('Transaksi tercatat.'); setSaleDraft({...EMPTY_SALE_DRAFT,soldAt:new Date().toISOString().slice(0,16)}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal mencatat transaksi.'); }
    finally{ setSaving(false); }
  };

  const lines:SaleLine[]=scopedSales.map(s=>({id:String(s.id),productName:String(s.product_name_snapshot),menuCategory:s.menu_category_snapshot?String(s.menu_category_snapshot):undefined,qty:Number(s.qty),unitPrice:Number(s.unit_price),channel:s.channel as SaleLine['channel'],outletId:s.outlet_id?String(s.outlet_id):undefined,soldAt:String(s.sold_at)}));
  const dashboard=buildSalesDashboard(lines);

  const TabBtn=({id,label}:{id:typeof tab;label:string})=><button onClick={()=>setTab(id)} style={{border:0,borderBottom:tab===id?'2px solid #171717':'2px solid transparent',background:'none',padding:'8px 4px',fontWeight:tab===id?700:500,cursor:'pointer'}}>{label}</button>;
  const Panel=({title,items}:{title:string;items:BreakdownItemLike[]})=><TraceCard><strong style={{fontSize:13}}>{title}</strong>{items.length===0?<div className="trace-muted" style={{fontSize:12,marginTop:8}}>Belum ada data.</div>:<div style={{marginTop:10,display:'grid',gap:5}}>{items.map((it,i)=><div key={it.label} style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span>{i+1}. {it.label}</span><strong>{it.sharePct}%</strong></div>)}</div>}</TraceCard>;

  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="PENJUALAN & DASHBOARD" title="Katalog produk, transaksi, dan analitik penjualan" description={'Dashboard di bawah dihitung langsung dari transaksi yang tercatat — tidak ada angka contoh. Belum ada fitur target/pembanding tahun lalu; itu perlu fitur "target periode" terpisah yang belum dibangun.'} />
    <TraceCard><label>Klien / Scope<input value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="mis. nama-klien (harus sama dengan yang dipakai di Keuangan)" style={inputStyle}/></label></TraceCard>
    <div style={{display:'flex',gap:18,borderBottom:'1px solid rgba(23,23,23,.08)'}}><TabBtn id="dashboard" label="Dashboard"/><TabBtn id="produk" label="Produk"/><TabBtn id="transaksi" label="Transaksi"/></div>
    {message&&<div className="trace-muted" style={{fontSize:12}}>{message}</div>}
    {!clientId.trim()&&<TraceCard><div className="trace-muted">Isi Klien/Scope dulu di atas untuk melihat atau mencatat data.</div></TraceCard>}

    {clientId.trim()&&tab==='produk'&&<TraceCard>
      <strong>Tambah / edit produk</strong>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:10}}>
        <label>Nama Produk<input value={productDraft.productName} onChange={e=>setProductDraft({...productDraft,productName:e.target.value})} style={inputStyle}/></label>
        <label>Kategori Menu<input value={productDraft.menuCategory} onChange={e=>setProductDraft({...productDraft,menuCategory:e.target.value})} style={inputStyle}/></label>
        <label>Outlet (opsional)<input value={productDraft.outletId} onChange={e=>setProductDraft({...productDraft,outletId:e.target.value})} style={inputStyle}/></label>
        <label>Harga Jual<input type="number" value={productDraft.price} onChange={e=>setProductDraft({...productDraft,price:e.target.value===''?'':Number(e.target.value)})} style={inputStyle}/></label>
      </div>
      <button onClick={saveProduct} disabled={saving} style={{marginTop:12,border:0,borderRadius:9,padding:'10px 16px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>{productDraft.id?'Update Produk':'Simpan Produk'}</button>
      <div style={{marginTop:16,display:'grid',gap:6}}>{loading?<div className="trace-muted">Memuat…</div>:scopedProducts.length===0?<div className="trace-muted">Belum ada produk untuk klien ini.</div>:scopedProducts.map(p=><div key={String(p.id)} onClick={()=>setProductDraft({id:String(p.id),version:Number(p.version),clientId,outletId:String(p.outlet_id??''),productName:String(p.product_name),menuCategory:String(p.menu_category??''),price:Number(p.price)})} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:10,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.07)',fontSize:13,cursor:'pointer'}}><span>{String(p.product_name)}</span><span className="trace-muted">{String(p.menu_category??'—')}</span><strong>{fmtFieldAmount(p.price)}</strong></div>)}</div>
    </TraceCard>}

    {clientId.trim()&&tab==='transaksi'&&<TraceCard>
      <strong>Catat transaksi</strong>
      {activeProducts.length===0?<div className="trace-muted" style={{marginTop:8}}>Belum ada produk aktif — tambah produk dulu di tab Produk.</div>:<>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:10}}>
        <label>Produk<select value={saleDraft.productId} onChange={e=>setSaleDraft({...saleDraft,productId:e.target.value})} style={inputStyle}><option value="">— Pilih —</option>{activeProducts.map(p=><option key={String(p.id)} value={String(p.id)}>{String(p.product_name)}</option>)}</select></label>
        <label>Channel<select value={saleDraft.channel} onChange={e=>setSaleDraft({...saleDraft,channel:e.target.value as SaleLine['channel']})} style={inputStyle}>{CHANNEL_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label>Outlet (opsional)<input value={saleDraft.outletId} onChange={e=>setSaleDraft({...saleDraft,outletId:e.target.value})} style={inputStyle}/></label>
        <label>Qty<input type="number" value={saleDraft.qty} onChange={e=>setSaleDraft({...saleDraft,qty:e.target.value===''?'':Number(e.target.value)})} style={inputStyle}/></label>
        <label>Waktu<input type="datetime-local" value={saleDraft.soldAt} onChange={e=>setSaleDraft({...saleDraft,soldAt:e.target.value})} style={inputStyle}/></label>
      </div>
      <button onClick={recordSale} disabled={saving||!saleDraft.productId} style={{marginTop:12,border:0,borderRadius:9,padding:'10px 16px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>Catat Transaksi</button>
      </>}
      <div style={{marginTop:16,display:'grid',gap:6}}>{loading?<div className="trace-muted">Memuat…</div>:scopedSales.length===0?<div className="trace-muted">Belum ada transaksi.</div>:scopedSales.slice(0,30).map(s=><div key={String(s.id)} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:10,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.07)',fontSize:12}}><span>{new Date(String(s.sold_at)).toLocaleString('id-ID')}</span><span>{String(s.product_name_snapshot)}</span><span className="trace-muted">{String(s.channel)}</span><strong>{fmtFieldAmount(Number(s.qty)*Number(s.unit_price))}</strong></div>)}</div>
    </TraceCard>}

    {clientId.trim()&&tab==='dashboard'&&<>
      <TraceCard><div className="trace-muted" style={{fontSize:12}}>TOTAL REVENUE (SEMUA TRANSAKSI TERCATAT)</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{fmtFieldAmount(dashboard.totalRevenue)}</div></TraceCard>
      {dashboard.monthlyRevenue.length>0&&<TraceCard><strong style={{fontSize:13}}>Revenue per bulan</strong><div style={{width:'100%',height:220,marginTop:10}}><ResponsiveContainer><BarChart data={dashboard.monthlyRevenue}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="period" fontSize={11}/><YAxis fontSize={11}/><RTooltip formatter={(v)=>fmtFieldAmount(v as number)}/><Bar dataKey="value" fill="#171717"/></BarChart></ResponsiveContainer></div></TraceCard>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:14}}>
        <Panel title="Produk Terlaris" items={dashboard.topProducts}/>
        <Panel title="Kategori Menu" items={dashboard.topCategories}/>
        <Panel title="Kisaran Harga" items={dashboard.priceRanges}/>
        <Panel title="Outlet" items={dashboard.topOutlets}/>
        <Panel title="Jam Ramai" items={dashboard.topHours}/>
        <Panel title="Channel Pemasaran" items={dashboard.topChannels}/>
      </div>
    </>}
  </div>
}
export type BreakdownItemLike={label:string;value:number;sharePct:number};

