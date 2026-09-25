import React, { useEffect, useState } from 'react';
import { aggregateDelimitedRows, applyManualCompletion, buildIntakeResult, calculateAvailableFinance, detectSourceType, parseAmount, type IntakeResult } from '../../core/dataIntake';
import { parseWorkbook, parseDocx, parsePdf, parseText, parseImage } from '../../core/fileIntakeAdapters';
import { fetchWithTimeout } from '../../core/browserNetwork';
import { listRecoverySnapshots, saveRecoverySnapshot, type RecoverySnapshot } from '../../core/durableRecovery';
import { mapTabularRows, summarizeCanonicalImport, type CanonicalPOSEventInput } from '../../core/canonicalImport';
import { fmtFieldAmount, getReactSupabase, asArray, useTraceCollections, inputStyle } from './_shared';
import { TracePageHeader } from '../components/TraceUI';

export function DataIntake(){
  const [fileName,setFileName]=useState('');
  const [result,setResult]=useState<IntakeResult|null>(null);
  const [manual,setManual]=useState<Record<string,string>>({});
  const [reviewState,setReviewState]=useState<'draft'|'reviewed'|'approved'>('draft');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sourceHash,setSourceHash]=useState('');
  const [persistMessage,setPersistMessage]=useState('');
  const [recovered,setRecovered]=useState(false);
  const [organizationId,setOrganizationId]=useState('');
  const [manualMode,setManualMode]=useState(false);
  const [manualDraft,setManualDraft]=useState({businessName:'',outletName:'',period:'',revenue:'',cogs:'',labor:'',opex:''});
  const clientsLive=useTraceCollections(['trace-clients']);
  const intakeClients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const [canonicalRows,setCanonicalRows]=useState<CanonicalPOSEventInput[]>([]);
  const [canonicalMessage,setCanonicalMessage]=useState('');
  const [canonicalBusy,setCanonicalBusy]=useState(false);
  const recoveryId=()=>`data-intake:${sourceHash||fileName||'unknown'}`;
  useEffect(()=>{let alive=true;(async()=>{try{const rows=await listRecoverySnapshots<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>('data-intake');const latest=rows[0];if(alive&&latest?.data?.result){setFileName(latest.data.fileName||latest.sourceName||'');setSourceHash(latest.data.sourceHash||'');setResult(latest.data.result);setReviewState(latest.data.reviewState||'draft');setRecovered(true);setPersistMessage('Draft lokal berhasil dipulihkan. Verifikasi ledger production sebelum melanjutkan.');}}catch{}})();return()=>{alive=false};},[]);
  useEffect(()=>{if(!result||!sourceHash)return;const snapshot:RecoverySnapshot<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>={id:recoveryId(),kind:'data-intake',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceName:fileName,sourceHash,status:reviewState,data:{fileName,sourceHash,reviewState,result}};void (async()=>{try{const existing=(await listRecoverySnapshots<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>('data-intake')).find((x: RecoverySnapshot<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>)=>x.id===snapshot.id);if(existing)snapshot.createdAt=existing.createdAt;}catch{} await saveRecoverySnapshot(snapshot).catch(()=>{});})();},[result,sourceHash,fileName,reviewState]);
  const sha256=async(file:File)=>{const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');};
  const sha256Text=async(text:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');};
  const startManualEntry=async()=>{
    setManualMode(true); setError(''); setPersistMessage(''); setReviewState('draft'); setCanonicalRows([]);
    const name=manualDraft.businessName.trim();
    const target=name.toLowerCase();
    const match=target?intakeClients.find(c=>String(c.name??c.business_name??'').trim().toLowerCase()===target):undefined;
    if(match) setOrganizationId(String(match.id));
    const raw={businessName:name,outletName:manualDraft.outletName.trim(),period:manualDraft.period.trim(),revenue:parseAmount(manualDraft.revenue),cogs:parseAmount(manualDraft.cogs),labor:parseAmount(manualDraft.labor),opex:parseAmount(manualDraft.opex)};
    const manualResult=applyManualCompletion(buildIntakeResult({}),raw);
    const hash=await sha256Text(JSON.stringify({source:'TRACE_MANUAL_ENTRY_V1',clientId:organizationId.trim()||null,raw}));
    const manualName=`TRACE_MANUAL_ENTRY_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    setFileName(manualName); setSourceHash(hash); setResult(manualResult);
    const effectiveClientId=organizationId.trim()||String(match?.id??'');
    if(!organizationId.trim()&&effectiveClientId) setOrganizationId(effectiveClientId);
    setCanonicalMessage('Manual entry siap direview. Tidak ada file yang di-upload; provenance akan ditandai Manual.');
    try{await persistImport('draft',hash,manualResult,manualName);}catch(e){setPersistMessage(e instanceof Error?e.message:'Draft manual gagal disimpan.');}
  };
  const persistImport=async(status:'draft'|'reviewed'|'approved', hashOverride?:string, resultOverride?:IntakeResult, fileNameOverride?:string)=>{
    const effectiveHash=hashOverride||sourceHash;
    const effectiveResult=resultOverride||result;
    const effectiveFileName=fileNameOverride||fileName;
    if(!effectiveResult||!effectiveHash){setPersistMessage('Source belum siap untuk disimpan.');return false;}
    const supabase=getReactSupabase(); if(!supabase){setPersistMessage('Supabase React belum dikonfigurasi.');return false;}
    const {data:sessionData,error:sessionError}=await supabase.auth.getSession(); if(sessionError||!sessionData.session){setPersistMessage('Session Supabase tidak tersedia.');return false;}
    const payload={organizationId:organizationId.trim()||null,fields:effectiveResult.fields,coveragePct:effectiveResult.coveragePct,missingLabels:effectiveResult.missingLabels,warnings:effectiveResult.warnings,periodStart:effectiveResult.periodStart,periodEnd:effectiveResult.periodEnd,periodCount:effectiveResult.periodCount,periods:effectiveResult.periods,monthlyBreakdown:effectiveResult.monthlyBreakdown};
    const evidence=effectiveResult.fields.filter(f=>f.evidence).map(f=>({field:f.key,...(f.evidence||{})}));
    const r=await fetchWithTimeout('/api/data-intake-import',{method:'POST',headers:{Authorization:`Bearer ${sessionData.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({sourceHash:effectiveHash,sourceName:effectiveFileName,sourceType:detectSourceType(effectiveFileName),status,payload,evidence})},10000);
    const body=await r.json().catch(()=>({})); if(!r.ok) throw new Error(body.error||`Import HTTP ${r.status}`);
    setPersistMessage(`Import ${status} tersimpan di ledger production.`); return true;
  };
  const parseDelimited=(text:string, name:string)=>{
    const rows=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(r=>r.split(/\t|,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(v=>v.replace(/^\"|\"$/g,'').trim()));
    const headers=rows[0]??[]; const dataRows=rows.slice(1); const aggregate=aggregateDelimitedRows(headers,dataRows);
    const base=calculateAvailableFinance(buildIntakeResult(aggregate as unknown as Partial<Record<string, unknown>>));
    base.periodStart=aggregate.periodStart; base.periodEnd=aggregate.periodEnd; base.periodCount=aggregate.periodCount; base.periods=aggregate.periods; base.monthlyBreakdown=aggregate.monthlyBreakdown;
    base.fields.forEach(f=>{if(f.status==='available')f.evidence={sourceFile:name,sourceRow:2,rawValue:String(f.value??'')};});
    if(aggregate.rowCount>1) base.warnings.push(`CSV/TSV mempertahankan ${aggregate.rowCount} baris untuk canonical import; ringkasan finance di atas adalah agregasi lintas ${aggregate.periodCount||1} periode dan breakdown bulanan dipertahankan.`);
    return {result:base,rows:mapTabularRows(headers,dataRows,name,undefined,new Date(),sourceHash||name)};
  };
  const commitImportedFinance=async(clientId:string)=>{
    const supabase=getReactSupabase(); if(!supabase||!sourceHash) return '';
    const {data,error}=await supabase.rpc('trace_commit_intake_finance',{p_client_id:clientId.trim(),p_source_hash:sourceHash});
    if(error) throw error;
    const r=data as {periodCount?:number;inserted?:number;skipped?:number}|null;
    return `Finance ${r?.inserted??0} record dibuat dari ${r?.periodCount??0} periode (${r?.skipped??0} sudah ada).`;
  };

  const commitCanonical=async()=>{
    if(reviewState!=='approved'){setCanonicalMessage('Canonical import baru boleh dilakukan setelah import APPROVED.');return;}
    if(!organizationId.trim()){setCanonicalMessage('Isi Organization / Client ID terlebih dahulu.');return;}
    const summary=summarizeCanonicalImport(canonicalRows); if(!summary.valid){setCanonicalMessage('Tidak ada baris valid yang siap diimport.');return;}
    const supabase=getReactSupabase(); if(!supabase){setCanonicalMessage('Supabase React belum dikonfigurasi.');return;}
    setCanonicalBusy(true); setCanonicalMessage('Memvalidasi dan mengirim canonical rows ke server…');
    try{
      const sourceType=detectSourceType(fileName); const provider=sourceType==='xlsx'||sourceType==='xls'||sourceType==='ods'?'excel':sourceType;
      const validRows=canonicalRows.filter(r=>r.status==='VALID');
      const BATCH_SIZE=1000;
      let totals={insertedIngestion:0,insertedEvents:0,duplicates:0,rejected:0};
      for(let i=0;i<validRows.length;i+=BATCH_SIZE){
        const batch=validRows.slice(i,i+BATCH_SIZE);
        setCanonicalMessage(`Canonical import: batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(validRows.length/BATCH_SIZE)} (${batch.length} rows)…`);
        const {data,error}=await supabase.rpc('trace_commit_canonical_pos_import',{p_organization_id:organizationId.trim(),p_source_hash:sourceHash,p_source_name:fileName,p_provider:provider,p_rows:batch});
        if(error) throw error;
        const r=data as {insertedIngestion?:number;insertedEvents?:number;duplicates?:number;rejected?:number}|null;
        totals.insertedIngestion+=r?.insertedIngestion??0; totals.insertedEvents+=r?.insertedEvents??0; totals.duplicates+=r?.duplicates??0; totals.rejected+=r?.rejected??0;
      }
      setCanonicalMessage(`Canonical import selesai: ${totals.insertedEvents} event tersimpan, ${totals.insertedIngestion} provenance dibuat, ${totals.duplicates} duplikat dilewati, ${totals.rejected} row ditolak.`);
    }catch(e){setCanonicalMessage(e instanceof Error?e.message:'Canonical import gagal.');}finally{setCanonicalBusy(false)}
  };
  const onFile=async(e:React.ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0]; if(!file)return; setBusy(true);setError('');setPersistMessage('');setFileName(file.name);setResult(null);setManual({});setReviewState('draft');setSourceHash('');
    try{
      const type=detectSourceType(file.name);
      const computedHash=await sha256(file);
      setSourceHash(computedHash);
      let parsed:IntakeResult|null=null; let parsedCanonical:CanonicalPOSEventInput[]=[];
      if(type==='csv'||type==='tsv'){ const parsedDelimited=parseDelimited(await file.text(),file.name); parsed=parsedDelimited.result; parsedCanonical=parsedDelimited.rows; }
      else if(type==='xlsx'||type==='xls'||type==='ods'){ const workbook=await parseWorkbook(file,computedHash); parsed=workbook.result; parsedCanonical=workbook.tabularRows??[]; }
      else if(type==='docx') parsed=(await parseDocx(file)).result;
      else if(type==='pdf') parsed=(await parsePdf(file, msg=>setError(msg))).result;
      else if(type==='txt'||type==='json') parsed=(await parseText(file)).result;
      else if(type==='image') parsed=(await parseImage(file, msg=>setError(msg))).result;
      else { setError('Format file belum didukung. Gunakan PDF, Excel, Word, CSV, ODS, TXT, JSON, atau gambar.'); }
      if(parsed){
        setResult(parsed);
        setCanonicalRows(parsedCanonical);
        let effectiveClientId=organizationId.trim();
        if(!effectiveClientId && parsed.businessName.value){
          const target=String(parsed.businessName.value).trim().toLowerCase();
          const match=intakeClients.find(c=>String(c.name??c.business_name??'').trim().toLowerCase()===target);
          if(match){effectiveClientId=String(match.id);setOrganizationId(effectiveClientId);}
        }
        setCanonicalMessage(parsedCanonical.length?`${summarizeCanonicalImport(parsedCanonical).valid} row valid untuk canonical import.`:'Format ini menghasilkan ringkasan finance saja; canonical row import tersedia untuk CSV/Excel.');
        // Persist the immutable source as DRAFT first so the server can enforce
        // Draft → Reviewed → Approved instead of allowing a client-side skip.
        const payload={organizationId:effectiveClientId||null,fields:parsed.fields,coveragePct:parsed.coveragePct,missingLabels:parsed.missingLabels,warnings:parsed.warnings,periodStart:parsed.periodStart,periodEnd:parsed.periodEnd,periodCount:parsed.periodCount,periods:parsed.periods,monthlyBreakdown:parsed.monthlyBreakdown};
        const supabase=getReactSupabase();
        if(supabase){
          const {data:sd,error:se}=await supabase.auth.getSession();
          if(!se&&sd.session){
            const draftResponse=await fetchWithTimeout('/api/data-intake-import',{method:'POST',headers:{Authorization:`Bearer ${sd.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({sourceHash:computedHash,sourceName:file.name,sourceType:type,status:'draft',payload,evidence:parsed.fields.filter(f=>f.evidence).map(f=>({field:f.key,...(f.evidence||{})}))})},10000);
            if(!draftResponse.ok){const db=await draftResponse.json().catch(()=>({}));setPersistMessage(db.error||`Draft import HTTP ${draftResponse.status}`);}
            else setPersistMessage('Draft import tersimpan di ledger production.');
          }
        }
      }
    }catch(err){setError(err instanceof Error?err.message:'File tidak dapat diproses.');}finally{setBusy(false);}
  };
  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker="TRACE · DATA INTAKE OS" title="Upload data klien, biarkan TRACE memetakan." extra={recovered&&<div className="trace-recovery-banner">↻ Draft lokal dipulihkan otomatis · <button className="trace-link-button" onClick={()=>setRecovered(false)}>tutup</button></div>} description="TRACE mencari nama bisnis, outlet, periode, Revenue, COGS, Labor, dan OPEX meskipun urutan kolom berbeda. Data yang tidak ada tetap ditandai Missing." />
    <div className="trace-card" style={{display:'grid',gap:14}}><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>setManualMode(false)} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'9px 12px',background:!manualMode?'#171717':'#fff',color:!manualMode?'#fff':'#171717',fontWeight:700}}>Upload File</button><button onClick={()=>setManualMode(true)} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'9px 12px',background:manualMode?'#171717':'#fff',color:manualMode?'#fff':'#171717',fontWeight:700}}>Input Manual</button></div>{!manualMode?<label style={{display:'grid',gap:8,fontWeight:700}}>Upload file klien<input type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.docx,.ods,.txt,.json,.png,.jpg,.jpeg,.webp" onChange={onFile} style={{padding:14,border:'1px dashed rgba(23,23,23,.2)',borderRadius:12,background:'#fafaf8'}}/></label>:<div style={{display:'grid',gap:10}}><div className="trace-muted" style={{fontSize:12}}>Tidak punya file? Isi data langsung. Alurnya sama: Draft → Review → Approve → Finance production.</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}><label>Nama bisnis<input value={manualDraft.businessName} onChange={e=>setManualDraft(v=>({...v,businessName:e.target.value}))} style={inputStyle}/></label><label>Outlet<input value={manualDraft.outletName} onChange={e=>setManualDraft(v=>({...v,outletName:e.target.value}))} style={inputStyle}/></label><label>Periode<input value={manualDraft.period} onChange={e=>setManualDraft(v=>({...v,period:e.target.value}))} placeholder="YYYY-MM" style={inputStyle}/></label><label>Revenue<input value={manualDraft.revenue} onChange={e=>setManualDraft(v=>({...v,revenue:e.target.value}))} placeholder="Rp / angka" style={inputStyle}/></label><label>COGS<input value={manualDraft.cogs} onChange={e=>setManualDraft(v=>({...v,cogs:e.target.value}))} placeholder="Rp / angka" style={inputStyle}/></label><label>Labor<input value={manualDraft.labor} onChange={e=>setManualDraft(v=>({...v,labor:e.target.value}))} placeholder="Rp / angka" style={inputStyle}/></label><label>OPEX<input value={manualDraft.opex} onChange={e=>setManualDraft(v=>({...v,opex:e.target.value}))} placeholder="Rp / angka" style={inputStyle}/></label></div><button onClick={()=>void startManualEntry()} disabled={busy||!manualDraft.period.trim()} style={{border:0,borderRadius:9,padding:'10px 14px',background:manualDraft.period.trim()?'#171717':'#eee',color:manualDraft.period.trim()?'#fff':'#999',fontWeight:700,width:'fit-content'}}>Buat Draft Manual</button></div>}{fileName&&!manualMode&&<div className="trace-muted">{busy?'Memproses…':`File: ${fileName}`}</div>}{error&&<div style={{padding:12,borderRadius:10,background:'#fff7ed',border:'1px solid #fed7aa',fontSize:13}}><strong>Belum diimport</strong><div style={{marginTop:4}}>{error}</div></div>}</div>
    {result&&<><div className="trace-card" style={{display:'grid',gap:10}}><div><strong>Canonical POS Import</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>CSV/Excel diproses per baris, bukan hanya dijumlahkan. Provenance disimpan, row invalid ditolak, dan duplicate source record ID dilewati secara idempotent.</div></div><label style={{fontWeight:700,fontSize:13}}>Klien / Scope (wajib)<select value={organizationId} onChange={e=>setOrganizationId(e.target.value)} style={{...inputStyle,marginTop:6}}><option value="">Pilih klien</option>{intakeClients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select>{result.businessName.value&&organizationId&&(()=>{const c=intakeClients.find(x=>String(x.id)===organizationId);const name=String(c?.name??c?.business_name??'');const ok=name.trim().toLowerCase()===String(result.businessName.value).trim().toLowerCase();return <div className="trace-muted" style={{fontSize:11,marginTop:5}}>{ok?'✓ Nama bisnis file cocok dengan client scope.':`⚠ File: ${String(result.businessName.value)} · Client dipilih: ${name||organizationId}`}</div>})()}</label>{canonicalRows.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>{(()=>{const q=summarizeCanonicalImport(canonicalRows);return <><div className="trace-card"><b>{q.total}</b><div className="trace-muted">Rows</div></div><div className="trace-card"><b>{q.valid}</b><div className="trace-muted">Valid</div></div><div className="trace-card"><b>{q.invalid}</b><div className="trace-muted">Invalid</div></div><div className="trace-card"><b>{q.duplicate}</b><div className="trace-muted">Duplicate</div></div></>})()}</div>}{!organizationId.trim()&&<div className="trace-alert">Pilih Klien / Scope sebelum Review atau Commit. TRACE tidak menerima Client ID mentah.</div>}{canonicalRows.some(r=>r.status!=='VALID')&&<details><summary>Review row bermasalah</summary><div style={{display:'grid',gap:6,marginTop:8,maxHeight:260,overflow:'auto'}}>{canonicalRows.filter(r=>r.status!=='VALID').slice(0,100).map(r=><div key={`${r.sourceRecordId}-${r.sourceRow}`} style={{padding:9,border:'1px solid rgba(23,23,23,.08)',borderRadius:9,fontSize:12}}><b>Row {r.sourceRow} · {r.sourceRecordId}</b><div className="trace-muted">{r.issues.join(', ')}</div></div>)}</div></details>}<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button onClick={commitCanonical} disabled={canonicalBusy||reviewState!=='approved'||!canonicalRows.some(r=>r.status==='VALID')||!organizationId.trim()} className="trace-button">{canonicalBusy?'Mengimport…':'Commit canonical data'}</button><span className="trace-muted" style={{fontSize:12}}>{canonicalMessage}</span></div></div><div className="trace-kpis"><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>DATA COVERAGE</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{result.coveragePct}%</div><div className="trace-muted" style={{fontSize:12}}>Field utama terisi/terhitung · bukan skor kualitas dataset</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>BUSINESS</div><div style={{fontSize:20,fontWeight:750,marginTop:6}}>{result.businessName.value??'Tidak ditemukan'}</div><div className="trace-muted" style={{fontSize:12}}>Tidak ditebak oleh AI</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>PERIODE</div><div style={{fontSize:20,fontWeight:750,marginTop:6}}>{result.period.value??'Tidak ditemukan'}</div><div className="trace-muted" style={{fontSize:12}}>{result.periodCount>1?`${result.periodCount} periode terdeteksi · ${result.periodStart} → ${result.periodEnd}`:'Satu periode terdeteksi'}</div></div></div>{result.periodCount>1&&<div className="trace-card"><strong>Breakdown periode</strong><div className="trace-muted" style={{fontSize:12,marginTop:5}}>Total finance tetap mengikuti seluruh file, tetapi TRACE mempertahankan rincian per bulan agar tidak salah membaca 6 bulan sebagai 1 bulan.</div><div style={{overflowX:'auto',marginTop:10}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Periode','Revenue','COGS','Labor','OPEX','Operating Profit','Rows'].map(h=><th key={h} style={{textAlign:h==='Periode'?'left':'right',padding:'8px 6px',borderBottom:'1px solid rgba(23,23,23,.12)'}}>{h}</th>)}</tr></thead><tbody>{result.monthlyBreakdown.map(m=><tr key={m.period}>{[m.period,m.revenue,m.cogs,m.labor,m.opex,(m.revenue!==null&&m.cogs!==null&&m.labor!==null&&m.opex!==null)?m.revenue-m.cogs-m.labor-m.opex:null,m.rowCount].map((v,i)=><td key={i} style={{textAlign:i===0?'left':'right',padding:'7px 6px',borderBottom:'1px solid rgba(23,23,23,.06)'}}>{typeof v==='number'&&i>0&&i<6?v.toLocaleString('id-ID'):String(v??'—')}</td>)}</tr>)}</tbody></table></div></div>}
      <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><strong>Import Review</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Draft → Review → Approve. TRACE tidak mengubah angka yang ditemukan tanpa tindakan pengguna.</div></div><span style={{fontSize:11,fontWeight:800}}>{reviewState.toUpperCase()}</span></div><div style={{display:'grid',gap:8,marginTop:12}}>{result.fields.map(f=><div key={f.key} style={{display:'grid',gridTemplateColumns:'1.1fr .8fr .9fr 1fr',gap:10,padding:'10px 0',borderTop:'1px solid rgba(23,23,23,.07)',fontSize:13,alignItems:'center'}}><span>{f.label}</span><strong>{f.value===null?'—':typeof f.value==='number'?f.value.toLocaleString('id-ID'):String(f.value)}</strong><span className="trace-muted">{f.status==='available'?'Available':f.status==='calculated'?'Calculated':f.status==='missing'?'Missing':f.status}</span>{f.status==='missing'&&['businessName','outletName','period','revenue','cogs','labor','opex'].includes(f.key)?<input value={manual[f.key]??''} onChange={e=>setManual(v=>({...v,[f.key]:e.target.value}))} placeholder="Isi manual jika tersedia" style={{minWidth:0,padding:'7px 8px',border:'1px solid #ddd',borderRadius:8}}/>:<span className="trace-muted" style={{fontSize:11}}>{f.evidence?.sourceFile?'Source: '+f.evidence.sourceFile:'—'}</span>}</div>)}</div><div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}><button onClick={()=>{if(result){const manualValues: Partial<Record<'businessName'|'outletName'|'period'|'revenue'|'cogs'|'labor'|'opex',unknown>>={}; Object.entries(manual).forEach(([k,v])=>{ if(['businessName','outletName','period','revenue','cogs','labor','opex'].includes(k)){ manualValues[k as keyof typeof manualValues]=['revenue','cogs','labor','opex'].includes(k)?parseAmount(v):v; }}); setResult(applyManualCompletion(result,manualValues)); setReviewState('draft');}}} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 11px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Terapkan input manual</button><button onClick={async()=>{try{if(await persistImport('reviewed'))setReviewState('reviewed');}catch(e){setPersistMessage(e instanceof Error?e.message:'Import review gagal.');}}} disabled={!organizationId.trim()} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 11px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Tandai sudah direview</button><button onClick={async()=>{if(reviewState!=='reviewed')return;try{if(await persistImport('approved')){setReviewState('approved');const msg=organizationId.trim()?await commitImportedFinance(organizationId):'';setPersistMessage(msg?`Import APPROVED. ${msg}`:'Import APPROVED.');}}catch(e){setPersistMessage(e instanceof Error?e.message:'Approval import gagal.');}}} disabled={reviewState!=='reviewed'} style={{border:0,borderRadius:9,padding:'8px 11px',background:reviewState==='reviewed'?'#171717':'#eee',color:reviewState==='reviewed'?'#fff':'#777',fontWeight:700,cursor:reviewState==='reviewed'?'pointer':'not-allowed'}}>Approve import</button></div>{persistMessage&&<div className="trace-muted" style={{marginTop:9,fontSize:12}}>{persistMessage}</div>}{reviewState==='approved'&&<div className="trace-muted" style={{marginTop:9,fontSize:12}}>Ledger approval tersimpan. Finance per bulan dibuat dari payload Data Intake yang approved dan idempotent; canonical POS tetap menunggu Commit canonical data.</div>}</div>
      <div className="trace-card"><strong>TRACE Intelligence · Analisis awal</strong><p className="trace-muted" style={{lineHeight:1.6}}>Analisis boleh berjalan menggunakan data yang tersedia. TRACE tidak membuat angka yang tidak ditemukan. {result.missingLabels.length?`Data yang belum tersedia: ${result.missingLabels.join(', ')}.`:'Field utama tersedia.'}</p><div style={{padding:12,borderRadius:10,background:'#fafaf8',fontSize:13}}>Gross Profit: <strong>{fmtFieldAmount(result.fields.find(f=>f.key==='grossProfit')?.value)}</strong><br/>Operating Profit: <strong>{fmtFieldAmount(result.fields.find(f=>f.key==='operatingProfit')?.value)}</strong></div></div>
    </>}
  </div>
}


