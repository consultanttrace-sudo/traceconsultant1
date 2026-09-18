import { useEffect, useState } from 'react';
import { ArrowRight, CircleCheck, TriangleAlert } from 'lucide-react';
import { financeInputGuidance, validateFinanceRecord } from '../../core/financeInput';
import { compareFinancePeriods, buildFinanceMonthlyView, assessFinanceQuality, type FinanceRecord, type FinanceStatementSection } from '../../core/finance';
import { exportFinanceExcel, exportFinancePdf, exportIncomeStatementExcel, exportIncomeStatementPdf, exportFinanceDashboardExcel } from '../../core/financeReport';
import { buildIncomeStatement } from '../../core/financeStatement';
import { calculateRecipeCogs } from '../../core/accounting';
import { fmtFieldAmount, getReactSupabase, loadTraceCollections, asArray, useTraceCollections, inputStyle } from './_shared';

export type FinanceDraft = { id:string|null; version:number|null; clientId:string; outletId:string; period:string; amount:number|string; category:'revenue'|'cogs'|'labor'|'opex'; evidenceNote:string; accountLabel:string; statementSection:FinanceStatementSection|'' };
export const EMPTY_FINANCE_DRAFT: FinanceDraft = { id:null, version:null, clientId:'', outletId:'', period:'', amount:'', category:'revenue', evidenceNote:'', accountLabel:'', statementSection:'' };
export const STATEMENT_SECTION_LABEL: Record<FinanceStatementSection,string> = { pendapatan_usaha:'Pendapatan Usaha', biaya_produksi:'Biaya Produksi', biaya_usaha_lain:'Biaya Usaha Lain', biaya_operasional:'Biaya Operasional', biaya_non_operasional:'Biaya Non Operasional', pendapatan_lain:'Pendapatan Lain', pengeluaran_lain:'Pengeluaran Lain' };


export function FinanceEntry(){
  const [draft,setDraft]=useState<FinanceDraft>(EMPTY_FINANCE_DRAFT);
  const [rows,setRows]=useState<Array<Record<string,unknown>>>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [saving,setSaving]=useState(false);
  const [saveMessage,setSaveMessage]=useState('');
  const [exporting,setExporting]=useState<'pdf'|'xlsx'|''>('');
  const [previousPeriod,setPreviousPeriod]=useState('');
  const [productsRaw,setProductsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [inventoryItemsRaw,setInventoryItemsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [inventoryRecipesRaw,setInventoryRecipesRaw]=useState<Array<Record<string,unknown>>>([]);
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const selectedClientName=String(clients.find(c=>String(c.id)===draft.clientId)?.name??clients.find(c=>String(c.id)===draft.clientId)?.business_name??draft.clientId);

  const refresh=async()=>{
    setLoading(true); setLoadError('');
    try{ const {data}=await loadTraceCollections([],draft.clientId?['finance','products','inventory_items','inventory_recipes']:[],draft.clientId); setRows(asArray(data['finance']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null)); setProductsRaw(asArray(data['products']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null)); setInventoryItemsRaw(asArray(data['inventory_items']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null)); setInventoryRecipesRaw(asArray(data['inventory_recipes']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null)); }
    catch(e){ setLoadError(e instanceof Error?e.message:'Data finance tidak tersedia.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ refresh(); },[draft.clientId]);

  const issues=validateFinanceRecord({id:draft.id??'x',period:draft.period,category:draft.category,amount:draft.amount===''?undefined:Number(draft.amount),evidence:draft.evidenceNote.trim()?{id:'x',source:'manual',note:draft.evidenceNote}:undefined});
  const guidance=financeInputGuidance(issues);
  const canSave=guidance.status!=='blocked' && draft.clientId.trim().length>0 && !saving;

  const clientRows=rows.filter(r=>String(r.client_id??'')===draft.clientId.trim());
  const records:FinanceRecord[]=clientRows.map(r=>({id:String(r.id),period:String(r.period),amount:Number(r.amount),category:r.category as FinanceRecord['category'],outletId:r.outlet_id?String(r.outlet_id):undefined,accountLabel:r.account_label?String(r.account_label):undefined,statementSection:r.statement_section?r.statement_section as FinanceStatementSection:undefined,evidence:r.evidence_source?{id:String(r.id),source:r.evidence_source as 'system'|'manual'|'imported',note:r.evidence_note?String(r.evidence_note):undefined}:undefined}));
  const periods=[...new Set(records.map(r=>r.period))].sort();
  const autoPrevious=periods.filter(p=>p<draft.period).slice(-1)[0]??'';
  const effectivePrevious=previousPeriod||autoPrevious;
  const comparison=draft.period?compareFinancePeriods(records,draft.period,effectivePrevious||undefined):null;
  const monthlyView=buildFinanceMonthlyView(records);
  const financeQuality=assessFinanceQuality(records);
  const latestFinance=monthlyView.at(-1)??null;
  const recipeInputs=productsRaw.map(p=>({productId:String(p.id),qty:1,components:inventoryRecipesRaw.filter(r=>String(r.product_id)===String(p.id)).map(r=>{const item=inventoryItemsRaw.find(i=>String(i.id)===String(r.item_id));return {itemId:String(r.item_id),qtyPerSale:Number(r.qty_per_sale),unitCost:item?.unit_cost==null?null:Number(item.unit_cost)};})})).filter(x=>x.components.length);
  const recipeResults=calculateRecipeCogs(recipeInputs);

  const save=async()=>{
    setSaving(true); setSaveMessage('');
    try{
      const supabase=getReactSupabase();
      if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_upsert_finance_record',{
        p_id:draft.id, p_client_id:draft.clientId.trim(), p_outlet_id:draft.outletId.trim()||null,
        p_period:draft.period, p_category:draft.category, p_amount:Number(draft.amount),
        p_evidence_source: draft.evidenceNote.trim()?'manual':null, p_evidence_note: draft.evidenceNote.trim()||null,
        p_expected_version: draft.version, p_reason:'Finance Guided Entry',
        p_account_label: draft.accountLabel.trim()||null, p_statement_section: draft.statementSection||null,
      });
      if(error) throw error;
      setSaveMessage('Tersimpan.'); setDraft({...EMPTY_FINANCE_DRAFT,clientId:draft.clientId});
      await refresh();
    }catch(e){ setSaveMessage(e instanceof Error?`Gagal menyimpan: ${e.message}`:'Gagal menyimpan.'); }
    finally{ setSaving(false); }
  };

  const editRow=(r:Record<string,unknown>)=>setDraft({id:String(r.id),version:Number(r.version),clientId:String(r.client_id??''),outletId:String(r.outlet_id??''),period:String(r.period),amount:Number(r.amount),category:r.category as FinanceDraft['category'],evidenceNote:String(r.evidence_note??''),accountLabel:String(r.account_label??''),statementSection:(r.statement_section as FinanceStatementSection)??''});

  const doExport=async(kind:'pdf'|'xlsx')=>{
    if(!comparison||!draft.period||!draft.clientId.trim()) return;
    setExporting(kind);
    try{
      const meta={clientName:selectedClientName,currentPeriod:draft.period,previousPeriod:effectivePrevious||undefined};
      if(kind==='pdf') await exportFinancePdf(comparison,meta); else await exportFinanceExcel(records,comparison,meta);
    }catch(e){ setSaveMessage(e instanceof Error?`Gagal membuat file: ${e.message}`:'Gagal membuat file.'); }
    finally{ setExporting(''); }
  };

  const [exportingStatement,setExportingStatement]=useState<'pdf'|'xlsx'|''>('');
  const statement=draft.period?buildIncomeStatement(records,draft.period):null;
  const doExportStatement=async(kind:'pdf'|'xlsx')=>{
    if(!statement||!draft.clientId.trim()) return;
    setExportingStatement(kind);
    try{
      const meta={clientName:selectedClientName,currentPeriod:draft.period};
      if(kind==='pdf') await exportIncomeStatementPdf(statement,meta); else await exportIncomeStatementExcel(statement,meta);
    }catch(e){ setSaveMessage(e instanceof Error?`Gagal membuat file: ${e.message}`:'Gagal membuat file.'); }
    finally{ setExportingStatement(''); }
  };

  const [exportingDashboard,setExportingDashboard]=useState(false);
  const doExportDashboard=async()=>{
    if(!draft.clientId.trim()||!draft.period) return;
    setExportingDashboard(true);
    try{ await exportFinanceDashboardExcel(records,{clientName:selectedClientName,currentPeriod:draft.period}); }
    catch(e){ setSaveMessage(e instanceof Error?`Gagal membuat dashboard: ${e.message}`:'Gagal membuat dashboard.'); }
    finally{ setExportingDashboard(false); }
  };

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>FINANCE · GUIDED ENTRY</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Catat keuangan, simpan ke database, dan buat laporan</h1><div className="trace-muted">Data tersimpan permanen di Supabase (bukan draft sesi). Laporan PDF/Excel dibuat dari data yang sudah tersimpan, bukan dari input yang belum disimpan.</div></div>

    {draft.clientId.trim()&&<div className="trace-card" style={{display:'grid',gap:14}}><div><div className="trace-muted" style={{fontSize:12}}>FINANCE INTELLIGENCE · CLIENT P&L</div><strong style={{fontSize:20}}>Dashboard Keuangan</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>TRACE memisahkan Revenue, COGS, Labor, OPEX, profit, margin, tren bulanan, kualitas evidence, dan data yang belum lengkap.</div></div>{records.length===0?<div className="trace-alert">Belum ada data keuangan tersimpan. Approve Data Intake agar finance per bulan dibuat otomatis, atau gunakan Guided Entry di bawah.</div>:<><div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:8}}>{[['Periode',financeQuality.periods],['Record',financeQuality.records],['Evidence',`${financeQuality.evidenceCoveragePct}%`],['Bulan lengkap',`${financeQuality.periodsWithAllCoreMetrics}/${financeQuality.periods}`],['Duplicate risk',financeQuality.duplicateRisk]].map(([k,v])=><div key={String(k)} style={{padding:11,border:'1px solid rgba(23,23,23,.08)',borderRadius:10}}><div className="trace-muted" style={{fontSize:10}}>{k}</div><strong style={{display:'block',marginTop:5,fontSize:17}}>{String(v)}</strong></div>)}</div><div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Periode','Revenue','COGS','Gross Profit','Labor','OPEX','Prime Cost','Operating Profit','GM','OM'].map(h=><th key={h} style={{textAlign:h==='Periode'?'left':'right',padding:'8px 6px',borderBottom:'1px solid rgba(23,23,23,.12)'}}>{h}</th>)}</tr></thead><tbody>{monthlyView.map(m=><tr key={m.period}>{[m.period,m.revenue,m.cogs,m.grossProfit,m.labor,m.opex,m.primeCost,m.operatingProfit,m.grossMarginPct,m.operatingMarginPct].map((v,i)=><td key={i} style={{textAlign:i===0?'left':'right',padding:'8px 6px',borderBottom:'1px solid rgba(23,23,23,.06)'}}>{i===0?String(v):i>=8?(v===null?'—':`${Number(v).toFixed(1)}%`):(v===null?'—':fmtFieldAmount(Number(v)))}</td>)}</tr>)}</tbody></table></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div style={{padding:13,border:'1px solid rgba(23,23,23,.08)',borderRadius:10}}><strong>Latest month</strong><div className="trace-muted" style={{fontSize:12,marginTop:7}}>{latestFinance?.missing.length?`Data belum lengkap: ${latestFinance.missing.join(', ')}`:'Core finance lengkap untuk periode terbaru.'}</div>{latestFinance&&<div style={{fontSize:12,marginTop:7}}>COGS {latestFinance.cogsPct===null?'—':latestFinance.cogsPct.toFixed(1)+'%'} · Labor {latestFinance.laborPct===null?'—':latestFinance.laborPct.toFixed(1)+'%'} · OPEX {latestFinance.opexPct===null?'—':latestFinance.opexPct.toFixed(1)+'%'} · Operating Margin {latestFinance.operatingMarginPct===null?'—':latestFinance.operatingMarginPct.toFixed(1)+'%'}</div>}</div><div style={{padding:13,border:'1px solid rgba(23,23,23,.08)',borderRadius:10}}><strong>Data quality</strong><div className="trace-muted" style={{fontSize:12,marginTop:7}}>Missing per bulan — Revenue: {financeQuality.missingByMetric.revenue??0}, COGS: {financeQuality.missingByMetric.cogs??0}, Labor: {financeQuality.missingByMetric.labor??0}, OPEX: {financeQuality.missingByMetric.opex??0}.</div><div style={{fontSize:12,marginTop:6}}>{financeQuality.duplicateRisk?`Ada ${financeQuality.duplicateRisk} kombinasi record berisiko duplikat.`:'Tidak ada duplicate risk sederhana yang terdeteksi.'}</div></div></div></>}</div>}
    {recipeResults.length>0&&<div className="trace-card"><div><strong>COGS Recipe Check</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>COGS produk dihitung dari resep × unit cost inventory. Bahan tanpa unit cost tidak dipaksa menjadi Rp0.</div></div><div style={{overflowX:'auto',marginTop:10}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr><th style={{textAlign:'left',padding:'7px'}}>Produk</th><th style={{textAlign:'right',padding:'7px'}}>COGS / unit</th><th style={{textAlign:'left',padding:'7px'}}>Status</th><th style={{textAlign:'left',padding:'7px'}}>Missing item</th></tr></thead><tbody>{recipeResults.map(r=>{const prod=productsRaw.find(p=>String(p.id)===r.productId);return <tr key={r.productId}><td style={{padding:'7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{String(prod?.product_name??r.productId)}</td><td style={{padding:'7px',textAlign:'right',borderTop:'1px solid rgba(23,23,23,.06)'}}>{r.cogs===null?'—':fmtFieldAmount(r.cogs)}</td><td style={{padding:'7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{r.status==='calculated'?'Calculated':'Insufficient data'}</td><td style={{padding:'7px',borderTop:'1px solid rgba(23,23,23,.06)'}}>{r.missingItemIds.length?r.missingItemIds.join(', '):'—'}</td></tr>})}</tbody></table></div></div>}
    {draft.clientId.trim()&&records.length>0&&<div className="trace-card" style={{display:'grid',gap:12}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><div className="trace-muted" style={{fontSize:12}}>FINANCIAL HEALTH · CLIENT SCOPED</div><strong style={{fontSize:18}}>Ringkasan Keuangan</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Revenue → COGS → Gross Profit → Labor → OPEX → Operating Profit. Angka berasal dari record tersimpan di Supabase.</div></div><span className="trace-badge">{periods.length} periode</span></div>{(()=>{const latest=periods.at(-1)||'';const r=records.filter(x=>x.period===latest);const sum=(cat:string)=>r.filter(x=>x.category===cat).reduce((a,x)=>a+x.amount,0);const rev=sum('revenue'),c=sum('cogs'),lab=sum('labor'),opx=sum('opex'),gp=rev-c,op=gp-lab-opx;const cards=[['Revenue',rev],['COGS',c],['Gross Profit',gp],['Labor',lab],['OPEX',opx],['Operating Profit',op]];return <><div style={{display:'grid',gridTemplateColumns:'repeat(6,minmax(0,1fr))',gap:8}}>{cards.map(([k,v])=><div key={String(k)} style={{padding:11,border:'1px solid rgba(23,23,23,.08)',borderRadius:10}}><div className="trace-muted" style={{fontSize:10}}>{k}</div><strong style={{display:'block',marginTop:5,fontSize:15}}>Rp {Number(v).toLocaleString('id-ID')}</strong></div>)}</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><div className="trace-card"><strong>Margin {latest}</strong><div className="trace-muted" style={{fontSize:12,marginTop:6}}>Gross Margin <b>{rev?((gp/rev)*100).toFixed(1):'0.0'}%</b> · Operating Margin <b>{rev?((op/rev)*100).toFixed(1):'0.0'}%</b></div></div><div className="trace-card"><strong>Periode terbaru</strong><div className="trace-muted" style={{fontSize:12,marginTop:6}}>{latest} · {r.length} record keuangan</div></div></div></>})()}</div>}

    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.4fr) minmax(280px,.6fr)',gap:16}}>
      <div className="trace-card"><div style={{display:'grid',gap:14}}>
        <div><strong>1 · Data dasar</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>{draft.id?'Mengedit record yang sudah tersimpan.':'Membuat record baru.'}</div></div>
        <label>Klien / Scope (wajib)<select value={draft.clientId} onChange={e=>setDraft({...draft,clientId:e.target.value})} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
        <label>Outlet (opsional)<input value={draft.outletId} onChange={e=>setDraft({...draft,outletId:e.target.value})} style={inputStyle}/></label>
        <label>Periode<input value={draft.period} onChange={e=>setDraft({...draft,period:e.target.value})} placeholder="YYYY-MM" style={inputStyle}/></label>
        <label>Kategori<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value as typeof draft.category})} style={inputStyle}><option value="revenue">Revenue</option><option value="cogs">COGS</option><option value="labor">Labor</option><option value="opex">OPEX</option></select></label>
        <label>Nama Akun (opsional, mis. "Penjualan Produk 1", "Beban Sewa")<input value={draft.accountLabel} onChange={e=>setDraft({...draft,accountLabel:e.target.value})} style={inputStyle}/></label>
        <label>Bagian Laporan Laba Rugi (opsional, untuk cetak Laba Rugi berjenjang)<select value={draft.statementSection} onChange={e=>setDraft({...draft,statementSection:e.target.value as FinanceDraft['statementSection']})} style={inputStyle}><option value="">— Belum dipilih —</option>{(Object.keys(STATEMENT_SECTION_LABEL) as FinanceStatementSection[]).map(k=><option key={k} value={k}>{STATEMENT_SECTION_LABEL[k]}</option>)}</select></label>
        <label>Nominal<input type="number" value={draft.amount} onChange={e=>setDraft({...draft,amount:e.target.value===''?'':Number(e.target.value)})} style={inputStyle}/></label>
        <label>Catatan evidence (opsional)<input value={draft.evidenceNote} onChange={e=>setDraft({...draft,evidenceNote:e.target.value})} placeholder="Sumber angka ini, mis. laporan kasir Agustus" style={inputStyle}/></label>
        <div style={{display:'flex',gap:8}}>
          <button onClick={save} disabled={!canSave} style={{border:0,borderRadius:9,padding:'10px 16px',background:canSave?'#171717':'#eee',color:canSave?'#fff':'#999',fontWeight:700,cursor:canSave?'pointer':'not-allowed'}}>{saving?'Menyimpan…':draft.id?'Update':'Simpan'}</button>
          {draft.id&&<button onClick={()=>setDraft({...EMPTY_FINANCE_DRAFT,clientId:draft.clientId})} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'10px 16px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Batal edit</button>}
        </div>
        {saveMessage&&<div className="trace-muted" style={{fontSize:12}}>{saveMessage}</div>}
      </div></div>
      <div className="trace-card" style={{alignSelf:'start'}}><div style={{display:'flex',gap:9,alignItems:'center'}}>{guidance.status==='ready'?<CircleCheck size={18}/>:<TriangleAlert size={18}/>}<strong>{guidance.title}</strong></div><p className="trace-muted" style={{fontSize:13,lineHeight:1.6}}>{guidance.message}</p>{issues.map(i=><div key={i.code} style={{padding:'10px 0',borderTop:'1px solid rgba(23,23,23,.08)'}}><strong style={{fontSize:12}}>{i.message}</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>{i.suggestion}</div></div>)}{!draft.clientId.trim()&&<div className="trace-muted" style={{fontSize:12,marginTop:8}}>Isi Klien/Scope untuk mengaktifkan tombol Simpan.</div>}</div>
    </div>

    <div className="trace-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <strong>Histori tersimpan{draft.clientId?` · ${draft.clientId}`:''}</strong>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <label className="trace-muted" style={{fontSize:12}}>Bandingkan dengan<select value={previousPeriod} onChange={e=>setPreviousPeriod(e.target.value)} style={{marginLeft:6,padding:'6px 8px',border:'1px solid #ddd',borderRadius:8}}><option value="">Otomatis ({autoPrevious||'—'})</option>{periods.filter(p=>p!==draft.period).map(p=><option key={p} value={p}>{p}</option>)}</select></label>
        </div>
      </div>
      {loading?<div className="trace-muted" style={{marginTop:12}}>Memuat…</div>:loadError?<div className="trace-muted" style={{marginTop:12}}>{loadError}</div>:clientRows.length===0?<div className="trace-muted" style={{marginTop:12}}>Belum ada record untuk klien/scope ini.</div>:
      <div style={{marginTop:12,display:'grid',gap:6}}>{clientRows.sort((a,b)=>String(b.period).localeCompare(String(a.period))).map(r=><div key={String(r.id)} onClick={()=>editRow(r)} style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:10,padding:'9px 0',borderTop:'1px solid rgba(23,23,23,.07)',fontSize:13,cursor:'pointer'}}><span>{String(r.period)}</span><span>{CATEGORY_LABEL_ID[String(r.category)]??String(r.category)}</span><strong>{fmtFieldAmount(r.amount)}</strong><ArrowRight size={14} className="trace-muted"/></div>)}</div>}
    </div>

    {draft.period&&comparison&&<div className="trace-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <strong>Laporan periode {draft.period}{effectivePrevious?` vs ${effectivePrevious}`:''}</strong>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>doExport('pdf')} disabled={!draft.clientId.trim()||exporting!==''} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}}>{exporting==='pdf'?'Membuat PDF…':'Download PDF'}</button>
          <button onClick={()=>doExport('xlsx')} disabled={!draft.clientId.trim()||exporting!==''} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}}>{exporting==='xlsx'?'Membuat Excel…':'Download Excel'}</button>
        </div>
      </div>
      <div style={{marginTop:12,display:'grid',gap:6}}>{comparison.metrics.map(m=><div key={m.metric} style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1fr 1fr',gap:10,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.07)',fontSize:13}}><span>{m.metric}</span><span>{m.current===null?'—':fmtFieldAmount(m.current)}</span><span className="trace-muted">{m.previous===null?'—':fmtFieldAmount(m.previous)}</span><span className="trace-muted">{m.changePct===null?'—':m.changePct.toFixed(1)+'%'}</span></div>)}</div>
      <div className="trace-muted" style={{fontSize:12,marginTop:10}}>Metrik dengan tanda "—" berarti data belum lengkap, TRACE tidak menganggapnya nol.</div>
    </div>}

    {statement&&<div className="trace-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <strong>Laba Rugi berjenjang · {draft.period}</strong>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>doExportStatement('pdf')} disabled={!draft.clientId.trim()||exportingStatement!==''} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}}>{exportingStatement==='pdf'?'Membuat PDF…':'Download PDF Laba Rugi'}</button>
          <button onClick={()=>doExportStatement('xlsx')} disabled={!draft.clientId.trim()||exportingStatement!==''} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}}>{exportingStatement==='xlsx'?'Membuat Excel…':'Download Excel Laba Rugi'}</button>
          <button onClick={doExportDashboard} disabled={!draft.clientId.trim()||!draft.period||exportingDashboard} title="Chart di file ini adalah gambar statis (PNG), bukan native Excel chart" style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}}>{exportingDashboard?'Membuat Dashboard…':'Download Dashboard Excel (chart gambar)'}</button>
        </div>
      </div>
      <div className="trace-muted" style={{fontSize:12,marginTop:8}}>Bagian ini butuh field "Bagian Laporan Laba Rugi" diisi per record. Record tanpa itu masuk ke "Belum diklasifikasi" dan tidak ikut dihitung ke Laba Bersih.</div>
      <div style={{marginTop:12,display:'grid',gap:5,fontSize:13}}>
        <div style={{display:'flex',justifyContent:'space-between'}}><span>Total Pendapatan</span><strong>{fmtFieldAmount(statement.pendapatanUsaha.total)}</strong></div>
        <div style={{display:'flex',justifyContent:'space-between'}}><span>Total Biaya Atas Pendapatan</span><span>{fmtFieldAmount(statement.totalBiayaAtasPendapatan)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(23,23,23,.1)',paddingTop:5}}><strong>Laba/Rugi Kotor</strong><strong>{fmtFieldAmount(statement.labaKotor)}</strong></div>
        <div style={{display:'flex',justifyContent:'space-between'}}><span>Total Pengeluaran Operasional</span><span>{fmtFieldAmount(statement.totalPengeluaranOperasional)}</span></div>
        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(23,23,23,.1)',paddingTop:5}}><strong>Laba/Rugi Operasi</strong><strong>{fmtFieldAmount(statement.labaOperasi)}</strong></div>
        <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(23,23,23,.1)',paddingTop:5}}><strong>Laba/Rugi Bersih</strong><strong>{fmtFieldAmount(statement.labaBersih)}</strong></div>
      </div>
      {statement.unclassified.length>0&&<div className="trace-muted" style={{fontSize:12,marginTop:10}}>{statement.unclassified.length} record belum diklasifikasi (total {fmtFieldAmount(statement.unclassified.reduce((s,u)=>s+u.amount,0))}) — buka record itu lewat histori di atas dan isi "Bagian Laporan".</div>}
    </div>}
  </div>
}
export const CATEGORY_LABEL_ID:Record<string,string>={revenue:'Revenue',cogs:'COGS',labor:'Labor',opex:'OPEX'};
