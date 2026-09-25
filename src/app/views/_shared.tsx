import React, { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { fetchWithTimeout } from '../../core/browserNetwork';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TracePageHeader, TraceCard } from '../components/TraceUI';
import { AppSplash } from '../components/AppSplash';
import { AppOnboarding, hasSeenOnboarding } from '../components/AppOnboarding';

export function fmtFieldAmount(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n.toLocaleString('id-ID') : 'belum dapat dihitung';
}

export type TraceCollectionState = { loading:boolean; error:string; data:Record<string, unknown>; unavailable:string[] };
export const TRACE_KEYS = ['trace-clients','trace-companies','trace-brands','trace-outlets','trace-team'] as const;
export type TraceResource = 'tasks'|'audit'|'clients'|'outlets'|'imports'|'finance'|'products'|'sales'|'pos_events'|'inventory_movements'|'inventory_items'|'inventory_recipes'|'anomalies'|'alerts'|'health'|'accounts'|'journal_entries'|'journal_lines'|'ar_invoices'|'ar_payments'|'ap_bills'|'ap_payments'|'fixed_assets'|'period_locks'|'social_accounts'|'content_items';
let reactSupabase: SupabaseClient | null = null;
export function getReactSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if(typeof url !== 'string' || !url.startsWith('https://') || typeof key !== 'string' || key.length < 20) return null;
  if(!reactSupabase) reactSupabase = createClient(url, key, { auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true} });
  return reactSupabase;
}

export type AcquisitionLeadRecord = Record<string, unknown> & { id: string };
export type AcquisitionBridge = {
  loadLeads: () => Promise<AcquisitionLeadRecord[]>;
  saveLeads: (leads: AcquisitionLeadRecord[]) => Promise<boolean>;
  saveDiscoveryJob: (job: Record<string, unknown>) => Promise<boolean>;
  updateDiscoveryJob: (jobId: string, status: string, progress?: Record<string, unknown>, error?: Record<string, unknown>) => Promise<boolean>;
  saveDiscoveryCheckpoint: (jobId: string, sequenceNo: number, stats?: Record<string, unknown>, payload?: Record<string, unknown>) => Promise<boolean>;
  createClientFromLead: (lead: AcquisitionLeadRecord) => Promise<{existing:boolean;client:AcquisitionLeadRecord}>;
};
declare global {
  interface Window { TRACE_ACQUISITION_BRIDGE?: AcquisitionBridge; }
}
export const ACQUISITION_KV_KEY = 'trace_os::acquisitionLeads';

export async function requireReactSession(): Promise<SupabaseClient> {
  const supabase = getReactSupabase();
  if(!supabase) throw new Error('Supabase React belum dikonfigurasi.');
  const {data,error}=await supabase.auth.getSession();
  if(error) throw error;
  if(!data.session) throw new Error('Session Supabase tidak tersedia.');
  return supabase;
}
export async function readTraceKvArray(key:string): Promise<AcquisitionLeadRecord[]> {
  const supabase=await requireReactSession();
  const {data,error}=await supabase.rpc('trace_read_global_kv',{p_keys:[key]});
  if(error) throw error;
  const parsed=(data&&typeof data==='object'&&!Array.isArray(data)?(data as Record<string,unknown>)[key]:undefined);
  if(parsed===undefined||parsed===null) return [];
  if(!Array.isArray(parsed)) throw new Error(`Data ${key} bukan array.`);
  return parsed.filter((x):x is AcquisitionLeadRecord=>typeof x==='object'&&x!==null&&typeof (x as Record<string,unknown>).id==='string');
}
export async function writeTraceKv(key:string,value:unknown): Promise<boolean> {
  const supabase=await requireReactSession();
  const {error}=await supabase.rpc('trace_upsert_global_kv',{p_key:key,p_value:value});
  if(error) throw error;
  return true;
}
export async function installAcquisitionBridge(){
  if(window.TRACE_ACQUISITION_BRIDGE) return;
  const bridge:AcquisitionBridge={
    loadLeads:()=>readTraceKvArray(ACQUISITION_KV_KEY),
    saveLeads:(leads)=>writeTraceKv(ACQUISITION_KV_KEY,leads),
    saveDiscoveryJob:async(job)=>{
      const supabase=await requireReactSession();
      const {data,error}=await supabase.rpc('trace_create_acquisition_job',{
        p_job_id:job.job_id, p_job_type:'acquisition_discovery',
        p_scope:{area:job.area||null,category:job.category||null,source:job.source||null},
        p_config:{}, p_progress:{}
      });
      if(error) throw error;
      return !!data;
    },
    updateDiscoveryJob:async(jobId,status,progress={},errorPayload={})=>{
      const supabase=await requireReactSession();
      const {data,error}=await supabase.rpc('trace_update_acquisition_job',{
        p_job_id:jobId, p_status:String(status).toUpperCase(), p_progress:progress,
        p_error:Object.keys(errorPayload).length?errorPayload:null
      });
      if(error) throw error;
      return !!data;
    },
    saveDiscoveryCheckpoint:async(jobId,sequenceNo,stats={},payload={})=>{
      const supabase=await requireReactSession();
      const {data,error}=await supabase.rpc('trace_save_acquisition_checkpoint',{
        p_job_id:jobId, p_sequence_no:sequenceNo, p_stats:stats, p_payload:payload
      });
      if(error) throw error;
      return !!data;
    },
    createClientFromLead:async(lead)=>{
      // v72.13 — client master data now lives in public.trace_clients
      // (audited RPCs), not the legacy trace_os::trace-clients KV blob.
      // Convert-lead-to-client now reads/writes through the same RPCs
      // ClientsView uses, so new clients are visible everywhere immediately.
      const supabase=await requireReactSession();
      const {data:existingRows,error:listError}=await supabase.rpc('trace_list_clients');
      if(listError) throw listError;
      const normalizedName=String(lead.business_name||'').trim().toLowerCase();
      const existing=(Array.isArray(existingRows)?existingRows:[]).find((c:Record<string,unknown>)=>String(c.name||'').trim().toLowerCase()===normalizedName && normalizedName);
      if(existing) return {existing:true,client:existing as AcquisitionLeadRecord};
      const {data:created,error:createError}=await supabase.rpc('trace_create_client',{
        p_name:String(lead.business_name||'Unnamed client'),
        p_package:'Starter', p_status:'Trial', p_pic_name:'', p_drive_folder_link:'', p_notes:''
      });
      if(createError) throw createError;
      return {existing:false,client:created as AcquisitionLeadRecord};
    }
  };
  window.TRACE_ACQUISITION_BRIDGE=bridge;
}
// Production read endpoint: /api/trace-data?keys=...
export async function loadTraceCollections(keys: readonly string[], resources: readonly TraceResource[] = [], clientId?: string): Promise<{data:Record<string, unknown>; unavailable:string[]}> {
  const supabase = getReactSupabase();
  if(!supabase) throw new Error('Supabase React belum dikonfigurasi. Set VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.');
  const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
  if(sessionError) throw sessionError;
  if(!sessionData.session) throw new Error('Session Supabase tidak tersedia.');

  // v72.13 — legacy shim: 'trace-clients' used to be a KV blob key
  // (trace_os::trace-clients). Client master data now lives in the real
  // public.trace_clients table, read via the 'clients' resource (RPC
  // trace_list_clients). Any caller still asking for the old KV key is
  // transparently redirected to the new resource here, and the rows are
  // reshaped back into the array-of-objects shape the 21 existing view
  // consumers already expect (they only ever read .id / .name, with a
  // .business_name fallback that is simply never populated by the new rows).
  // v72.14 — same shim, for 'trace-outlets': outlet master data now lives
  // in public.trace_outlets (RPC trace_list_outlets), read via the
  // 'outlets' resource. Rows are reshaped back into the {id, nama, name,
  // clientId} shape outletOptionsForClient (core/scope.ts) already expects
  // from the old Company→Brand→Outlet KV hierarchy, minus brandId — that
  // function now matches an outlet to its client directly by clientId
  // when present, so the never-populated company/brand chain is no longer
  // required for suggestions to work.
  const legacyClientsRequested = keys.includes('trace-clients');
  const legacyOutletsRequested = keys.includes('trace-outlets');
  const effectiveKeys = keys.filter(k=>k!=='trace-clients'&&k!=='trace-outlets');
  const wantedClientsResource = resources.includes('clients');
  const wantedOutletsResource = resources.includes('outlets');
  let effectiveResources = resources;
  if(legacyClientsRequested && !wantedClientsResource) effectiveResources=[...effectiveResources,'clients'];
  if(legacyOutletsRequested && !wantedOutletsResource) effectiveResources=[...effectiveResources,'outlets'];

  const qs=encodeURIComponent(effectiveKeys.join(','));
  const rq=encodeURIComponent(effectiveResources.join(','));
  const scope=clientId?.trim()?`&client_id=${encodeURIComponent(clientId.trim())}`:'';
  const query=effectiveKeys.length ? `keys=${qs}${effectiveResources.length?`&resources=${rq}`:''}${scope}` : `resources=${rq}${scope}`;
  const response=await fetchWithTimeout(`/api/trace-data?${query}`,{headers:{Authorization:`Bearer ${sessionData.session.access_token}`}},10000);
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error||`Trace data HTTP ${response.status}`);

  const data:Record<string,unknown>=(payload.data&&typeof payload.data==='object')?{...payload.data}:{};
  const unavailable:string[]=Array.isArray(payload.unavailable)?payload.unavailable.map((x:unknown)=>typeof x==='object'&&x&&'key' in x?String((x as {key:unknown}).key):'unknown'):[];

  if(legacyClientsRequested){
    const rows=Array.isArray(data['clients'])?data['clients'] as Record<string,unknown>[]:[];
    data['trace-clients']=rows.map(r=>({
      id:r.id, name:r.name, package:r.package, status:r.status,
      pic_name:r.pic_name, drive_folder_link:r.drive_folder_link, notes:r.notes,
      createdAt:r.created_at, updatedAt:r.updated_at,
    }));
    if(!wantedClientsResource) delete data['clients'];
    const idx=unavailable.indexOf('clients');
    if(idx!==-1) unavailable[idx]='trace-clients';
  }

  if(legacyOutletsRequested){
    const rows=Array.isArray(data['outlets'])?data['outlets'] as Record<string,unknown>[]:[];
    data['trace-outlets']=rows.map(r=>({
      id:r.id, nama:r.name, name:r.name, clientId:r.client_id, notes:r.notes,
      createdAt:r.created_at, updatedAt:r.updated_at,
    }));
    if(!wantedOutletsResource) delete data['outlets'];
    const idx=unavailable.indexOf('outlets');
    if(idx!==-1) unavailable[idx]='trace-outlets';
  }

  return {data, unavailable};
}
export function asArray(value:unknown): unknown[]{return Array.isArray(value)?value:[];}
export function useTraceCollections(keys:readonly string[] = TRACE_KEYS, resources:readonly TraceResource[] = [], clientId?: string): TraceCollectionState {
  const [state,setState]=useState<TraceCollectionState>({loading:true,error:'',data:{},unavailable:[]});
  useEffect(()=>{let alive=true;setState(v=>({...v,loading:true,error:''}));loadTraceCollections(keys,resources,clientId).then(result=>{if(alive)setState({loading:false,error:'',...result});}).catch(error=>{if(alive)setState({loading:false,error:error instanceof Error?error.message:'Data TRACE tidak tersedia.',data:{},unavailable:[]});});return()=>{alive=false};},[keys.join('|'),resources.join('|'),clientId||'']);
  return state;
}

export class TraceErrorBoundary extends Component<{children:ReactNode},{hasError:boolean;message:string}>{
  state={hasError:false,message:''};
  static getDerivedStateFromError(error:Error){return {hasError:true,message:error.message||'Unexpected application error.'};}
  componentDidCatch(error:Error,info:ErrorInfo){
    try{window.dispatchEvent(new CustomEvent('trace-runtime-error',{detail:{message:error.message,stack:error.stack,componentStack:info.componentStack,timestamp:new Date().toISOString()}}));}catch{}
  }
  render(){
    if(this.state.hasError) return <main className="trace-crash"><div className="trace-crash-card"><div className="trace-section-kicker">TRACE · RECOVERY MODE</div><h1>TRACE menemukan error saat menjalankan layar.</h1><p>Data production tidak dihapus. Refresh untuk memulihkan aplikasi. Jika error berulang, buka Settings → AI Diagnostic Center agar evidence dikirim ke sistem diagnosis.</p><details><summary>Detail teknis</summary><pre>{this.state.message}</pre></details><button className="trace-button" onClick={()=>location.reload()}>Muat ulang TRACE</button></div></main>;
    return this.props.children;
  }
}

export function TraceAuthGate({children}:{children:ReactNode}){
  const [ready,setReady]=useState(false); const [session,setSession]=useState<boolean>(false);
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [minTimeUp,setMinTimeUp]=useState(false); const [safetyUp,setSafetyUp]=useState(false); const [splashDone,setSplashDone]=useState(false);
  const [onboardingDone,setOnboardingDone]=useState(()=>hasSeenOnboarding());
  useEffect(()=>{const supabase=getReactSupabase(); if(!supabase){setReady(true);setError('Supabase belum dikonfigurasi pada aplikasi ini.');return;} let alive=true; supabase.auth.getSession().then(({data})=>{if(alive){setSession(!!data.session);setReady(true)}}).catch(()=>{if(alive){setError('Session Supabase tidak dapat diperiksa.');setReady(true)}}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(alive){setSession(!!next);setReady(true)}}); return()=>{alive=false;subscription.unsubscribe()};},[]);
  // Splash mirrors the legacy monolith's timing: visible at least 900ms so it never just flickers,
  // but never blocks longer than 3200ms even if the Supabase session check stalls.
  useEffect(()=>{const t=setTimeout(()=>setMinTimeUp(true),900);return()=>clearTimeout(t);},[]);
  useEffect(()=>{const t=setTimeout(()=>setSafetyUp(true),3200);return()=>clearTimeout(t);},[]);
  const login=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const supabase=getReactSupabase();if(!supabase)throw new Error('Supabase belum dikonfigurasi.');const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');}catch(err){setError(err instanceof Error?err.message:'Login gagal.');}finally{setBusy(false)}};
  if(!splashDone) return <AppSplash hidden={safetyUp||(ready&&minTimeUp)} onExited={()=>setSplashDone(true)} />;
  if(session) return <>{children}</>;
  if(!onboardingDone) return <AppOnboarding onDone={()=>setOnboardingDone(true)} />;
  return <main className="trace-auth-screen"><form className="trace-auth-card" onSubmit={login}><div className="trace-auth-brand"><div className="trace-auth-brand-mark"><img src="/logo.png" alt="" onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none'}} /></div></div><div className="trace-section-kicker">TRACE · CONSULTANT OS</div><h1>Masuk ke TRACE</h1><p className="trace-muted">Login diperlukan sebelum data client, finance, accounting, inventory, acquisition, dan diagnostic dapat dibaca.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>{error&&<div className="trace-alert">{error}</div>}<button className="trace-button" disabled={busy}>{busy?'Memeriksa…':'Masuk'}</button></form></main>;
}

export const money=(n:number)=>`Rp ${Math.round(n||0).toLocaleString('id-ID')}`;
export const inputStyle: React.CSSProperties={width:'100%',marginTop:7,padding:'11px 12px',border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit',background:'#fff'};

export function ComingSoonPanel({title,kicker,note}:{title:string;kicker:string;note:string}){
  return <div style={{display:'grid',gap:16}}>
    <TracePageHeader kicker={kicker} title={title} description={note} />
    <TraceCard><strong>Layar ini menyusul.</strong><div className="trace-muted" style={{marginTop:7}}>RPC dan tabelnya sudah siap di Supabase; UI-nya sedang dibangun bertahap, satu modul per sesi, mengikuti pola layar Stock Opname/Inventory/Akuntansi di atas.</div></TraceCard>
  </div>;
}
