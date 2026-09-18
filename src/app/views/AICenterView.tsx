import { useEffect, useMemo, useState } from 'react';
import { Brain, ShieldCheck, Code2, RefreshCw, ExternalLink, CircleCheck, CircleAlert } from 'lucide-react';
import { fetchWithTimeout } from '../../core/browserNetwork';
import { getReactSupabase } from './_shared';

type Mode='business_advisor'|'engineering'|'guardian';
type Message={role:'user'|'assistant';content:string};

function extractAnswer(payload:any){return String(payload?.answer||payload?.provider?.choices?.[0]?.message?.content||payload?.provider?.output||payload?.provider?.message||'AI tidak mengembalikan jawaban yang dapat dibaca.');}

export function AICenterView(){
  const [mode,setMode]=useState<Mode>('business_advisor');
  const [messages,setMessages]=useState<Message[]>([{role:'assistant',content:'Saya siap membantu analisis bisnis TRACE. Masukkan evidence yang tersedia. Saya akan memisahkan fakta, hipotesis, data yang kurang, perhitungan, dan tindakan yang bisa diukur.'}]);
  const [input,setInput]=useState('');
  const [business,setBusiness]=useState({name:'',period:'',evidence:'',question:''});
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState<{configured:boolean;provider:string;model:string|null;configurationError:string|null}|null>(null);
  const [statusBusy,setStatusBusy]=useState(true);
  const [usage,setUsage]=useState({requests:0,success:0,errors:0,quota:0,lastCode:'—',lastAt:'—'});
  const supabase=useMemo(()=>getReactSupabase(),[]);

  const getToken=async()=>{if(!supabase)return null;const s=await supabase.auth.getSession();if(s.error)throw s.error;return s.data.session?.access_token??null;};
  const checkStatus=async()=>{setStatusBusy(true);try{const token=await getToken();if(!token)return;const r=await fetchWithTimeout('/api/ai-chat',{headers:{Authorization:`Bearer ${token}`}},10000);const p=await r.json().catch(()=>({}));setStatus(p);}catch{setStatus(null)}finally{setStatusBusy(false)}};
  useEffect(()=>{void checkStatus()},[]);

  const send=async()=>{
    const text=input.trim();if(!text||busy)return;
    const enriched=mode==='business_advisor'
      ? `BUSINESS CONTEXT\nBusiness: ${business.name||'Tidak disebutkan'}\nPeriod: ${business.period||'Tidak disebutkan'}\nEvidence/data: ${business.evidence||'Tidak ada'}\nQuestion: ${business.question||text}\n\nUSER REQUEST\n${text}`
      : text;
    const next=[...messages,{role:'user' as const,content:enriched}];setMessages(next);setInput('');setBusy(true);
    try{
      const token=await getToken();if(!token)throw new Error('Session Supabase tidak tersedia.');
      const r=await fetchWithTimeout('/api/ai-chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({mode,messages:next})},30000);
      const p=await r.json().catch(()=>({}));
      setUsage(v=>({requests:v.requests+1,success:r.ok?v.success+1:v.success,errors:r.ok?v.errors:v.errors+1,quota:r.status===429?v.quota+1:v.quota,lastCode:String(r.status),lastAt:new Date().toLocaleTimeString()}));
      if(!r.ok)throw new Error(p.error||`AI HTTP ${r.status}`);
      setMessages(v=>[...v,{role:'assistant',content:extractAnswer(p)}]);
    }catch(e){setMessages(v=>[...v,{role:'assistant',content:`AI belum dapat digunakan: ${e instanceof Error?e.message:'unknown error'}. Tidak ada data atau production state yang diubah.`}]);}
    finally{setBusy(false)}
  };

  const reset=()=>setMessages([{role:'assistant',content:mode==='business_advisor'?'Saya siap membantu analisis bisnis TRACE. Masukkan evidence yang tersedia. Saya akan memisahkan fakta, hipotesis, data yang kurang, perhitungan, dan tindakan yang bisa diukur.':mode==='guardian'?'Saya siap menganalisis incident berdasarkan evidence teknis yang kamu berikan. Saya tidak akan mengarang log atau menyatakan sistem sehat tanpa evidence.':'Saya siap membantu coding, debugging, architecture, security, Supabase/RLS, Netlify, performance dan testing.'}]);
  const changeMode=(m:Mode)=>{setMode(m);reset()};

  return <div className="trace-ai-center" style={{display:'grid',gap:16}}>
    <style>{`@media (max-width: 760px){.trace-ai-layout{grid-template-columns:minmax(0,1fr)!important}.trace-ai-business{grid-template-columns:minmax(0,1fr)!important}.trace-ai-hero h1{font-size:23px!important}.trace-ai-send{flex-direction:column}.trace-ai-send button{min-height:44px}}`}</style>
    <div className="trace-card" style={{padding:24,background:'linear-gradient(135deg,#171717,#303030)',color:'#fff'}}>
      <div style={{display:'flex',gap:12,alignItems:'center'}}><div style={{width:42,height:42,borderRadius:13,display:'grid',placeItems:'center',background:'rgba(255,255,255,.12)'}}><Brain size={22}/></div><div><div style={{fontSize:12,opacity:.7}}>TRACE AI CENTER</div><h1 style={{margin:'4px 0 0',fontSize:28}}>Business Advisor + Guardian</h1></div></div>
      <div style={{marginTop:10,maxWidth:780,opacity:.78,lineHeight:1.55}}>Dua fungsi AI yang bisa langsung dipakai dari aplikasi. Business Advisor membaca evidence bisnis; Guardian/Engineer menangani reliability aplikasi. Semua jawaban tetap evidence-first dan tidak melakukan perubahan production otomatis.</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}>
        {([['business_advisor','Business Advisor',Brain],['guardian','TRACE Guardian',ShieldCheck],['engineering','AI Engineer',Code2]] as const).map(([id,label,Icon])=><button key={id} onClick={()=>changeMode(id)} style={{border:'1px solid rgba(255,255,255,.18)',borderRadius:10,padding:'9px 12px',background:mode===id?'#fff':'rgba(255,255,255,.08)',color:mode===id?'#171717':'#fff',fontWeight:750,cursor:'pointer'}}><Icon size={15} style={{verticalAlign:'-3px',marginRight:7}}/>{label}</button>)}
      </div>
    </div>

    <div className="trace-ai-layout" style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) 290px',gap:16,alignItems:'start'}}>
      <div className="trace-card" style={{display:'grid',gap:12}}>
        {mode==='business_advisor'&&<div className="trace-ai-business" style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
          <input value={business.name} onChange={e=>setBusiness({...business,name:e.target.value})} placeholder="Nama bisnis / klien" style={{padding:11,border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit'}}/>
          <input value={business.period} onChange={e=>setBusiness({...business,period:e.target.value})} placeholder="Periode analisis, contoh: Jan–Jun 2026" style={{padding:11,border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit'}}/>
          <textarea value={business.evidence} onChange={e=>setBusiness({...business,evidence:e.target.value})} placeholder="Paste evidence/data dari TRACE: revenue, transaksi, COGS, labor, OPEX, marketing, customer, findings, dll." style={{gridColumn:'1/-1',minHeight:110,padding:11,border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit'}}/>
          <input value={business.question} onChange={e=>setBusiness({...business,question:e.target.value})} placeholder="Pertanyaan utama / masalah bisnis" style={{gridColumn:'1/-1',padding:11,border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit'}}/>
        </div>}
        <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><div><strong>{mode==='business_advisor'?'Analisis Bisnis':'Analisis Teknis'}</strong><div className="trace-muted" style={{fontSize:12,marginTop:3}}>{mode==='business_advisor'?'AI tidak boleh membuat angka baru. Jika evidence kurang, AI akan menyebutkan data yang dibutuhkan.':'Masukkan incident, log, error, file, endpoint, atau evidence yang benar-benar tersedia.'}</div></div><button onClick={reset} style={{border:'1px solid rgba(23,23,23,.12)',background:'#fff',borderRadius:9,padding:'7px 9px',cursor:'pointer'}}><RefreshCw size={14}/></button></div>
        <div style={{display:'grid',gap:8,maxHeight:480,overflow:'auto'}}>{messages.map((m,i)=><div key={i} style={{padding:12,borderRadius:12,background:m.role==='user'?'#171717':'#fafaf8',color:m.role==='user'?'#fff':'inherit',justifySelf:m.role==='user'?'end':'start',maxWidth:'92%',lineHeight:1.6,fontSize:13,whiteSpace:'pre-wrap'}}>{m.content}</div>)}</div>
        <div className="trace-ai-send" style={{display:'flex',gap:8}}><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()}}} placeholder={mode==='business_advisor'?'Contoh: Kenapa margin turun dan data apa yang harus saya cek?':'Contoh: 503 muncul setelah deploy Netlify. Evidence apa yang perlu diperiksa?'} style={{flex:1,minHeight:72,padding:11,border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit'}}/><button onClick={()=>void send()} disabled={busy||!input.trim()} style={{border:0,borderRadius:10,padding:'0 17px',background:'#171717',color:'#fff',fontWeight:750}}>{busy?'Thinking…':'Kirim'}</button></div>
      </div>
      <div style={{display:'grid',gap:12}}>
        <div className="trace-card"><div style={{display:'flex',alignItems:'center',gap:8}}>{status?.configured?<CircleCheck size={18}/>:<CircleAlert size={18}/>}<strong>AI Provider</strong></div><div style={{fontSize:13,marginTop:8}}>{statusBusy?'Memeriksa konfigurasi…':status?.configured?'CONFIGURED':'NOT CONFIGURED'}</div><div className="trace-muted" style={{fontSize:11,marginTop:5}}>{status?.provider||'—'} · {status?.model||'—'}</div>{status?.configurationError&&<div style={{fontSize:11,marginTop:8,lineHeight:1.5}}>{status.configurationError}</div>}<button onClick={()=>void checkStatus()} style={{marginTop:10,border:'1px solid rgba(23,23,23,.12)',background:'#fff',borderRadius:9,padding:'7px 9px',cursor:'pointer'}}>Cek ulang</button></div>
        <div className="trace-card"><strong>AI Usage Monitor</strong><div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginTop:10}}>{[['Requests',usage.requests],['Berhasil',usage.success],['Error',usage.errors],['Quota 429',usage.quota]].map(([label,value])=><div key={String(label)} style={{padding:9,borderRadius:9,background:'rgba(23,23,23,.045)'}}><div className="trace-muted" style={{fontSize:10}}>{label}</div><strong style={{fontSize:17}}>{value}</strong></div>)}</div><div className="trace-muted" style={{fontSize:11,lineHeight:1.5,marginTop:9}}>Last response: {usage.lastCode} · {usage.lastAt}</div><button onClick={()=>setUsage({requests:0,success:0,errors:0,quota:0,lastCode:'—',lastAt:'—'})} style={{marginTop:9,border:'1px solid rgba(23,23,23,.12)',background:'#fff',borderRadius:9,padding:'7px 9px',cursor:'pointer'}}>Reset counter</button></div><div className="trace-card"><strong>Mode aman</strong><div className="trace-muted" style={{fontSize:12,lineHeight:1.6,marginTop:7}}>AI hanya membaca context yang dikirim ke endpoint. Tidak ada auto-deploy, auto-migration, atau perubahan source dari layar ini.</div></div>
        {mode==='guardian'&&<div className="trace-card"><strong>Diagnostic Center</strong><div className="trace-muted" style={{fontSize:12,lineHeight:1.6,marginTop:7}}>Guardian menggunakan endpoint AI yang sama, sedangkan static scan, telemetry, repair plan, security scan, dan approval gate tetap berada di Settings.</div><button onClick={()=>{location.href='?view=settings'}} style={{marginTop:10,border:0,borderRadius:9,padding:'8px 10px',background:'#171717',color:'#fff',fontWeight:750,cursor:'pointer'}}>Buka Settings / Diagnostic <ExternalLink size={14} style={{verticalAlign:'-3px',marginLeft:5}}/></button></div>}
      </div>
    </div>
  </div>;
}
