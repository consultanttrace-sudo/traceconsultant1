import { useEffect, useState } from 'react';
import { Activity, Settings, ShieldCheck, RefreshCw, FileCode2, Database, Network, Gauge, TestTube2, PlugZap, Brain, LockKeyhole } from 'lucide-react';
import { summarizeDiagnostics, type DiagnosticFinding } from '../../core/aiDiagnostic';
import { createEmptyDiagnosticCenterSnapshot, collectBrowserTelemetry, sendDiagnosticTelemetry, type DiagnosticCenterSnapshot } from '../../core/diagnosticCenter';
import { buildRepairPlan, requestRepairApply, type DiagnosticRepairPlan } from '../../core/diagnosticRepair';
import { securityStatus, type SecurityFinding } from '../../core/aiSecurity';
import { buildEvolutionRecommendations, type EvolutionRecommendation } from '../../core/aiEvolution';
import { fetchWithTimeout } from '../../core/browserNetwork';
import { requiresApproval, deploymentDecision } from '../../core/aiMaintenance';
import { getReactSupabase } from './_shared';

export function SettingsCenter(){
  const [section,setSection]=useState<'diagnostic'|'chat'|'security'|'evolution'|'general'>('chat');
  const [chatMessages,setChatMessages]=useState<Array<{role:'user'|'assistant';content:string}>>([{role:'assistant',content:'Halo. Saya TRACE AI. Fokus utama saya software engineering: coding, debugging, architecture, security, Supabase/RLS, Netlify, performance, persistence, dan testing. Saya tidak mengarang evidence dan tidak mengubah production tanpa approval.'}]);
  const [chatInput,setChatInput]=useState(''); const [chatBusy,setChatBusy]=useState(false); const [pendingDeployApproval,setPendingDeployApproval]=useState<string|null>(null);
  const [securityFindings,setSecurityFindings]=useState<SecurityFinding[]>([]); const [evolutionRecommendations,setEvolutionRecommendations]=useState<EvolutionRecommendation[]>([]);
  const [snapshot,setSnapshot]=useState<DiagnosticCenterSnapshot>(()=>createEmptyDiagnosticCenterSnapshot());
  const [scanning,setScanning]=useState(false);
  const [error,setError]=useState('');
  const [repairPlans,setRepairPlans]=useState<Record<string,DiagnosticRepairPlan>>({});
  const [repairApprovals,setRepairApprovals]=useState<Record<string,string>>({});
  const [repairBusy,setRepairBusy]=useState<string|null>(null);
  const [repairMessage,setRepairMessage]=useState('');
  const [aiAutoAnalysis,setAiAutoAnalysis]=useState('');
  const [aiAnalysisBusy,setAiAnalysisBusy]=useState(false);
  const [lastAnalysisFingerprint,setLastAnalysisFingerprint]=useState('');
  const sendChat=async()=>{const text=chatInput.trim();if(!text||chatBusy)return;const next=[...chatMessages,{role:'user' as const,content:text}];setChatMessages(next);setChatInput('');setChatBusy(true);try{const token=await getToken();if(!token)throw new Error('Session Supabase tidak tersedia.');const affirmative=/^(ya|yaa|iya|yes|setuju|deploy|gas deploy|lanjut deploy|ya deploy)\s*$/i.test(text);if(pendingDeployApproval&&affirmative){const r=await fetchWithTimeout('/api/ai-deploy',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',approvalId:pendingDeployApproval,confirm:true})},15000);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Deploy HTTP ${r.status}`);setPendingDeployApproval(null);setChatMessages(v=>[...v,{role:'assistant',content:p.message||'Deployment production telah dipicu setelah konfirmasi kamu.'}]);return;}const r=await fetchWithTimeout('/api/ai-chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messages:next})},30000);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`AI chat HTTP ${r.status}`);const d=p.provider||{};const answer=d.choices?.[0]?.message?.content||d.output||d.message||'AI provider tidak mengembalikan jawaban yang dapat dibaca.';let finalAnswer=String(answer);const deploymentIntent=/^(?:please\s+)?(?:deploy|rilis|publish)(?:\s+(?:ke|to)\s+)?(?:production)?(?:\s+now)?[.!\s]*$/i.test(text);if(deploymentIntent){const pr=await fetchWithTimeout('/api/ai-deploy',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'request',reason:text})},10000);const pp=await pr.json().catch(()=>({}));if(pr.ok&&pp.approvalId){setPendingDeployApproval(pp.approvalId);finalAnswer+=`\n\n⚠️ Production deployment belum dijalankan. Konfirmasi eksplisit diperlukan. Jika kamu setuju, jawab: YA DEPLOY.`;}}setChatMessages(v=>[...v,{role:'assistant',content:finalAnswer}]);}catch(e){setChatMessages(v=>[...v,{role:'assistant',content:`AI belum tersedia: ${e instanceof Error?e.message:'unknown error'}. Tidak ada perubahan production yang dilakukan.`}]);}finally{setChatBusy(false)}};
  const [securityBusy,setSecurityBusy]=useState(false);
  const runSecurityScan=async()=>{setSecurityBusy(true);try{const token=await getToken();if(!token)throw new Error('Session Supabase tidak tersedia.');const r=await fetchWithTimeout('/api/security-scan',{method:'POST',headers:{Authorization:`Bearer ${token}`}},15000);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Security scan HTTP ${r.status}`);setSecurityFindings(Array.isArray(p.findings)?p.findings:[]);}catch(e){setRepairMessage(e instanceof Error?e.message:'Security scan gagal.');}finally{setSecurityBusy(false);}};
  const runEvolution=()=>{setEvolutionRecommendations(buildEvolutionRecommendations((window as any).__traceUsageSignals||[]));};
  const getToken=async()=>{const supa=getReactSupabase();if(!supa)return null;const session=await supa.auth.getSession();if(session.error)throw session.error;return session.data.session?.access_token??null;};
  const sendTelemetry=async()=>{
    const telemetry=collectBrowserTelemetry();
    const events=[
      ...telemetry.runtimeErrors.map(e=>({kind:'runtime' as const,event:e as unknown as Record<string, unknown>})),
      ...telemetry.performance.map(e=>({kind:'performance' as const,event:e as unknown as Record<string, unknown>})),
      ...telemetry.performance.filter(e=>/^https?:\/\//i.test(e.name)).map(e=>({kind:'network' as const,event:{name:e.name,durationMs:e.durationMs,timestamp:e.timestamp} as Record<string, unknown>})),
    ].slice(-100);
    if(!events.length) return;
    const token=await getToken(); if(!token) return;
    await sendDiagnosticTelemetry(events, '/api/diagnostic-telemetry', token);
  };
  const runScan=async()=>{
    setScanning(true);setError('');
    try{
      startTelemetryOnce();
      await sendTelemetry();
      const token=await getToken();
      if(!token) throw new Error('Session Supabase tidak tersedia; live diagnostic server belum dapat diakses.');
      const response=await fetchWithTimeout('/api/diagnostic-run',{method:'POST',headers:{Authorization:`Bearer ${token}`} },20000);
      const payload=await response.json();
      if(!response.ok) throw new Error(payload.error||`Diagnostic server returned ${response.status}`);
      const base=createEmptyDiagnosticCenterSnapshot(payload.generatedAt);
      const telemetry=payload.telemetry||collectBrowserTelemetry();
      const findings=Array.isArray(payload.findings)?payload.findings:[];
      const now=new Date().toISOString();
      const sources=base.sources.map(source=>{
        const serverSource=payload.sources?.[source.id];
        if(serverSource) return {...source,status:serverSource.status,detail:serverSource.status==='connected'?`Evidence: ${serverSource.evidenceCount}`:source.detail,evidenceCount:serverSource.evidenceCount,lastCheckedAt:now};
        if(source.id==='source') return {...source,status:payload.fileCount>0?'connected':'blocked',detail:`Server-side manifest: ${payload.fileCount??0} file`,evidenceCount:payload.fileCount??0,lastCheckedAt:now};
        if(source.id==='runtime') return {...source,evidenceCount:telemetry.runtimeErrors?.length??0,lastCheckedAt:now};
        if(source.id==='performance'||source.id==='network') return {...source,evidenceCount:telemetry.performance?.length??0,lastCheckedAt:now};
        return source;
      });
      setSnapshot({...base,generatedAt:payload.generatedAt||now,sources,findings,telemetry});
      const fingerprint=findings.map((f:any)=>`${f.id}:${f.status}:${f.severity}`).sort().join('|');
      if(fingerprint&&fingerprint!==lastAnalysisFingerprint){
        setLastAnalysisFingerprint(fingerprint);setAiAnalysisBusy(true);
        try{
          const aiToken=token;
          const prompt=`Analisa finding TRACE berikut sebagai incident analyst. Jangan mengarang evidence. Kelompokkan root cause yang benar-benar didukung, pisahkan confirmed vs suspected vs blocked, tentukan prioritas P0/P1/P2, jelaskan dampak ke data/workflow, dan berikan urutan tindakan aman. Findings JSON: ${JSON.stringify(findings).slice(0,18000)}`;
          const ar=await fetchWithTimeout('/api/ai-chat',{method:'POST',headers:{Authorization:`Bearer ${aiToken}`,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:prompt}]} )},30000);
          const ap=await ar.json().catch(()=>({}));
          if(ar.ok){const ad=ap.provider||{};setAiAutoAnalysis(String(ad.choices?.[0]?.message?.content||ad.output||ad.message||'AI tidak mengembalikan analisis.'));}
        }catch{setAiAutoAnalysis('AI analysis belum tersedia. Finding tetap tersimpan sebagai evidence dan tidak diubah menjadi PASS.');}
        finally{setAiAnalysisBusy(false);}
      }
    }catch(e){setError(e instanceof Error?e.message:'Diagnostic scan gagal.');}
    finally{setScanning(false);}
  };
  const summary=summarizeDiagnostics(snapshot.findings);
  const createPlan=(finding:DiagnosticFinding)=>{ const plan=buildRepairPlan(finding); setRepairPlans(prev=>({...prev,[finding.id]:plan})); setRepairMessage(''); };
  const approvePlan=async(plan:DiagnosticRepairPlan)=>{
    setRepairBusy(plan.id);setRepairMessage('');
    try{
      const token=await getToken();if(!token)throw new Error('Session Supabase tidak tersedia.');
      const r=await fetchWithTimeout('/api/diagnostic-repair',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'approve',approved:true,reason:'Leader approved diagnostic repair proposal',plan})},10000);
      const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Approval HTTP ${r.status}`);
      if(!p.approvalId)throw new Error('Server tidak mengembalikan approvalId; apply diblokir.');
      setRepairApprovals(v=>({...v,[plan.id]:String(p.approvalId)}));
      setRepairMessage(p.executable?`Proposal disetujui. Patch executable siap untuk dibuatkan GitHub Pull Request.`:`Proposal disetujui, tetapi belum memiliki executable source patch. Tidak ada source yang diubah.`);
    }catch(e){setRepairMessage(e instanceof Error?e.message:'Approval repair gagal.');}finally{setRepairBusy(null);}
  };
  const applyPlan=async(plan:DiagnosticRepairPlan)=>{
    const approvalId=repairApprovals[plan.id];
    if(!approvalId){setRepairMessage('Approve proposal terlebih dahulu.');return;}
    if(!plan.patch?.files?.length){setRepairMessage('Repair plan ini belum memiliki executable source patch. Tidak ada source yang diubah.');return;}
    setRepairBusy(plan.id);setRepairMessage('Membuat GitHub Pull Request…');
    try {
      const token=await getToken();
      const result=await requestRepairApply({findingId:plan.findingId,plan,approved:true,approvalId},'/api/diagnostic-repair',token||undefined);
      const pr=result.payload?.pullRequest;
      setRepairMessage(result.status==='pull_request_created'&&pr?.url?`GitHub Pull Request #${pr.number} dibuat. Review manusia tetap diperlukan.`:(result.reason||`Apply belum berhasil: ${result.status}`));
    } finally { setRepairBusy(null); }
  };
  const iconFor=(id:string)=>({source:FileCode2,dependencies:PlugZap,supabase:Database,network:Network,runtime:Activity,performance:Gauge,data:Brain,jobs:RefreshCw,tests:TestTube2,ide:LockKeyhole}[id]??ShieldCheck);
  useEffect(()=>{
    startTelemetryOnce();
    let timer:number|undefined;
    const kickoff=window.setTimeout(()=>{void runScan();},900);
    timer=window.setInterval(()=>{void runScan();},5*60*1000);
    return()=>{window.clearTimeout(kickoff);if(timer)window.clearInterval(timer);};
  },[]);
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26,background:'linear-gradient(135deg,#171717,#303030)',color:'#fff'}}>
      <div style={{fontSize:12,opacity:.7}}>TRACE · SETTINGS · SYSTEM INTELLIGENCE</div>
      <h1 style={{margin:'8px 0 5px',fontSize:30}}>AI Diagnostic Center</h1>
      <div style={{opacity:.76,maxWidth:850,lineHeight:1.6}}>Dokter internal TRACE untuk mencari error, data hilang, file gagal dibaca, dependency, network, database, job, dan performa. Diagnosis evidence-first dan <strong>read-only</strong>.</div>
      <div style={{display:'flex',gap:10,marginTop:18,flexWrap:'wrap'}}><button onClick={runScan} disabled={scanning} style={{border:0,borderRadius:10,padding:'10px 14px',fontWeight:750,cursor:'pointer'}}>{scanning?'Scanning…':'Run full diagnostic'}</button><span style={{padding:'9px 12px',border:'1px solid rgba(255,255,255,.18)',borderRadius:10,fontSize:12}}>Last scan: {snapshot.generatedAt}</span></div>
      {error&&<div style={{marginTop:12,padding:'8px 10px',borderRadius:9,background:'rgba(255,180,100,.12)',border:'1px solid rgba(255,200,120,.22)',fontSize:12,display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><span>Diagnostic belum selesai.</span><details><summary style={{cursor:'pointer',fontWeight:700}}>Lihat detail</summary><div style={{marginTop:7,maxWidth:760,lineHeight:1.5}}>{error}</div></details></div>}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'220px minmax(0,1fr)',gap:16}}>
      <div className="trace-card" style={{alignSelf:'start',display:'grid',gap:5}}>{([['chat','AI Engineer Chat',Brain],['diagnostic','AI Diagnostic Center',Brain],['security','Security Guard',LockKeyhole],['evolution','Evolution Advisor',RefreshCw],['general','General Settings',Settings]] as const).map(([id,label,Icon])=><button key={id} onClick={()=>setSection(id)} data-active={section===id} style={{textAlign:'left',border:0,borderRadius:9,padding:'11px 12px',background:section===id?'#f1f1ee':'transparent',fontWeight:section===id?750:500,cursor:'pointer'}}><Icon size={16} style={{verticalAlign:'-3px',marginRight:8}}/>{label}</button>)}</div>
      {section==='chat'?<div style={{display:'grid',gap:12}}><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>TRACE AI · ENGINEERING BRAIN</div><h2 style={{margin:'6px 0'}}>Ngobrol dengan AI engineer TRACE</h2><div className="trace-muted">Coding, debugging, architecture, security, Supabase/RLS, Netlify, performance, persistence, testing, dan evolution.</div></div><div className="trace-card" style={{display:'grid',gap:10}}><div style={{display:'grid',gap:9,maxHeight:420,overflow:'auto'}}>{chatMessages.map((m,i)=><div key={i} style={{padding:12,borderRadius:12,background:m.role==='user'?'#171717':'#fafaf8',color:m.role==='user'?'#fff':'inherit',justifySelf:m.role==='user'?'end':'start',maxWidth:'88%',lineHeight:1.55,fontSize:13,whiteSpace:'pre-wrap'}}>{m.content}</div>)}</div><div style={{display:'flex',gap:8}}><textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}}} placeholder="Contoh: kenapa Acquisition timeout?" style={{flex:1,minHeight:72,padding:11,border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit'}}/><button onClick={sendChat} disabled={chatBusy||!chatInput.trim()} style={{border:0,borderRadius:10,padding:'0 16px',background:'#171717',color:'#fff',fontWeight:750}}>{chatBusy?'Thinking…':'Kirim'}</button></div></div><div className="trace-card"><strong>Approval gate</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>AI boleh menganalisis dan membuat proposal. Apply patch, commit, push, merge, migration, dan deploy tetap membutuhkan approval eksplisit. Deployment production dapat dijalankan AI hanya setelah kamu menjawab YA DEPLOY.</div><div style={{marginTop:10,display:'flex',gap:8,alignItems:'center',fontSize:11}}><span className="trace-badge" data-tone={requiresApproval('deploy','production')?'warning':'neutral'}>{requiresApproval('deploy','production')?'DEPLOY · APPROVAL REQUIRED':'DEPLOY · NO APPROVAL NEEDED'}</span><span className="trace-muted">{deploymentDecision(pendingDeployApproval?{id:pendingDeployApproval,action:'deploy',environment:'production',approvedBy:null,approvedAt:null,expiresAt:null}:null).reason}</span></div></div></div>:section==='security'?<div style={{display:'grid',gap:12}}><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>TRACE AI · SECURITY GUARD</div><h2 style={{margin:'6px 0'}}>AI ikut menjaga keamanan data TRACE</h2><div className="trace-muted">Mendeteksi indikasi secret exposure, privileged credential, unsafe storage, CORS, dan authentication abuse. Ini lapisan deteksi; keamanan tetap bergantung pada RLS, Auth, secrets management, network controls, dan monitoring.</div><button onClick={()=>void runSecurityScan()} disabled={securityBusy} style={{marginTop:12,border:0,borderRadius:9,padding:'9px 12px',background:'#171717',color:'#fff',fontWeight:750}}>Jalankan security scan</button></div><div className="trace-card"><strong>Status: {securityStatus(securityFindings)}</strong>{securityFindings.map(f=><div key={f.id} style={{padding:10,borderTop:'1px solid rgba(23,23,23,.08)',marginTop:8}}><b>{f.severity.toUpperCase()} · {f.title}</b><div style={{fontSize:12,marginTop:4}}>{f.cause}</div><div className="trace-muted" style={{fontSize:12,marginTop:4}}>{f.recommendation}</div></div>)}</div></div>:section==='evolution'?<div style={{display:'grid',gap:12}}><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>TRACE AI · EVOLUTION ADVISOR</div><h2 style={{margin:'6px 0'}}>AI memberi saran update berdasarkan penggunaan</h2><div className="trace-muted">Prioritas berasal dari failure, completion, missing-data, dan performance signals nyata.</div><button onClick={runEvolution} style={{marginTop:12,border:0,borderRadius:9,padding:'9px 12px',background:'#171717',color:'#fff',fontWeight:750}}>Analisis kebutuhan update</button></div><div className="trace-card">{evolutionRecommendations.length?evolutionRecommendations.map(r=><div key={r.id} style={{padding:11,borderTop:'1px solid rgba(23,23,23,.08)'}}><b>{r.priority} · {r.title}</b><div style={{fontSize:12,marginTop:4}}>{r.rationale}</div><div className="trace-muted" style={{fontSize:12,marginTop:4}}>{r.evidence.join(' · ')} · Approval required</div></div>):<div className="trace-muted">Belum ada usage signals yang cukup. AI tidak akan mengarang rekomendasi dari data yang belum ada.</div>}</div></div>:section==='general'?<div className="trace-card"><strong>System Settings</strong><p className="trace-muted" style={{lineHeight:1.6}}>Diagnostic Center tetap read-only. Production deploy tersedia melalui approval gate: AI meminta konfirmasi, lalu hanya menjalankan deploy setelah kamu menjawab YA DEPLOY.</p><div style={{padding:14,border:'1px solid rgba(23,23,23,.08)',borderRadius:12}}><b>AI safety mode</b><div className="trace-muted" style={{fontSize:13,marginTop:4}}>READ-ONLY · ON</div></div></div>:<div style={{display:'grid',gap:16}}>
        <div className="trace-kpis"><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>FINDINGS</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{summary.total}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>CRITICAL / HIGH</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{summary.counts.critical+summary.counts.high}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>RELEASE</div><div style={{fontSize:20,fontWeight:800,marginTop:8}}>{summary.releaseBlocked?'BLOCKED':'NOT BLOCKED'}</div></div></div>
        <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><strong>Diagnostic sources</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Status unavailable/blocked tidak dianggap sehat.</div></div><span style={{fontSize:12,fontWeight:700}}>READ-ONLY</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10,marginTop:14}}>{snapshot.sources.map(source=>{const Icon=iconFor(source.id);return <div key={source.id} style={{padding:13,border:'1px solid rgba(23,23,23,.08)',borderRadius:12}}><div style={{display:'flex',gap:8,alignItems:'center'}}><Icon size={17}/><strong style={{fontSize:13}}>{source.label}</strong><span style={{marginLeft:'auto',fontSize:10,fontWeight:800}}>{source.status.toUpperCase()}</span></div><div className="trace-muted" style={{fontSize:12,lineHeight:1.5,marginTop:7}}>{source.detail}</div><div style={{fontSize:11,marginTop:7}}>Evidence: <b>{source.evidenceCount}</b></div></div>})}</div></div>
        <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div><strong>AI diagnosis & repair</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Diagnosis tetap diam. Perbaikan hanya dibuat sebagai proposal dan tidak mengubah source tanpa persetujuan.</div></div><span style={{fontSize:11,fontWeight:800}}>SAFE MODE</span></div>{snapshot.findings.length===0?<div className="trace-muted" style={{marginTop:8,lineHeight:1.6}}>Belum ada finding. Jalankan full diagnostic untuk menggabungkan static source scan + telemetry nyata.</div>:<div style={{display:'grid',gap:8,marginTop:12}}>{snapshot.findings.map(f=>{const plan=repairPlans[f.id];return <details key={f.id} style={{padding:12,border:'1px solid rgba(23,23,23,.08)',borderRadius:12}}><summary style={{cursor:'pointer',fontWeight:750,display:'flex',justifyContent:'space-between',gap:10}}><span>{f.title}</span><span className="trace-muted" style={{fontSize:11}}>{f.severity.toUpperCase()} · {f.status.toUpperCase()}</span></summary><div style={{fontSize:13,marginTop:9}}><b>Penyebab:</b> {f.cause}</div><div style={{fontSize:13,marginTop:5}}><b>Dampak:</b> {f.impact}</div><div style={{fontSize:13,marginTop:5}}><b>Solusi:</b> {f.solution}</div>{f.evidence.map((e,i)=><div key={i} className="trace-muted" style={{fontSize:12,marginTop:7}}><b>{e.file}{e.line?`:${e.line}`:''}</b> — {e.reason}{e.code?` · ${e.code}`:''}</div>)}<div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><button onClick={()=>createPlan(f)} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 10px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Buat repair plan</button>{plan&&<><button onClick={()=>void approvePlan(plan)} disabled={repairBusy===plan.id} style={{border:0,borderRadius:9,padding:'8px 10px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>{repairBusy===plan.id?'Processing…':'Approve repair'}</button>{repairApprovals[plan.id]&&plan.patch?.files?.length&&<button onClick={()=>void applyPlan(plan)} disabled={repairBusy===plan.id} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 10px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Create GitHub PR</button>}</>}</div>{plan&&<div style={{marginTop:12,padding:12,borderRadius:10,background:'#fafaf8'}}><b>{plan.title}</b><div className="trace-muted" style={{fontSize:12,marginTop:5}}>{plan.reason}</div><div style={{display:'grid',gap:7,marginTop:8}}>{plan.steps.map((step,i)=><div key={i} style={{fontSize:12}}><b>{i+1}. {step.title}</b>{step.file&&<span className="trace-muted"> · {step.file}{step.line?`:${step.line}`:''}</span>}<div className="trace-muted" style={{marginTop:2}}>{step.detail}</div></div>)}</div></div>}</details>})}</div>}{repairMessage&&<div className="trace-muted" style={{marginTop:10,fontSize:12}}>{repairMessage}</div>}</div>
        <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div><strong>AI incident analysis</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Setiap fingerprint finding baru dianalisis otomatis. AI hanya menjelaskan evidence; AI tidak mengubah status test atau production.</div></div><span style={{fontSize:11,fontWeight:800}}>{aiAnalysisBusy?'ANALYZING':'EVIDENCE-FIRST'}</span></div>{aiAutoAnalysis?<div style={{marginTop:12,whiteSpace:'pre-wrap',lineHeight:1.65,fontSize:13}}>{aiAutoAnalysis}</div>:<div className="trace-muted" style={{marginTop:10}}>Belum ada incident baru yang membutuhkan analisis AI.</div>}</div>
        <div className="trace-card"><strong>Telemetry snapshot</strong><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginTop:12}}><div><div className="trace-muted" style={{fontSize:11}}>Runtime errors</div><b>{snapshot.telemetry.runtimeErrors.length}</b></div><div><div className="trace-muted" style={{fontSize:11}}>Slow resources</div><b>{snapshot.telemetry.networkSlowCount}</b></div><div><div className="trace-muted" style={{fontSize:11}}>Performance evidence</div><b>{snapshot.telemetry.performance.length}</b></div></div></div>
      </div>}
    </div>
  </div>
}

export function startTelemetryOnce(){
  if(!(window as any).__traceDiagnosticTelemetryStarted) {
    (window as any).__traceDiagnosticTelemetryStarted=true;
    const cleanup=collectBrowserTelemetry();
    void cleanup;
  }
}
