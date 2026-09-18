import React, { Component, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Settings } from 'lucide-react';
import { fetchWithTimeout } from '../../core/browserNetwork';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function fmtFieldAmount(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n.toLocaleString('id-ID') : 'belum dapat dihitung';
}

export type TraceCollectionState = { loading:boolean; error:string; data:Record<string, unknown>; unavailable:string[] };
export const TRACE_KEYS = ['trace-clients','trace-companies','trace-brands','trace-outlets','trace-team'] as const;
export type TraceResource = 'tasks'|'audit'|'clients'|'imports'|'finance'|'products'|'sales'|'pos_events'|'inventory_movements'|'inventory_items'|'inventory_recipes'|'anomalies'|'alerts'|'health'|'accounts'|'journal_entries'|'journal_lines'|'ar_invoices'|'ar_payments'|'ap_bills'|'ap_payments'|'fixed_assets'|'period_locks';
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
      const clients=await readTraceKvArray('trace_os::trace-clients');
      const normalizedName=String(lead.business_name||'').trim().toLowerCase();
      const existing=clients.find(c=>String(c.name||c.business_name||'').trim().toLowerCase()===normalizedName && normalizedName);
      if(existing) return {existing:true,client:existing};
      const client={id:`client_${crypto.randomUUID()}`,name:lead.business_name||'Unnamed client',createdAt:Date.now(),source:'acquisition',acquisitionLeadId:lead.id};
      await writeTraceKv('trace_os::trace-clients',[...clients,client]);
      return {existing:false,client};
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
  const qs=encodeURIComponent(keys.join(','));
  const rq=encodeURIComponent(resources.join(','));
  const scope=clientId?.trim()?`&client_id=${encodeURIComponent(clientId.trim())}`:'';
  const query=keys.length ? `keys=${qs}${resources.length?`&resources=${rq}`:''}${scope}` : `resources=${rq}${scope}`;
  const response=await fetchWithTimeout(`/api/trace-data?${query}`,{headers:{Authorization:`Bearer ${sessionData.session.access_token}`}},10000);
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error||`Trace data HTTP ${response.status}`);
  return {data:(payload.data&&typeof payload.data==='object')?payload.data:{},unavailable:Array.isArray(payload.unavailable)?payload.unavailable.map((x:unknown)=>typeof x==='object'&&x&&'key' in x?String((x as {key:unknown}).key):'unknown'):[]};
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
  useEffect(()=>{const supabase=getReactSupabase(); if(!supabase){setReady(true);setError('Supabase belum dikonfigurasi pada aplikasi ini.');return;} let alive=true; supabase.auth.getSession().then(({data})=>{if(alive){setSession(!!data.session);setReady(true)}}).catch(()=>{if(alive){setError('Session Supabase tidak dapat diperiksa.');setReady(true)}}); const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(alive){setSession(!!next);setReady(true)}}); return()=>{alive=false;subscription.unsubscribe()};},[]);
  const login=async(e:React.FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const supabase=getReactSupabase();if(!supabase)throw new Error('Supabase belum dikonfigurasi.');const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');}catch(err){setError(err instanceof Error?err.message:'Login gagal.');}finally{setBusy(false)}};
  if(!ready) return <main className="trace-auth-screen"><div className="trace-auth-card"><div className="trace-section-kicker">TRACE · AUTHENTICATION</div><h1>Memeriksa sesi…</h1><div className="trace-muted">TRACE menunggu session Supabase sebelum membuka data production.</div></div></main>;
  if(session) return <>{children}</>;
  return <main className="trace-auth-screen"><form className="trace-auth-card" onSubmit={login}><div className="trace-section-kicker">TRACE · CONSULTANT OS</div><h1>Masuk ke TRACE</h1><p className="trace-muted">Login diperlukan sebelum data client, finance, accounting, inventory, acquisition, dan diagnostic dapat dibaca.</p><label>Email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>{error&&<div className="trace-alert">{error}</div>}<button className="trace-button" disabled={busy}>{busy?'Memeriksa…':'Masuk'}</button></form></main>;
}

export const money=(n:number)=>`Rp ${Math.round(n||0).toLocaleString('id-ID')}`;
export const inputStyle: React.CSSProperties={width:'100%',marginTop:7,padding:'11px 12px',border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit',background:'#fff'};

export function ComingSoonPanel({title,kicker,note}:{title:string;kicker:string;note:string}){
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>{kicker}</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>{title}</h1><div className="trace-muted">{note}</div></div>
    <div className="trace-card"><strong>Layar ini menyusul.</strong><div className="trace-muted" style={{marginTop:7}}>RPC dan tabelnya sudah siap di Supabase; UI-nya sedang dibangun bertahap, satu modul per sesi, mengikuti pola layar Stock Opname/Inventory/Akuntansi di atas.</div></div>
  </div>;
}
