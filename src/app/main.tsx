import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, Building2, Command, LayoutDashboard, Users, ArrowRight, CircleCheck, TriangleAlert, WalletCards, Settings, ShieldCheck, RefreshCw, FileCode2, Database, Network, Gauge, TestTube2, PlugZap, Brain, LockKeyhole, X, Search, Info, ListChecks, ClipboardList, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend } from 'recharts';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import * as Dialog from '@radix-ui/react-dialog';
import '../styles/tokens.css';
import { financeInputGuidance, validateFinanceRecord } from '../core/financeInput';
import { summarizeFinance, compareFinancePeriods, type FinanceRecord, type FinanceStatementSection, type FinanceEvidence } from '../core/finance';
import { diagnoseBusiness } from '../core/diagnosis';
import { exportFinanceExcel, exportFinancePdf, exportIncomeStatementExcel, exportIncomeStatementPdf, exportFinanceDashboardExcel } from '../core/financeReport';
import { buildIncomeStatement } from '../core/financeStatement';
import { buildSalesDashboard, type SaleLine } from '../core/salesAnalytics';
import { diagnoseApplication, summarizeDiagnostics, type DiagnosticFinding } from '../core/aiDiagnostic';
import { createEmptyDiagnosticCenterSnapshot, collectBrowserTelemetry, sendDiagnosticTelemetry, type DiagnosticCenterSnapshot } from '../core/diagnosticCenter';
import { buildRepairPlan, requestRepairApply, type DiagnosticRepairPlan } from '../core/diagnosticRepair';
import { analyzeSecurity, securityStatus, type SecurityFinding } from '../core/aiSecurity';
import { buildEvolutionRecommendations, type EvolutionRecommendation } from '../core/aiEvolution';
import { aggregateDelimitedRows, applyManualCompletion, buildIntakeResult, calculateAvailableFinance, detectSourceType, parseAmount, type IntakeResult } from '../core/dataIntake';
import { parseWorkbook, parseDocx, parsePdf, parseText, parseImage } from '../core/fileIntakeAdapters';
import { buildLeaderCommandCenter, type HealthStatus, type LeaderClientSnapshot } from '../core/leaderCommandCenter';
import { diagnoseInternalSystem } from '../core/internalDiagnosis';
import { fetchWithTimeout } from '../core/browserNetwork';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deleteRecoverySnapshot, listRecoverySnapshots, saveRecoverySnapshot, type RecoverySnapshot } from '../core/durableRecovery';
import { calculateKPIs, type KPIInput, type KPIResult } from '../core/kpi';
import { transitionTask, summarizeCollaboration, type CollaborationTask, type CollaborationStatus } from '../core/collaboration';
import { nextSOPStep, validateSOP, type SOP } from '../core/sop';
import { auditDiff } from '../core/auditGovernance';
import { requiresApproval, deploymentDecision } from '../core/aiMaintenance';
import { analyzePOSHealth, type POSEvent } from '../core/posHealth';
import { calculateInventoryVariance, type InventoryMovement, type RecipeComponent } from '../core/inventoryIntelligence';
import { buildBusinessHealth } from '../core/businessHealth';
import { buildAlerts } from '../core/alerts';
import { mapTabularRows, summarizeCanonicalImport, type CanonicalPOSEventInput } from '../core/canonicalImport';
import { buildTrialBalance, calculateRecipeCogs, type Account as LedgerAccount, type JournalEntry as LedgerJournalEntry } from '../core/accounting';
import { buildArAging, type ArInvoice, type ArPayment } from '../core/accountsReceivable';
import { buildApAging, type ApBill, type ApPayment } from '../core/accountsPayable';
import { buildDepreciationSchedule, totalMonthlyDepreciation, type FixedAsset } from '../core/fixedAssets';
import { isPeriodLocked, type PeriodLock } from '../core/periodClose';
import { buildBalanceSheet, type BalanceSheetGroup } from '../core/balanceSheet';
import { withInferredSubTypes } from '../core/accountSubTypeInference';

function fmtFieldAmount(v: unknown): string {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n.toLocaleString('id-ID') : 'belum dapat dihitung';
}

const nav = [
  ['overview','Overview',LayoutDashboard],['health','Business Health',Gauge],['command','Command Center',Gauge],['recovery','Data Recovery',Database],['team','Team',Users],['governance','Governance',ShieldCheck],['clients','Klien',Users],['acquisition','Acquisition',Target],['business','Business Twin',Building2],['finance','Keuangan',WalletCards],['accounting','Akuntansi',ListChecks],['sales','Penjualan & Dashboard',Activity],['intake','Data Intake',FileCode2],['diagnosis','Diagnosis',TriangleAlert],['internal','Internal Diagnosis',Brain],['analytics','Analytics',BarChart3],['settings','Settings',Settings]
] as const;


type TraceCollectionState = { loading:boolean; error:string; data:Record<string, unknown>; unavailable:string[] };
const TRACE_KEYS = ['trace-clients','trace-companies','trace-brands','trace-outlets','trace-team'] as const;
type TraceResource = 'tasks'|'audit'|'imports'|'finance'|'products'|'sales'|'pos_events'|'inventory_movements'|'inventory_items'|'inventory_recipes'|'anomalies'|'alerts'|'health'|'accounts'|'journal_entries'|'journal_lines';
let reactSupabase: SupabaseClient | null = null;
function getReactSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if(typeof url !== 'string' || !url.startsWith('https://') || typeof key !== 'string' || key.length < 20) return null;
  if(!reactSupabase) reactSupabase = createClient(url, key, { auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true} });
  return reactSupabase;
}

type AcquisitionLeadRecord = Record<string, unknown> & { id: string };
type AcquisitionBridge = {
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
const ACQUISITION_KV_KEY = 'trace_os::acquisitionLeads';

async function requireReactSession(): Promise<SupabaseClient> {
  const supabase = getReactSupabase();
  if(!supabase) throw new Error('Supabase React belum dikonfigurasi.');
  const {data,error}=await supabase.auth.getSession();
  if(error) throw error;
  if(!data.session) throw new Error('Session Supabase tidak tersedia.');
  return supabase;
}
async function readTraceKvArray(key:string): Promise<AcquisitionLeadRecord[]> {
  const supabase=await requireReactSession();
  const {data,error}=await supabase.rpc('trace_read_global_kv',{p_keys:[key]});
  if(error) throw error;
  const parsed=(data&&typeof data==='object'&&!Array.isArray(data)?(data as Record<string,unknown>)[key]:undefined);
  if(parsed===undefined||parsed===null) return [];
  if(!Array.isArray(parsed)) throw new Error(`Data ${key} bukan array.`);
  return parsed.filter((x):x is AcquisitionLeadRecord=>typeof x==='object'&&x!==null&&typeof (x as Record<string,unknown>).id==='string');
}
async function writeTraceKv(key:string,value:unknown): Promise<boolean> {
  const supabase=await requireReactSession();
  const {error}=await supabase.rpc('trace_upsert_global_kv',{p_key:key,p_value:value});
  if(error) throw error;
  return true;
}
async function installAcquisitionBridge(){
  if(window.TRACE_ACQUISITION_BRIDGE) return;
  const bridge:AcquisitionBridge={
    loadLeads:()=>readTraceKvArray(ACQUISITION_KV_KEY),
    saveLeads:(leads)=>writeTraceKv(ACQUISITION_KV_KEY,leads),
    saveDiscoveryJob:async(job)=>{
      const supabase=await requireReactSession();
      const {error}=await supabase.from('trace_jobs').insert({
        id:job.job_id,job_type:'acquisition_discovery',status:'RUNNING',requested_by:(await supabase.auth.getUser()).data.user?.id,
        scope:{area:job.area||null,category:job.category||null,source:job.source||null},config:{},progress:{}
      });
      if(error) throw error;
      return true;
    },
    updateDiscoveryJob:async(jobId,status,progress={},errorPayload={})=>{
      const supabase=await requireReactSession();
      const {error}=await supabase.from('trace_jobs').update({status,progress,error:Object.keys(errorPayload).length?errorPayload:null,heartbeat_at:new Date().toISOString(),finished_at:['COMPLETED','STOPPED','FAILED','PARTIAL_FAILURE'].includes(status)?new Date().toISOString():null}).eq('id',jobId);
      if(error) throw error;
      return true;
    },
    saveDiscoveryCheckpoint:async(jobId,sequenceNo,stats={},payload={})=>{
      const supabase=await requireReactSession();
      const {error}=await supabase.from('trace_job_checkpoints').insert({job_id:jobId,sequence_no:sequenceNo,stats,payload});
      if(error) throw error;
      return true;
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
async function loadTraceCollections(keys: readonly string[], resources: readonly TraceResource[] = [], clientId?: string): Promise<{data:Record<string, unknown>; unavailable:string[]}> {
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
function asArray(value:unknown): unknown[]{return Array.isArray(value)?value:[];}
function useTraceCollections(keys:readonly string[] = TRACE_KEYS, resources:readonly TraceResource[] = [], clientId?: string): TraceCollectionState {
  const [state,setState]=useState<TraceCollectionState>({loading:true,error:'',data:{},unavailable:[]});
  useEffect(()=>{let alive=true;setState(v=>({...v,loading:true,error:''}));loadTraceCollections(keys,resources,clientId).then(result=>{if(alive)setState({loading:false,error:'',...result});}).catch(error=>{if(alive)setState({loading:false,error:error instanceof Error?error.message:'Data TRACE tidak tersedia.',data:{},unavailable:[]});});return()=>{alive=false};},[keys.join('|'),resources.join('|'),clientId||'']);
  return state;
}

type LeaderSnapshotsState = { loading:boolean; error:string; snapshots:LeaderClientSnapshot[] };
/** Real per-client health rollup for Command Center / Internal Diagnosis — loops production
 *  finance/pos/inventory/task data per client (evidence-first, same rules as BusinessHealthView). */
function useLeaderSnapshots(clients:Record<string,unknown>[]): LeaderSnapshotsState {
  const [state,setState]=useState<LeaderSnapshotsState>({loading:true,error:'',snapshots:[]});
  const ids=clients.map(c=>String(c.id)).join('|');
  useEffect(()=>{
    let alive=true;
    if(!clients.length){ setState({loading:false,error:'',snapshots:[]}); return; }
    setState(v=>({...v,loading:true,error:''}));
    (async()=>{
      const snapshots:LeaderClientSnapshot[]=[];
      for(const c of clients){
        const clientId=String(c.id);
        const clientName=String(c.name??c.business_name??clientId);
        try{
          const {data}=await loadTraceCollections([],['finance','pos_events','inventory_movements','inventory_items','inventory_recipes','tasks'],clientId);
          const financeRecords:FinanceRecord[]=asArray(data.finance).filter((r):r is Record<string,unknown>=>!!r&&typeof r==='object').map((r:any)=>({id:String(r.id),period:String(r.period),amount:Number(r.amount),category:r.category as FinanceRecord['category'],outletId:r.outlet_id?String(r.outlet_id):undefined,evidence:r.evidence_source?{id:String(r.id),source:r.evidence_source as FinanceEvidence['source']}:undefined}));
          const periods=[...new Set(financeRecords.map(r=>r.period))].sort();
          const period=periods.at(-1)??'';
          const summary=summarizeFinance(financeRecords,period);
          const events:POSEvent[]=asArray(data.pos_events).filter((e):e is Record<string,unknown>=>!!e).map((e:any)=>({id:String(e.id),organizationId:String(e.organization_id),outletId:e.outlet_id?String(e.outlet_id):undefined,employeeId:e.employee_id?String(e.employee_id):undefined,cashierId:e.cashier_id?String(e.cashier_id):undefined,productId:e.product_id?String(e.product_id):undefined,type:e.event_type as POSEvent['type'],amount:Number(e.amount),occurredAt:String(e.occurred_at),sourceRecordId:e.source_record_id?String(e.source_record_id):undefined}));
          const pos=analyzePOSHealth(events);
          const movements:InventoryMovement[]=asArray(data.inventory_movements).filter((e):e is Record<string,unknown>=>!!e).map((e:any)=>({id:String(e.id),itemId:String(e.item_id),outletId:e.outlet_id?String(e.outlet_id):undefined,type:e.movement_type as InventoryMovement['type'],qty:Number(e.qty),unitCost:e.unit_cost===null||e.unit_cost===undefined?null:Number(e.unit_cost),occurredAt:String(e.occurred_at)}));
          const recipes:RecipeComponent[]=asArray(data.inventory_recipes).map((e:any)=>({productId:String(e.product_id),itemId:String(e.item_id),qtyPerSale:Number(e.qty_per_sale)}));
          const inventory=calculateInventoryVariance(movements,recipes,[]);
          const evidence=[{id:'finance',metric:'Financial data',status:summary.recordCount?'available':'unavailable',value:summary.operatingProfit,period,source:'Supabase trace_finance_records'} as const,{id:'pos',metric:'POS events',status:events.length?'available':'unavailable',value:events.length,source:'Supabase trace_pos_events'} as const,{id:'inventory',metric:'Inventory movements',status:movements.length?'available':'unavailable',value:movements.length,source:'Supabase trace_inventory_movements'} as const];
          const health=buildBusinessHealth({finance:summary,pos:events.length?pos:null,inventory:inventory.length?inventory:undefined,evidence:[...evidence]});
          const tasks=asArray(data.tasks).filter((t):t is Record<string,unknown>=>!!t&&typeof t==='object');
          const openActions=tasks.filter(t=>t.status==='open'||t.status==='in_progress').length;
          const blockedActions=tasks.filter(t=>t.status==='blocked').length;
          const healthStatus:HealthStatus=health.score===null?'unknown':health.score>=80?'healthy':health.score>=60?'attention':'critical';
          snapshots.push({clientId,clientName,health:healthStatus,healthReason:health.score===null?'Evidence belum cukup untuk menghitung score.':`Score ${health.score}/100 dari evidence yang tersedia (confidence ${health.confidencePct??0}%).`,kpis:[],openActions,blockedActions,dataCoveragePct:health.confidencePct});
        }catch(err){
          snapshots.push({clientId,clientName,health:'unknown',healthReason:err instanceof Error?err.message:'Data client tidak tersedia.',kpis:[],openActions:0,blockedActions:0,dataCoveragePct:null});
        }
      }
      if(alive) setState({loading:false,error:'',snapshots});
    })();
    return ()=>{alive=false};
  },[ids]);
  return state;
}

class TraceErrorBoundary extends Component<{children:ReactNode},{hasError:boolean;message:string}>{
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

type SessionState = { checked:boolean; session:import('@supabase/supabase-js').Session|null };
function useSupabaseSession(): SessionState {
  const [state,setState]=useState<SessionState>({checked:false,session:null});
  useEffect(()=>{
    const supabase=getReactSupabase();
    if(!supabase){ setState({checked:true,session:null}); return; }
    let alive=true;
    supabase.auth.getSession().then(({data})=>{ if(alive) setState({checked:true,session:data.session??null}); });
    const {data:sub}=supabase.auth.onAuthStateChange((_event,session)=>{ if(alive) setState({checked:true,session:session??null}); });
    return ()=>{ alive=false; sub.subscription.unsubscribe(); };
  },[]);
  return state;
}

function LoginGate({onSignedIn}:{onSignedIn:()=>void}){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [mode,setMode]=useState<'signin'|'signup'>('signin');
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const supabase=getReactSupabase();
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!supabase){ setMessage('Supabase belum dikonfigurasi (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY kosong).'); return; }
    if(!email.trim()||!password){ setMessage('Isi email dan password.'); return; }
    setBusy(true); setMessage('');
    try{
      if(mode==='signin'){
        const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
        if(error) throw error;
        onSignedIn();
      }else{
        const {error}=await supabase.auth.signUp({email:email.trim(),password});
        if(error) throw error;
        setMessage('Akun dibuat. Cek email untuk verifikasi (jika diaktifkan), lalu login.');
        setMode('signin');
      }
    }catch(err){ setMessage(err instanceof Error?err.message:'Login gagal.'); }
    finally{ setBusy(false); }
  };
  return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d0f',padding:20}}>
    <form onSubmit={submit} style={{width:'100%',maxWidth:380,background:'#fff',borderRadius:16,padding:28,display:'grid',gap:14}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}><div style={{width:34,height:34,borderRadius:9,background:'#171717',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800}}>T</div><div><strong>TRACE</strong><div className="trace-muted" style={{fontSize:11}}>Consultant OS</div></div></div>
      <label style={{display:'grid',gap:5,fontSize:13}}>Email<input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} style={inputStyle} required/></label>
      <label style={{display:'grid',gap:5,fontSize:13}}>Password<input type="password" autoComplete={mode==='signin'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} style={inputStyle} required minLength={6}/></label>
      {message&&<div className="trace-muted" style={{fontSize:12,color:'#b42318'}}>{message}</div>}
      <button type="submit" disabled={busy} className="trace-button" style={{justifySelf:'stretch'}}>{busy?'Memproses…':mode==='signin'?'Masuk':'Daftar'}</button>
      <button type="button" onClick={()=>{setMode(m=>m==='signin'?'signup':'signin');setMessage('')}} style={{all:'unset',cursor:'pointer',fontSize:12,textAlign:'center',color:'#555'}}>{mode==='signin'?'Belum punya akun? Daftar':'Sudah punya akun? Masuk'}</button>
    </form>
  </div>;
}

function App(){
  useEffect(()=>{void installAcquisitionBridge().catch(()=>{ /* Acquisition remains truthful until a valid authenticated Supabase session exists. */ }); return()=>{ if(window.TRACE_ACQUISITION_BRIDGE) delete window.TRACE_ACQUISITION_BRIDGE; };},[]);
  const {checked,session}=useSupabaseSession();
  const initialView=(()=>{const v=new URLSearchParams(location.search).get('view');return ['overview','health','command','recovery','team','governance','clients','acquisition','business','finance','accounting','sales','intake','diagnosis','internal','analytics','settings'].includes(v||'')?String(v):'overview';})();
  const [active,setActive]=useState(initialView);
  const [commandOpen,setCommandOpen]=useState(false);
  const [commandQuery,setCommandQuery]=useState('');
  const title=nav.find(([id])=>id===active)?.[1] ?? 'Overview';
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setCommandOpen(true);setCommandQuery('');}if(e.key==='Escape')setCommandOpen(false)};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[]);
  const choose=(id:string)=>{setActive(id);setCommandOpen(false);setCommandQuery('');history.replaceState(null,'',`?view=${encodeURIComponent(id)}`)};
  const filtered=nav.filter(([,label])=>label.toLowerCase().includes(commandQuery.toLowerCase()));
  const mobile=nav.filter(([id])=>['overview','health','clients','finance','settings'].includes(id));
  if(!checked) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',color:'#888',fontSize:13}}>Memuat sesi…</div>;
  if(!session) return <LoginGate onSignedIn={()=>{}}/>;
  const signOut=async()=>{ const supabase=getReactSupabase(); if(supabase) await supabase.auth.signOut(); };
  return <TraceErrorBoundary><div className="trace-shell">
    <aside className="trace-sidebar"><div className="trace-brand"><div className="trace-brand-mark">T</div><div><div className="trace-brand-name">TRACE</div><div className="trace-muted" style={{fontSize:12,marginTop:2}}>Consultant OS</div></div></div><Tooltip.Provider delayDuration={350}><nav className="trace-nav">{nav.map(([id,label,Icon])=><Tooltip.Root key={id}><Tooltip.Trigger asChild><button data-active={active===id} onClick={()=>choose(id)}><Icon size={16} style={{verticalAlign:'-3px',marginRight:9}}/>{label}</button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="trace-tooltip" side="right" sideOffset={8}>{label}<Tooltip.Arrow className="trace-tooltip-arrow"/></Tooltip.Content></Tooltip.Portal></Tooltip.Root>)}</nav></Tooltip.Provider><button onClick={signOut} style={{all:'unset',cursor:'pointer',fontSize:12,color:'#888',padding:'10px 14px'}}>Keluar ({session.user.email})</button></aside>
    <main className="trace-main"><header className="trace-topbar"><div><strong>{title}</strong><div className="trace-muted" style={{fontSize:12}}>Business Intelligence · Consulting Workflow</div></div><button className="trace-command" aria-label="Command palette" title="Command palette" onClick={()=>{setCommandOpen(true);setCommandQuery('')}}><Command size={16}/><span className="trace-muted" style={{fontSize:12}}>Command</span></button></header>
    <section className="trace-content"><AnimatePresence mode="wait">
      <motion.div key={active} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}} transition={{duration:.18,ease:[.2,.7,.3,1]}}>
        {active==='health' ? <BusinessHealthView /> : active==='recovery' ? <DataRecovery /> : active==='finance' ? <FinanceEntry /> : active==='accounting' ? <AccountingView /> : active==='sales' ? <SalesView /> : active==='intake' ? <DataIntake /> : active==='diagnosis' ? <BusinessDiagnosis /> : active==='internal' ? <InternalDiagnosisView /> : active==='settings' ? <SettingsCenter /> : active==='command' ? <LeaderCommandCenterView /> : active==='team' ? <TeamView /> : active==='governance' ? <GovernanceView /> : active==='analytics' ? <AnalyticsView /> : active==='clients' ? <ClientsView /> : active==='business' ? <BusinessTwinView /> : active==='acquisition' ? <AcquisitionView /> : <OverviewLive />}
      </motion.div>
    </AnimatePresence></section>
    <nav className="trace-react-mobile-nav" aria-label="Navigasi cepat mobile">{mobile.map(([id,label,Icon])=><button key={id} className={active===id?'active':''} onClick={()=>choose(id)}><Icon size={18}/><span>{label}</span></button>)}</nav></main>
    {commandOpen&&<div className="trace-react-command-overlay" role="dialog" aria-modal="true" aria-label="TRACE Command Palette" onMouseDown={e=>{if(e.target===e.currentTarget)setCommandOpen(false)}}><div className="trace-react-command-box"><div className="trace-react-command-head"><Search size={17}/><input autoFocus value={commandQuery} onChange={e=>setCommandQuery(e.target.value)} placeholder="Cari modul TRACE…"/><button aria-label="Tutup command palette" onClick={()=>setCommandOpen(false)}><X size={17}/></button></div><div className="trace-react-command-list">{filtered.map(([id,label,Icon])=><button key={id} onClick={()=>choose(id)}><Icon size={17}/><span>{label}</span><kbd>↵</kbd></button>)}{filtered.length===0&&<div className="trace-react-command-empty">Modul tidak ditemukan.</div>}</div></div></div>}
  </div></TraceErrorBoundary>
}


function TraceOrbitHero(){
  const ref=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    const container=ref.current;
    if(!container) return;
    let disposed=false;
    let cleanup:(()=>void)|null=null;
    import('three').then((THREE)=>{
      if(disposed||!container) return;
      try{
        const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const width=container.clientWidth||320, height=container.clientHeight||200;
        const scene=new THREE.Scene();
        const camera=new THREE.PerspectiveCamera(45,width/height,0.1,100);
        camera.position.set(0,0,5.4);
        const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
        renderer.setSize(width,height);
        container.appendChild(renderer.domElement);

        const group=new THREE.Group();
        const icoGeo=new THREE.IcosahedronGeometry(1.5,1);
        const edges=new THREE.EdgesGeometry(icoGeo);
        const lineMat=new THREE.LineBasicMaterial({color:0xf9622c,transparent:true,opacity:.78});
        const wire=new THREE.LineSegments(edges,lineMat);
        group.add(wire);

        const count=140;
        const positions=new Float32Array(count*3);
        for(let i=0;i<count;i++){
          const r=2.15+(i%17)/16*0.55;
          const theta=(i*2.399963229728653)% (Math.PI*2);
          const phi=Math.acos(2*((i*0.618033988749895)%1)-1);
          positions[i*3]=r*Math.sin(phi)*Math.cos(theta);
          positions[i*3+1]=r*Math.sin(phi)*Math.sin(theta);
          positions[i*3+2]=r*Math.cos(phi);
        }
        const particleGeo=new THREE.BufferGeometry();
        particleGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
        const particleMat=new THREE.PointsMaterial({color:0xffb35a,size:0.045,transparent:true,opacity:.85});
        const points=new THREE.Points(particleGeo,particleMat);
        group.add(points);
        scene.add(group);

        const resize=()=>{
          const w=container.clientWidth||width, h=container.clientHeight||height;
          renderer.setSize(w,h);
          camera.aspect=w/h;
          camera.updateProjectionMatrix();
        };
        const resizeObserver=new ResizeObserver(resize);
        resizeObserver.observe(container);

        let frameId=0;
        const animate=()=>{
          group.rotation.y+=0.0026;
          group.rotation.x+=0.001;
          renderer.render(scene,camera);
          if(!reduceMotion) frameId=requestAnimationFrame(animate);
        };
        animate();

        cleanup=()=>{
          cancelAnimationFrame(frameId);
          resizeObserver.disconnect();
          icoGeo.dispose();edges.dispose();lineMat.dispose();
          particleGeo.dispose();particleMat.dispose();
          renderer.dispose();
          if(container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
        };
        if(disposed) cleanup();
      }catch{
        // WebGL unavailable/blocked — leave the glass panel empty rather than crash the page.
      }
    });
    return ()=>{disposed=true;cleanup?.();};
  },[]);
  return <div ref={ref} style={{width:'100%',height:'100%',minHeight:190}} aria-hidden="true"/>;
}

function BusinessHealthView(){
  const [clientId,setClientId]=useState(''); const [saveMessage,setSaveMessage]=useState(''); const [saving,setSaving]=useState(false);
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const live=useTraceCollections([],clientId?['finance','sales','pos_events','inventory_movements','inventory_items','inventory_recipes','alerts','anomalies']:[],clientId);
  const financeRecords:FinanceRecord[]=asArray(live.data.finance).filter((r):r is Record<string,unknown>=>!!r).map(r=>({id:String(r.id),period:String(r.period),amount:Number(r.amount),category:r.category as FinanceRecord['category'],outletId:r.outlet_id?String(r.outlet_id):undefined,evidence:r.evidence_source?{id:String(r.id),source:r.evidence_source as FinanceEvidence['source'],sourceRef:r.evidence_note?String(r.evidence_note):undefined}:undefined,accountLabel:r.account_label?String(r.account_label):undefined,statementSection:r.statement_section as FinanceStatementSection|undefined}));
  const scopedFinance=clientId?asArray(live.data.finance).filter(r=>typeof r==='object'&&r!==null&&String((r as any).client_id)===clientId).map(r=>({id:String((r as any).id),period:String((r as any).period),amount:Number((r as any).amount),category:(r as any).category as FinanceRecord['category'],outletId:(r as any).outlet_id?String((r as any).outlet_id):undefined,evidence:(r as any).evidence_source?{id:String((r as any).id),source:(r as any).evidence_source as FinanceEvidence['source']}:undefined})) : financeRecords;
  const periods=[...new Set(scopedFinance.map(r=>r.period))].sort(); const period=periods.at(-1)??''; const previous=periods.at(-2);
  const summary=summarizeFinance(scopedFinance,period);
  const events:POSEvent[]=asArray(live.data.pos_events).filter((e):e is Record<string,unknown>=>!!e && (!clientId||String((e as any).organization_id)===clientId)).map(e=>({id:String(e.id),organizationId:String(e.organization_id),outletId:e.outlet_id?String(e.outlet_id):undefined,employeeId:e.employee_id?String(e.employee_id):undefined,cashierId:e.cashier_id?String(e.cashier_id):undefined,productId:e.product_id?String(e.product_id):undefined,type:e.event_type as POSEvent['type'],amount:Number(e.amount),occurredAt:String(e.occurred_at),sourceRecordId:e.source_record_id?String(e.source_record_id):undefined}));
  const pos=analyzePOSHealth(events);
  const movements:InventoryMovement[]=asArray(live.data.inventory_movements).filter((e):e is Record<string,unknown>=>!!e && (!clientId||String((e as any).organization_id)===clientId)).map(e=>({id:String(e.id),itemId:String(e.item_id),outletId:e.outlet_id?String(e.outlet_id):undefined,type:e.movement_type as InventoryMovement['type'],qty:Number(e.qty),unitCost:e.unit_cost===null||e.unit_cost===undefined?null:Number(e.unit_cost),occurredAt:String(e.occurred_at)}));
  const recipes:RecipeComponent[]=asArray(live.data.inventory_recipes).map(e=>({productId:String((e as any).product_id),itemId:String((e as any).item_id),qtyPerSale:Number((e as any).qty_per_sale)}));
  const sales=asArray(live.data.sales).filter((e):e is Record<string,unknown>=>!!e && (!clientId||String((e as any).client_id)===clientId)).map(e=>({productId:String(e.product_id??''),qty:Number(e.qty),id:String(e.id)})).filter(e=>e.productId);
  const inventory=calculateInventoryVariance(movements,recipes,sales);
  const evidence=[{id:'finance',metric:'Financial data',status:summary.recordCount?'available':'unavailable',value:summary.operatingProfit,period,source:'Supabase trace_finance_records'} as const,{id:'pos',metric:'POS events',status:events.length?'available':'unavailable',value:events.length,source:'Supabase trace_pos_events'} as const,{id:'inventory',metric:'Inventory movements',status:movements.length?'available':'unavailable',value:movements.length,source:'Supabase trace_inventory_movements'} as const];
  const health=buildBusinessHealth({finance:summary,pos:events.length?pos:null,inventory:inventory.length?inventory:undefined,evidence:[...evidence]});
  const alerts=buildAlerts(pos.anomalies,inventory);
  const persistedAlerts=asArray(live.data.alerts).filter((a):a is Record<string,unknown>=>!!a && (!clientId||String((a as any).organization_id)===clientId));
  const saveSnapshot=async()=>{
    if(!clientId||!period||saving)return; setSaving(true); setSaveMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const year=Number(period.slice(0,4)), month=Number(period.slice(5,7)); const periodEnd=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10); const {data:healthRow,error}=await supabase.rpc('trace_save_business_health_snapshot',{p_organization_id:clientId,p_outlet_id:null,p_period_start:`${period}-01`,p_period_end:periodEnd,p_score:health.score,p_dimensions:health.dimensions,p_evidence:evidence,p_confidence_pct:health.confidencePct,p_methodology:'Business Health v68: weighted available dimensions; missing evidence excluded from score.'});
      if(error) throw error;
      for(const a of pos.anomalies.slice(0,20)){
        const {data:anomaly,error:ae}=await supabase.rpc('trace_record_anomaly',{p_organization_id:clientId,p_outlet_id:null,p_category:a.eventType==='cash_discrepancy'?'cash':a.eventType==='price_override'?'price':a.eventType,p_code:a.code,p_title:a.title,p_severity:a.severity,p_observed:a.observed,p_baseline:a.baseline,p_ratio_pct:a.ratioPct,p_impact_min:a.financialImpact,p_impact_max:a.financialImpact,p_methodology:a.explanation,p_confidence:a.confidence,p_evidence_ids:a.evidenceIds,p_period_start:null,p_period_end:null});
        if(ae) throw ae;
        if(anomaly?.id){ const {error:ale}=await supabase.rpc('trace_create_business_alert',{p_organization_id:clientId,p_anomaly_id:anomaly.id,p_severity:a.severity,p_title:a.title,p_what:a.explanation,p_why:'Pattern dibandingkan dengan evidence yang tersedia.',p_impact:a.financialImpact,p_confidence:a.confidence,p_evidence_ids:a.evidenceIds}); if(ale) throw ale; }
      }
      setSaveMessage(healthRow?'Snapshot health dan findings tersimpan ke Supabase.':'Snapshot tersimpan.');
    }catch(e){setSaveMessage(e instanceof Error?e.message:'Gagal menyimpan health snapshot.');} finally{setSaving(false);}
  };
  const transitionAlert=async(id:string,status:'ACKNOWLEDGED'|'RESOLVED'|'DISMISSED')=>{try{const supabase=getReactSupabase();if(!supabase)throw new Error('Supabase belum dikonfigurasi.');const {error}=await supabase.rpc('trace_transition_business_alert',{p_alert_id:id,p_status:status,p_note:null});if(error)throw error;setSaveMessage(`Alert ${status.toLowerCase()} berhasil.`);}catch(e){setSaveMessage(e instanceof Error?e.message:'Perubahan alert gagal.');}};
  const dimTone=(v:number|null)=>v===null?'neutral':v>=80?'positive':v>=60?'warning':'danger';
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-section-kicker">BUSINESS OPERATING INTELLIGENCE</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Business Health — apa yang terjadi, kenapa, dan apa yang perlu dilakukan.</h1><div className="trace-muted">Score dihitung hanya dari evidence yang tersedia. Data yang belum ada tidak diperlakukan sebagai nol.</div></div>
    <div className="trace-card"><label>Klien / Scope<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}><option value="">Pilih klien — wajib sebelum data dimuat</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)} · {String(c.id)}</option>)}</select></label>{clientId&&<div className="trace-muted" style={{fontSize:11,marginTop:7}}>Scope terkunci ke klien ini. API juga menerapkan filter server-side.</div>}{!period&&<div className="trace-muted" style={{marginTop:8}}>Belum ada periode finance yang tersedia untuk scope ini.</div>}</div>
    {live.loading?<div className="trace-card">Memuat data evidence…</div>:live.error?<div className="trace-recovery-banner">Data gagal dimuat: {live.error}</div>:<>
      <div className="trace-kpis">
        <div className="trace-card"><div className="trace-muted">Business Health</div><div style={{fontSize:34,fontWeight:850,marginTop:7}}>{health.score===null?'—':`${health.score}/100`}</div><div className="trace-badge" data-tone={dimTone(health.score)}>Evidence {health.confidencePct===null?'—':`${health.confidencePct}%`}</div></div>
        <div className="trace-card"><div className="trace-muted">Revenue · {period||'—'}</div><div style={{fontSize:24,fontWeight:800,marginTop:7}}>{fmtFieldAmount(summary.revenue)}</div><div className="trace-muted" style={{fontSize:11}}>vs {previous||'—'}</div></div>
        <div className="trace-card"><div className="trace-muted">Operating Profit</div><div style={{fontSize:24,fontWeight:800,marginTop:7}}>{fmtFieldAmount(summary.operatingProfit)}</div><div className="trace-muted" style={{fontSize:11}}>{summary.operatingMarginPct===null?'margin belum dapat dihitung':`${summary.operatingMarginPct.toFixed(1)}% margin`}</div></div>
        <div className="trace-card"><div className="trace-muted">POS Health</div><div style={{fontSize:24,fontWeight:800,marginTop:7}}>{pos.score===null?'—':`${pos.score}/100`}</div><div className="trace-muted" style={{fontSize:11}}>{pos.anomalies.length} anomaly terdeteksi</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1.2fr) minmax(280px,.8fr)',gap:16}}>
        <div className="trace-card"><strong>Kenapa score seperti ini?</strong><div style={{display:'grid',gap:9,marginTop:12}}>{health.dimensions.map(d=><div key={d.key} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:12,padding:'9px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{d.label}</span><strong>{d.value===null?'INSUFFICIENT DATA':`${d.value}/100`}</strong></div>)}</div></div>
        <div className="trace-card"><strong>Prioritas tindakan</strong><div style={{display:'grid',gap:10,marginTop:12}}>{alerts.length?alerts.slice(0,5).map(a=><div key={a.id} style={{padding:11,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}><div className="trace-badge" data-tone={a.severity==='CRITICAL'||a.severity==='HIGH'?'danger':a.severity==='MEDIUM'?'warning':'neutral'}>{a.severity}</div><div style={{fontWeight:750,marginTop:6}}>{a.title}</div><div className="trace-muted" style={{fontSize:11,marginTop:4}}>{a.why}</div></div>):<div className="trace-muted">Tidak ada alert dari evidence yang tersedia.</div>}</div></div>
      </div>
      {persistedAlerts.length>0&&<div className="trace-card"><strong>Alert tersimpan</strong><div style={{display:'grid',gap:8,marginTop:10}}>{persistedAlerts.slice(0,10).map(a=><div key={String(a.id)} style={{padding:11,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong>{String(a.title)}</strong><span className="trace-badge" data-tone={String(a.severity)==='HIGH'||String(a.severity)==='CRITICAL'?'danger':'warning'}>{String(a.status)}</span></div><div className="trace-muted" style={{fontSize:11,marginTop:4}}>{String(a.why)}</div>{['OPEN','ACKNOWLEDGED'].includes(String(a.status))&&<div style={{display:'flex',gap:7,marginTop:8}}><button className="trace-icon-btn" onClick={()=>transitionAlert(String(a.id),'ACKNOWLEDGED')}>Acknowledge</button><button className="trace-icon-btn" onClick={()=>transitionAlert(String(a.id),'RESOLVED')}>Resolve</button><button className="trace-icon-btn" onClick={()=>transitionAlert(String(a.id),'DISMISSED')}>Dismiss</button></div>}</div>)}</div></div>}
      <div className="trace-card"><strong>Evidence & limitations</strong><div style={{display:'grid',gap:7,marginTop:10}}>{health.evidence.missing.map(x=><div key={x} className="trace-muted">Belum tersedia: {x}</div>)}{summary.missingMetrics.map(x=><div key={x} className="trace-muted">Finance belum lengkap: {x}</div>)}{inventory.filter(v=>v.status==='INSUFFICIENT_DATA').length>0&&<div className="trace-muted">Inventory: recipe/BOM belum lengkap untuk sebagian item; variance tidak dipaksakan.</div>}<div className="trace-muted">Anomaly bukan bukti fraud. Setiap temuan perlu investigasi dengan evidence asli.</div></div></div>
    </>}
  </div>
}

function OverviewLive(){
  const live=useTraceCollections(['trace-companies','trace-brands','trace-outlets','trace-clients']);
  const cards=[['Companies','trace-companies'],['Brands','trace-brands'],['Outlets','trace-outlets'],['Active Clients','trace-clients']];
  return <><div className="trace-card" style={{display:'flex',gap:20,alignItems:'stretch',flexWrap:'wrap'}}>
    <div style={{flex:'1 1 260px',display:'flex',gap:10,alignItems:'center'}}><Activity size={18}/><div><strong>Business Twin · Live Data</strong><div className="trace-muted">Angka berasal dari Supabase; jika sumber gagal, TRACE menampilkan unavailable.</div></div></div>
    <div className="trace-glass" style={{flex:'0 0 260px',height:190,borderRadius:16,overflow:'hidden',position:'relative'}}><TraceOrbitHero/></div>
  </div><div className="trace-kpis" style={{marginTop:14}}>{cards.map(([name,key])=><div className="trace-card" key={key}><div className="trace-muted" style={{fontSize:12}}>{name}</div><div style={{fontSize:28,fontWeight:700,marginTop:8}}>{live.loading?'…':live.error?'—':asArray(live.data[key]).length}</div><div className="trace-muted" style={{fontSize:12,marginTop:5}}>{live.error||'Dibaca dari sumber production dengan session pengguna.'}</div></div>)}</div></>;
}

function healthTone(h:HealthStatus){return h==='critical'?'danger':h==='blocked'?'danger':h==='attention'?'warning':h==='healthy'?'positive':'neutral'}
function LeaderCommandCenterView(){
  const live=useTraceCollections(['trace-clients','trace-companies','trace-brands','trace-outlets']);
  const clients=asArray(live.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const snapLive=useLeaderSnapshots(clients);
  const center=buildLeaderCommandCenter(snapLive.snapshots);
  const label=(key:string)=>live.loading?'Memuat…':live.error?'—':String(asArray(live.data[key]).length);
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>LEADER · COMMAND CENTER</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Satu layar untuk melihat kesehatan seluruh bisnis.</h1><div className="trace-muted">Status hanya berubah berdasarkan data yang tersedia. Tidak ada angka dummy yang dipakai sebagai kondisi bisnis.</div></div>
    <div className="trace-kpis">{[['Total Client',label('trace-clients')],['Companies',label('trace-companies')],['Brands',label('trace-brands')],['Outlets',label('trace-outlets')]].map(([k,v])=><div className="trace-card" key={String(k)}><div className="trace-muted" style={{fontSize:12}}>{k}</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{v}</div></div>)}</div>
    {snapLive.loading?<div className="trace-card trace-muted">Menghitung health untuk {clients.length} klien…</div>:<>
      <div className="trace-kpis">
        <div className="trace-card"><div className="trace-muted">Healthy</div><div style={{fontSize:28,fontWeight:800,marginTop:6}}>{center.counts.healthy}</div></div>
        <div className="trace-card"><div className="trace-muted">Attention</div><div style={{fontSize:28,fontWeight:800,marginTop:6}}>{center.counts.attention}</div></div>
        <div className="trace-card"><div className="trace-muted">Critical</div><div style={{fontSize:28,fontWeight:800,marginTop:6}}>{center.counts.critical}</div></div>
        <div className="trace-card"><div className="trace-muted">Unknown / no evidence</div><div style={{fontSize:28,fontWeight:800,marginTop:6}}>{center.counts.unknown}</div></div>
      </div>
      <div className="trace-card"><strong>Prioritas klien</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Diurutkan dari health paling kritis; coverage rata-rata evidence {center.dataQuality.averageCoveragePct===null?'—':`${center.dataQuality.averageCoveragePct}%`}.</div>
        <div style={{display:'grid',gap:8,marginTop:12}}>{center.priorityClients.map(c=><div key={c.clientId} style={{padding:12,border:'1px solid rgba(23,23,23,.08)',borderRadius:11}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><strong style={{fontSize:13}}>{c.clientName}</strong><span className="trace-badge" data-tone={healthTone(c.health)}>{c.health.toUpperCase()}</span></div><div className="trace-muted" style={{fontSize:11,marginTop:5}}>{c.healthReason}</div><div className="trace-muted" style={{fontSize:11,marginTop:3}}>Open actions {c.openActions} · Blocked {c.blockedActions} · Coverage {c.dataCoveragePct===null?'—':`${c.dataCoveragePct}%`}</div></div>)}{center.priorityClients.length===0&&<div className="trace-muted">Belum ada klien.</div>}</div>
      </div>
    </>}
    <div className="trace-card"><strong>Production data status</strong><div className="trace-muted" style={{marginTop:7}}>{live.error||(!live.loading&&live.unavailable.length?`Sebagian sumber tidak tersedia: ${live.unavailable.join(', ')}.`:'Health dihitung dari finance, POS, dan inventory production per klien — sama seperti Business Health, dijalankan untuk setiap klien.')}</div></div>
  </div>
}
function TeamView(){
  const [clientId,setClientId]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const live=useTraceCollections(['trace-team'],clientId?['tasks']:[],clientId);
  const members=asArray(live.data['trace-team']);
  const tasks=asArray(live.data['tasks']);
  const taskObjects=tasks.filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null);
  const open=taskObjects.filter(t=>['open','in_progress','blocked'].includes(String(t.status))).length;
  const done=taskObjects.filter(t=>String(t.status)==='done').length;
  return <div style={{display:'grid',gap:16}}><div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>TEAM · COLLABORATION OS</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Ownership jelas, perubahan dapat ditelusuri.</h1><div className="trace-muted">Anggota TRACE bersifat global; task selalu ditampilkan dalam scope satu klien agar pekerjaan tidak tertukar.</div></div><div className="trace-card"><label>Klien / Scope<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}><option value="">Pilih klien untuk melihat task</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label></div><div className="trace-kpis"><div className="trace-card"><div className="trace-muted">Anggota</div><b style={{fontSize:28}}>{clientsLive.loading?'…':clientsLive.error?'—':members.length}</b></div><div className="trace-card"><div className="trace-muted">Task aktif</div><b style={{fontSize:28}}>{clientId?(live.loading?'…':live.error?'—':open):'—'}</b></div><div className="trace-card"><div className="trace-muted">Task selesai</div><b style={{fontSize:28}}>{clientId?(live.loading?'…':live.error?'—':done):'—'}</b></div></div><div className="trace-card"><strong>Production collaboration</strong><div className="trace-muted" style={{marginTop:7}}>{!clientId?'Pilih klien. TRACE tidak memuat task lintas-klien ke layar ini.':live.error||(!live.loading&&live.unavailable.length?`Sumber tidak tersedia: ${live.unavailable.join(', ')}.`:'Task relational tersedia untuk scope klien terpilih.')}</div>{clientId&&!live.loading&&!live.error&&taskObjects.slice(0,20).map((task,index)=><div key={String(task.id??index)} style={{padding:'11px 0',borderTop:'1px solid rgba(23,23,23,.08)',fontSize:13}}><div style={{display:'flex',justifyContent:'space-between',gap:10}}><strong>{String(task.title??'Untitled task')}</strong><span className="trace-muted">{String(task.status??'unknown')} · {String(task.priority??'')}</span></div><div className="trace-muted" style={{fontSize:11,marginTop:4}}>Client: {String(task.client_id??clientId)} · Due: {String(task.due_date??'—')}</div></div>)}</div></div>
}
function GovernanceView(){
  const live=useTraceCollections([],['audit']);
  const rows=asArray(live.data['audit']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null);
  return <div style={{display:'grid',gap:16}}><div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>GOVERNANCE · AUDIT</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Setiap perubahan punya jejak.</h1><div className="trace-muted">Audit dibaca read-only dari append-only production log. Audit data belum terhubung jika endpoint production unavailable. Tidak ada event contoh yang dibuat untuk mengisi layar.</div></div><div className="trace-card"><strong>{live.loading?'Memuat audit…':live.error?'Audit tidak tersedia':`${rows.length} event terbaru`}</strong><div className="trace-muted" style={{marginTop:7}}>{live.error||(!live.loading&&live.unavailable.length?'Sebagian sumber audit tidak tersedia.':'Evidence berasal dari Supabase.')}</div>{!live.loading&&!live.error&&rows.slice(0,30).map((row,index)=>{const diff=auditDiff((row.before_data as Record<string,unknown>)??null,(row.after_data as Record<string,unknown>)??null);return <details key={String(row.id??index)} style={{padding:'11px 0',borderTop:'1px solid rgba(23,23,23,.08)'}}><summary style={{cursor:'pointer',fontWeight:700}}>{String(row.action??'event')} · {String(row.entity_type??'entity')} · {String(row.entity_id??'—')} <span className="trace-muted">{String(row.created_at??'')}</span></summary><div style={{fontSize:12,marginTop:8}}><b>Reason:</b> {String(row.reason??'—')}</div>{diff.length===0?<div className="trace-muted" style={{fontSize:12,marginTop:6}}>Tidak ada field yang berubah antara before dan after.</div>:<div style={{marginTop:8,display:'grid',gap:6}}>{diff.map(d=><div key={d.field} style={{fontSize:12,padding:'7px 9px',borderRadius:8,background:'#fafaf8'}}><b>{d.field}</b>: <span style={{color:'#b91c1c'}}>{d.before===undefined?'—':JSON.stringify(d.before)}</span> → <span style={{color:'#15803d'}}>{d.after===undefined?'—':JSON.stringify(d.after)}</span></div>)}</div>}</details>})}</div></div>
}


function AnalyticsView(){
  const live=useTraceCollections(['trace-companies','trace-brands','trace-outlets','trace-clients'],['audit']);
  const labels:Record<string,string>={'trace-companies':'Companies','trace-brands':'Brands','trace-outlets':'Outlets','trace-clients':'Clients'};
  const counts=useMemo(()=>Object.keys(labels).map(key=>({key,label:labels[key],value:asArray(live.data[key]).length})),[live.data]);
  const kpis:KPIInput[]=useMemo(()=>counts.map(c=>({id:c.key,name:c.label,current:(live.loading||live.error)?null:c.value,previous:null,unit:'number',evidence:[{source:'Supabase · trace-data',period:'current',value:c.value}],status:(live.loading||live.error)?'unavailable':'available'})),[counts,live.loading,live.error]);
  const results:KPIResult[]=useMemo(()=>calculateKPIs(kpis),[kpis]);
  const auditRows=asArray(live.data['audit']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null);
  const activityByDay=useMemo(()=>{const map=new Map<string,number>();auditRows.forEach(r=>{const d=String(r.created_at??'').slice(0,10);if(d)map.set(d,(map.get(d)||0)+1);});return [...map.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-14).map(([date,count])=>({date,count}));},[auditRows]);
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>ANALYTICS · KPI ENGINE</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Angka yang bisa ditelusuri sampai sumbernya.</h1><div className="trace-muted">KPI dihitung dari data live Supabase. Karena snapshot periode sebelumnya belum tersimpan, kolom pembanding ditandai tidak tersedia — bukan nol.</div></div>
    <div className="trace-kpis">{results.map(k=><Popover.Root key={k.id}><Popover.Trigger asChild><div className="trace-card" style={{cursor:'pointer',textAlign:'left'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span className="trace-muted" style={{fontSize:12}}>{k.name}</span><Info size={13} className="trace-muted"/></div><div style={{fontSize:28,fontWeight:800,marginTop:8}}>{k.current==null?'—':k.current.toLocaleString('id-ID')}</div><div className="trace-muted" style={{fontSize:11,marginTop:5}}>{k.conclusion}</div></div></Popover.Trigger><Popover.Portal><Popover.Content className="trace-popover" sideOffset={8}><strong>{k.name}</strong><div className="trace-muted" style={{marginTop:4}}>Formula: {k.formula}</div><div style={{marginTop:6}}>{k.evidence.map((e,i)=><div key={i}>Source: {e.source} · {e.period}</div>)}</div><Popover.Arrow style={{fill:'#fff'}}/></Popover.Content></Popover.Portal></Popover.Root>)}</div>
    <div className="trace-card"><strong>Distribusi entitas saat ini</strong><div style={{width:'100%',height:260,marginTop:14}}>{live.loading?<div className="trace-muted">Memuat…</div>:live.error?<div className="trace-muted">{live.error}</div>:<ResponsiveContainer><BarChart data={counts}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f5"/><XAxis dataKey="label" tick={{fontSize:12}}/><YAxis allowDecimals={false} tick={{fontSize:12}}/><RTooltip contentStyle={{borderRadius:10,border:"1px solid #e6e8f0",boxShadow:"0 20px 40px -24px rgba(16,24,40,.35)",fontSize:12}} labelStyle={{fontWeight:700}}/><Bar dataKey="value" fill="#f9622c" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer>}</div></div>
    <div className="trace-card"><strong>Aktivitas governance · 14 hari terakhir</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Dihitung dari audit log production, dikelompokkan per tanggal.</div><div style={{width:'100%',height:260,marginTop:14}}>{live.loading?<div className="trace-muted">Memuat…</div>:activityByDay.length===0?<div className="trace-muted">Belum ada event audit pada rentang ini.</div>:<ResponsiveContainer><LineChart data={activityByDay}><CartesianGrid strokeDasharray="3 3" stroke="#eef0f5"/><XAxis dataKey="date" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:12}}/><RTooltip contentStyle={{borderRadius:10,border:"1px solid #e6e8f0",boxShadow:"0 20px 40px -24px rgba(16,24,40,.35)",fontSize:12}} labelStyle={{fontWeight:700}}/><Line type="monotone" dataKey="count" stroke="#f9622c" strokeWidth={2.5} dot={{r:3}}/></LineChart></ResponsiveContainer>}</div></div>
  </div>
}

/** Acquisition keeps the proven discovery UI as an embedded module, but it is
 *  mounted inside the authenticated TRACE shell with a persistence bridge.
 *  Lead discovery is global internal acquisition data until a lead is
 *  explicitly converted into a client; converted client data then follows the
 *  normal TRACE client-scope boundary. */
function AcquisitionView(){
  return <div style={{display:'flex',flexDirection:'column',gap:16,height:'calc(100vh - 140px)'}}>
    <div className="trace-card" style={{padding:'14px 20px',flex:'0 0 auto'}}><div className="trace-muted" style={{fontSize:12}}>ACQUISITION · INTERNAL</div><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Discovery dan pipeline berjalan sebagai modul internal TRACE. Lead tersimpan melalui authenticated persistence bridge; setelah dikonversi menjadi client, data operasional mengikuti client scope TRACE.</div></div>
    <iframe title="TRACE Acquisition OS" src="/acquisition/index.html?embedded=1" style={{flex:'1 1 auto',minHeight:0,width:'100%',border:'1px solid rgba(23,23,23,.08)',borderRadius:14,background:'#f4f5f9'}}/>
  </div>
}

function ClientsView(){
  const live=useTraceCollections(['trace-clients']);
  const clients=asArray(live.data['trace-clients']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null);
  const [query,setQuery]=useState('');
  const filtered=clients.filter(c=>JSON.stringify(c).toLowerCase().includes(query.toLowerCase()));
  const [formOpen,setFormOpen]=useState(false);
  const [name,setName]=useState(''); const [category,setCategory]=useState(''); const [area,setArea]=useState(''); const [contact,setContact]=useState('');
  const [source,setSource]=useState<'manual'|'acquisition'>('manual');
  const [saving,setSaving]=useState(false); const [formMessage,setFormMessage]=useState('');
  const addClient=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!name.trim()||saving)return;
    setSaving(true); setFormMessage('');
    try{
      const existing=await readTraceKvArray('trace_os::trace-clients');
      const normalized=name.trim().toLowerCase();
      if(existing.some(c=>String((c as any).name||(c as any).business_name||'').trim().toLowerCase()===normalized)) throw new Error('Klien dengan nama ini sudah ada.');
      const newClient={id:`client_${crypto.randomUUID()}`,name:name.trim(),category:category.trim()||undefined,area:area.trim()||undefined,contact:contact.trim()||undefined,createdAt:Date.now(),source};
      await writeTraceKv('trace_os::trace-clients',[...existing,newClient]);
      setName('');setCategory('');setArea('');setContact('');setSource('manual');setFormOpen(false);setFormMessage('Klien tersimpan. Refresh untuk melihat di daftar.');
      location.reload();
    }catch(err){ setFormMessage(err instanceof Error?err.message:'Klien gagal disimpan.'); }
    finally{ setSaving(false); }
  };
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26,display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:16,flexWrap:'wrap'}}><div><div className="trace-muted" style={{fontSize:12}}>KLIEN</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Daftar klien dari sumber production.</h1><div className="trace-muted">Data dibaca read-only dari Supabase dengan session pengguna.</div></div><button className="trace-button" onClick={()=>setFormOpen(v=>!v)}>{formOpen?'Batal':'+ Tambah Klien'}</button></div>
    {formOpen&&<form onSubmit={addClient} className="trace-card" style={{display:'grid',gap:10,gridTemplateColumns:'1fr 1fr'}}>
      <label style={{gridColumn:'1 / -1',fontSize:13}}>Nama klien<input required value={name} onChange={e=>setName(e.target.value)} style={inputStyle} placeholder="Nama bisnis"/></label>
      <label style={{fontSize:13}}>Kategori<input value={category} onChange={e=>setCategory(e.target.value)} style={inputStyle} placeholder="F&B, Retail, dst"/></label>
      <label style={{fontSize:13}}>Area<input value={area} onChange={e=>setArea(e.target.value)} style={inputStyle} placeholder="Kota / wilayah"/></label>
      <label style={{fontSize:13}}>Kontak<input value={contact} onChange={e=>setContact(e.target.value)} style={inputStyle} placeholder="No. HP / email"/></label>
      <label style={{fontSize:13}}>Sumber<select value={source} onChange={e=>setSource(e.target.value as typeof source)} style={inputStyle}><option value="manual">Manual</option><option value="acquisition">Acquisition</option></select></label>
      <div style={{gridColumn:'1 / -1',display:'flex',gap:10,alignItems:'center'}}><button type="submit" className="trace-button" disabled={saving||!name.trim()}>{saving?'Menyimpan…':'Simpan klien'}</button>{formMessage&&<span className="trace-muted" style={{fontSize:12}}>{formMessage}</span>}</div>
    </form>}
    <div className="trace-card"><input placeholder="Cari klien…" value={query} onChange={e=>setQuery(e.target.value)} style={{maxWidth:320}}/>
      {live.loading?<div className="trace-muted" style={{marginTop:12}}>Memuat…</div>:live.error?<div className="trace-muted" style={{marginTop:12}}>{live.error}</div>:filtered.length===0?<div className="trace-muted" style={{marginTop:12}}>Tidak ada klien yang cocok.</div>:<div style={{marginTop:14,display:'grid',gap:8}}>{filtered.map((c,i)=><Dialog.Root key={String(c.id??i)}><Dialog.Trigger asChild><button style={{all:'unset',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',border:'1px solid rgba(23,23,23,.08)',borderRadius:11,width:'100%'}}><div><strong style={{fontSize:13}}>{String(c.name??c.business_name??'Untitled client')}</strong><div className="trace-muted" style={{fontSize:11,marginTop:2}}>{String(c.status??c.stage??'—')}</div></div><ArrowRight size={15} className="trace-muted"/></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="trace-dialog-overlay"/><Dialog.Content className="trace-dialog-content"><Dialog.Close className="trace-dialog-close trace-icon-btn"><X size={16}/></Dialog.Close><Dialog.Title asChild><h2>{String(c.name??c.business_name??'Untitled client')}</h2></Dialog.Title><Dialog.Description asChild><div className="trace-muted" style={{fontSize:12,marginBottom:12}}>Field mentah sebagaimana tersimpan di production.</div></Dialog.Description><div style={{display:'grid',gap:7,fontSize:13}}>{Object.entries(c).map(([k,v])=><div key={k} style={{display:'flex',justifyContent:'space-between',gap:12,padding:'7px 0',borderTop:'1px solid rgba(23,23,23,.06)'}}><span className="trace-muted">{k}</span><span style={{textAlign:'right'}}>{v===null||v===undefined?'—':String(v)}</span></div>)}</div></Dialog.Content></Dialog.Portal></Dialog.Root>)}</div>}
    </div>
  </div>
}

function BusinessTwinView(){
  const [clientId,setClientId]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const live=useTraceCollections([],clientId?['tasks']:[],clientId);
  const [error,setError]=useState('');
  const [localTasks,setLocalTasks]=useState<CollaborationTask[]|null>(null);
  const [newTitle,setNewTitle]=useState(''); const [newPriority,setNewPriority]=useState<'P0'|'P1'|'P2'|'P3'>('P2'); const [creating,setCreating]=useState(false);
  const columns:CollaborationStatus[]=['open','in_progress','blocked','done'];
  const loadedTasks=useMemo<CollaborationTask[]>(()=>asArray(live.data.tasks).filter((x):x is Record<string,unknown>=>!!x).map(x=>({id:String(x.id),clientId:String(x.client_id??''),title:String(x.title??''),owner:String(x.owner_user_id??''),createdBy:String(x.created_by??''),status:x.status as CollaborationStatus,priority:x.priority as CollaborationTask['priority'],dueDate:x.due_date?String(x.due_date):undefined,dependencies:Array.isArray(x.dependencies)?x.dependencies.map(String):[],evidenceIds:Array.isArray(x.evidence_ids)?x.evidence_ids.map(String):[],updatedAt:String(x.updated_at??''),version:Number(x.version??1)})),[live.data.tasks]);
  useEffect(()=>{if(!live.loading)setLocalTasks(loadedTasks);},[live.loading,loadedTasks]);
  useEffect(()=>{setLocalTasks(null);setError('');},[clientId]);
  const tasks=localTasks??loadedTasks;
  const summary=summarizeCollaboration(tasks);
  const move=async(task:CollaborationTask,status:CollaborationStatus)=>{try{const supabase=await requireReactSession();const {data,error:e}=await supabase.rpc('trace_transition_collaboration_task',{p_task_id:task.id,p_status:status,p_expected_version:task.version,p_evidence_ids:task.evidenceIds,p_reason:'Business Twin status transition'});if(e)throw e;if(data){setLocalTasks(prev=>(prev??loadedTasks).map(x=>x.id===task.id?{...x,status:data.status as CollaborationStatus,version:Number(data.version??x.version+1),updatedAt:String(data.updated_at??new Date().toISOString())}:x));} setError('');}catch(e){setError(e instanceof Error?e.message:'Transisi task ditolak.');}};
  const createTask=async()=>{if(!clientId||!newTitle.trim()||creating)return;setCreating(true);setError('');try{const supabase=await requireReactSession();const user=(await supabase.auth.getUser()).data.user;if(!user)throw new Error('Session Supabase tidak tersedia.');const {data,error:e}=await supabase.rpc('trace_create_collaboration_task',{p_client_id:clientId,p_title:newTitle.trim(),p_owner_user_id:user.id,p_priority:newPriority,p_evidence_ids:[]});if(e)throw e;setNewTitle('');if(data)setLocalTasks(prev=>[...(prev??loadedTasks),{id:String(data.id),clientId, title:newTitle.trim(),owner:user.id,createdBy:user.id,status:'open',priority:newPriority,dependencies:[],evidenceIds:[],updatedAt:String(data.updated_at??new Date().toISOString()),version:Number(data.version??1)}]);}catch(e){setError(e instanceof Error?e.message:'Task gagal dibuat.');}finally{setCreating(false)}};
  return <div style={{display:'grid',gap:16}}><div className="trace-card trace-hero"><div className="trace-section-kicker">BUSINESS TWIN · OPERATIONS</div><h1>Kerjaan tim dan SOP dalam satu papan.</h1><p className="trace-muted">Scope klien wajib dipilih. Task tidak pernah dimuat lintas-klien pada papan kerja.</p><div className="trace-hero-pills"><span>CLIENT SCOPED</span><span>VERSION LOCK</span><span>AUDITED</span></div></div><div className="trace-card" style={{display:'grid',gap:10}}><label>Klien / Scope<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label><strong>Buat task baru</strong><div style={{display:'grid',gridTemplateColumns:'2fr auto auto',gap:8}}><input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Judul pekerjaan" disabled={!clientId}/><select value={newPriority} onChange={e=>setNewPriority(e.target.value as typeof newPriority)} disabled={!clientId}><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select><button className="trace-button" disabled={creating||!clientId||!newTitle.trim()} onClick={createTask}>{creating?'Menyimpan…':'Tambah task'}</button></div></div>{error&&<div className="trace-alert">{error}</div>}{!clientId?<div className="trace-card trace-muted">Pilih klien untuk membuka papan pekerjaan.</div>:live.loading?<div className="trace-card trace-muted">Memuat task production…</div>:live.error?<div className="trace-card trace-alert">{live.error}</div>:<><div className="trace-kpis"><div className="trace-card"><div className="trace-muted">OPEN</div><div style={{fontSize:26,fontWeight:800,marginTop:6}}>{summary.open}</div></div><div className="trace-card"><div className="trace-muted">IN PROGRESS</div><div style={{fontSize:26,fontWeight:800,marginTop:6}}>{summary.inProgress}</div></div><div className="trace-card"><div className="trace-muted">BLOCKED</div><div style={{fontSize:26,fontWeight:800,marginTop:6}}>{summary.blocked}</div></div><div className="trace-card"><div className="trace-muted">DONE</div><div style={{fontSize:26,fontWeight:800,marginTop:6}}>{summary.done}</div></div></div><div className="trace-kanban">{columns.map(col=><div key={col} className="trace-kanban-col"><h4>{col.replace('_',' ')}</h4>{tasks.filter(t=>t.status===col).map(t=><div key={t.id} className="trace-kanban-card"><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start'}}><strong style={{fontSize:12.5}}>{t.title}</strong><DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="trace-icon-btn"><Settings size={13}/></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="trace-dropdown" sideOffset={6}>{columns.filter(c=>c!==t.status).map(c=><DropdownMenu.Item key={c} className="trace-dropdown-item" onSelect={()=>void move(t,c)}>Pindah ke {c.replace('_',' ')}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div><div className="trace-muted" style={{fontSize:11,marginTop:6}}>{t.owner} · {t.priority} · v{t.version}</div></div>)}{tasks.filter(t=>t.status===col).length===0&&<div className="trace-muted" style={{fontSize:11,padding:'6px 4px'}}>Belum ada task.</div>}</div>)}</div></>}</div>
}
function InternalDiagnosisView(){
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const snapLive=useLeaderSnapshots(clients);
  const center=snapLive.loading?undefined:buildLeaderCommandCenter(snapLive.snapshots);
  const report=diagnoseInternalSystem({commandCenter:center});
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>TRACE · INTERNAL DIAGNOSIS</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Kesehatan sistem harus dibuktikan, bukan diasumsikan.</h1><div className="trace-muted">Finding dikategorikan berdasarkan evidence yang benar-benar tersedia (Command Center per-klien). Status blocked tidak diperlakukan sebagai sehat. Diagnostic runtime/source-level (Security Guard, Evolution Advisor) masih butuh sensor terpisah — lihat Settings → AI Engineer.</div></div>
    <div className="trace-card"><strong>Current conclusion</strong><div style={{marginTop:8}}>{report.conclusion}</div>{report.limitations.map(x=><div className="trace-muted" key={x} style={{marginTop:8}}>{x}</div>)}</div>
    {report.findings.length===0 ? <div className="trace-card"><strong>Belum ada evidence internal yang diberikan.</strong><div className="trace-muted" style={{marginTop:7}}>Ini bukan PASS. Hubungkan telemetry, diagnostic snapshot, Command Center, dan workflow evidence untuk mendapatkan diagnosis nyata.</div></div> : report.findings.map(f=><div className="trace-card" key={f.id}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{f.title}</strong><span className="trace-muted">{f.status} · {f.severity}</span></div><div style={{display:'grid',gap:7,marginTop:12,fontSize:13}}><div><b>Apa terjadi:</b> {f.whatHappened}</div><div><b>Evidence:</b> {f.evidence.join(' | ')}</div><div><b>Mengapa:</b> {f.why}</div><div><b>Dampak:</b> {f.impact}</div><div><b>Solusi:</b> {f.solution}</div><div><b>Pencegahan:</b> {f.prevention}</div></div></div>)}
  </div>
}

function BusinessDiagnosis(){
  const [clientId,setClientId]=useState(''); const [period,setPeriod]=useState(''); const [previous,setPrevious]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');
  const live=useTraceCollections([],clientId?['finance']:[],clientId);
  const records=useMemo<FinanceRecord[]>(()=>asArray(live.data.finance).filter((x):x is Record<string,unknown>=>!!x).filter(x=>!clientId||String(x.client_id??'')===clientId).map(x=>({id:String(x.id),period:String(x.period??''),amount:Number(x.amount),category:x.category as FinanceRecord['category'],outletId:x.outlet_id?String(x.outlet_id):undefined,evidence:x.evidence_source?{id:String(x.id),source:x.evidence_source as FinanceEvidence['source']}:undefined})).filter(x=>x.period&&Number.isFinite(x.amount)),[live.data.finance,clientId]);
  const periods=useMemo(()=>[...new Set(records.map(r=>r.period))].sort().reverse(),[records]);
  useEffect(()=>{if(!period&&periods[0])setPeriod(periods[0]);},[period,periods]);
  const autoPrevious=period?periods.find(p=>p<period)||'': '';
  const effectivePrevious=previous||autoPrevious;
  const report=period?diagnoseBusiness(compareFinancePeriods(records,period,effectivePrevious||undefined),[]):null;
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card trace-hero"><div className="trace-section-kicker">TRACE · BUSINESS DIAGNOSIS ENGINE</div><h1>Diagnosis berbasis evidence, bukan tebakan.</h1><p className="trace-muted">TRACE sekarang membaca finance production, membandingkan periode, menghitung perubahan, lalu menjelaskan finding dan limitation. Root cause tetap tidak diklaim jika evidence belum cukup.</p></div>
    <div className="trace-card" style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10}}><label>Client / Scope<select value={clientId} onChange={e=>{setClientId(e.target.value);setPeriod('');setPrevious('')}} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label><label>Periode<select value={period} onChange={e=>setPeriod(e.target.value)}><option value="">Pilih periode</option>{periods.map(p=><option key={p}>{p}</option>)}</select></label><label>Bandingkan<select value={previous} onChange={e=>setPrevious(e.target.value)}><option value="">Otomatis ({autoPrevious||'—'})</option>{periods.filter(p=>p!==period).map(p=><option key={p}>{p}</option>)}</select></label></div>
    {live.loading?<div className="trace-card trace-muted">Memuat finance production…</div>:live.error?<div className="trace-card trace-alert">{live.error}</div>:!period?<div className="trace-card"><strong>Pilih periode untuk mulai diagnosis.</strong><div className="trace-muted" style={{marginTop:6}}>TRACE tidak akan membuat diagnosis tanpa data periode yang tersedia.</div></div>:report&&<>
      <div className="trace-kpis"><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>FINDINGS</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{report.findings.length}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>CURRENT</div><div style={{fontSize:20,fontWeight:800,marginTop:6}}>{report.currentPeriod}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>PREVIOUS</div><div style={{fontSize:20,fontWeight:800,marginTop:6}}>{report.previousPeriod??'Tidak tersedia'}</div></div></div>
      <div className="trace-card"><strong>Kesimpulan</strong><div style={{marginTop:8,lineHeight:1.6}}>{report.conclusion}</div>{report.limitations.map(x=><div key={x} className="trace-muted" style={{marginTop:7}}>Limitation: {x}</div>)}</div>
      <div style={{display:'grid',gap:10}}>{report.findings.map(f=><div className="trace-card" key={f.id}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{f.title}</strong><span className="trace-badge" data-tone={f.severity==='critical'||f.severity==='high'?'danger':f.severity==='medium'?'warning':'neutral'}>{f.severity.toUpperCase()}</span></div><div style={{display:'grid',gap:7,marginTop:10,fontSize:13}}><div><b>Masalah:</b> {f.problem}</div><div><b>Mengapa:</b> {f.cause}</div><div><b>Dampak:</b> {f.impact}</div><div><b>Rekomendasi:</b> {f.recommendation}</div>{f.evidence.map(e=><div key={e.id} className="trace-muted"><b>Evidence:</b> {e.metric} · current {e.current??'—'} · previous {e.previous??'—'} · change {e.changePct===null?'—':e.changePct.toFixed(2)+'%'} · {e.source}</div>)}</div></div>)}</div>
    </>}
  </div>
}
function DataRecovery(){
  type RecoveryData={fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult};
  const [rows,setRows]=useState<RecoverySnapshot<RecoveryData>[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const refresh=async()=>{setLoading(true);setError('');try{setRows(await listRecoverySnapshots<RecoveryData>('data-intake'));}catch(e){setError(e instanceof Error?e.message:'Recovery tidak tersedia.');}finally{setLoading(false)}};
  useEffect(()=>{void refresh();},[]);
  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card trace-hero"><div className="trace-section-kicker">TRACE · DATA RECOVERY</div><h1>Data tidak boleh hilang hanya karena browser crash.</h1><p className="trace-muted">Draft Data Intake disimpan sebagai checkpoint lokal dan tetap diarahkan ke ledger Supabase sebagai sumber utama. Recovery tidak mengubah data production secara otomatis.</p><div className="trace-hero-pills"><span>LOCAL CHECKPOINT</span><span>SUPABASE PRIMARY</span><span>NO SILENT OVERWRITE</span></div></div>
    <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div><strong>Recovered work</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Checkpoint terbaru ditampilkan lebih dulu.</div></div><button className="trace-button" onClick={refresh}>Refresh</button></div>{loading?<div className="trace-muted" style={{marginTop:12}}>Memuat checkpoint…</div>:error?<div className="trace-alert">{error}</div>:rows.length===0?<div className="trace-empty" style={{marginTop:12}}><strong>Tidak ada checkpoint lokal.</strong><div className="trace-muted">Ini bukan berarti data production kosong; halaman ini hanya menampilkan recovery lokal.</div></div>:<div style={{display:'grid',gap:10,marginTop:12}}>{rows.map(row=><details key={row.id} className="trace-recovery-item"><summary><span><strong>{row.sourceName||row.data.fileName||'Untitled import'}</strong><small>{row.status.toUpperCase()} · {new Date(row.updatedAt).toLocaleString('id-ID')}</small></span><span>{row.sourceHash?.slice(0,12)}…</span></summary><div className="trace-muted" style={{fontSize:12,marginTop:8}}>Coverage {row.data.result.coveragePct}% · {row.data.result.missingLabels.length} field belum tersedia.</div><button className="trace-button" style={{marginTop:10}} onClick={async()=>{await deleteRecoverySnapshot(row.id);await refresh();}}>Hapus checkpoint lokal</button></details>)}</div>}</div>
    <div className="trace-card"><strong>Recovery contract</strong><div className="trace-recovery-grid"><div><b>1 · Checkpoint</b><span>Setiap perubahan penting disimpan sebelum user meninggalkan flow.</span></div><div><b>2 · Provenance</b><span>SHA-256 source tetap dipertahankan.</span></div><div><b>3 · Production</b><span>Commit tetap melalui status workflow server.</span></div><div><b>4 · No guessing</b><span>Recovery tidak pernah membuat angka yang tidak ada.</span></div></div></div>
  </div>;
}

function DataIntake(){
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
  const [canonicalRows,setCanonicalRows]=useState<CanonicalPOSEventInput[]>([]);
  const [canonicalMessage,setCanonicalMessage]=useState('');
  const [canonicalBusy,setCanonicalBusy]=useState(false);
  const recoveryId=()=>`data-intake:${sourceHash||fileName||'unknown'}`;
  useEffect(()=>{let alive=true;(async()=>{try{const rows=await listRecoverySnapshots<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>('data-intake');const latest=rows[0];if(alive&&latest?.data?.result){setFileName(latest.data.fileName||latest.sourceName||'');setSourceHash(latest.data.sourceHash||'');setResult(latest.data.result);setReviewState(latest.data.reviewState||'draft');setRecovered(true);setPersistMessage('Draft lokal berhasil dipulihkan. Verifikasi ledger production sebelum melanjutkan.');}}catch{}})();return()=>{alive=false};},[]);
  useEffect(()=>{if(!result||!sourceHash)return;const snapshot:RecoverySnapshot<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>={id:recoveryId(),kind:'data-intake',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sourceName:fileName,sourceHash,status:reviewState,data:{fileName,sourceHash,reviewState,result}};void (async()=>{try{const existing=(await listRecoverySnapshots<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>('data-intake')).find((x: RecoverySnapshot<{fileName:string;sourceHash:string;reviewState:'draft'|'reviewed'|'approved';result:IntakeResult}>)=>x.id===snapshot.id);if(existing)snapshot.createdAt=existing.createdAt;}catch{} await saveRecoverySnapshot(snapshot).catch(()=>{});})();},[result,sourceHash,fileName,reviewState]);
  const sha256=async(file:File)=>{const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');};
  const persistImport=async(status:'draft'|'reviewed'|'approved', hashOverride?:string)=>{
    const effectiveHash=hashOverride||sourceHash;
    if(!result||!effectiveHash){setPersistMessage('Source belum siap untuk disimpan.');return false;}
    const supabase=getReactSupabase(); if(!supabase){setPersistMessage('Supabase React belum dikonfigurasi.');return false;}
    const {data:sessionData,error:sessionError}=await supabase.auth.getSession(); if(sessionError||!sessionData.session){setPersistMessage('Session Supabase tidak tersedia.');return false;}
    const payload={organizationId:organizationId.trim()||null,fields:result.fields,coveragePct:result.coveragePct,missingLabels:result.missingLabels,warnings:result.warnings};
    const evidence=result.fields.filter(f=>f.evidence).map(f=>({field:f.key,...(f.evidence||{})}));
    const r=await fetchWithTimeout('/api/data-intake-import',{method:'POST',headers:{Authorization:`Bearer ${sessionData.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({sourceHash:effectiveHash,sourceName:fileName,sourceType:detectSourceType(fileName),status,payload,evidence})},10000);
    const body=await r.json().catch(()=>({})); if(!r.ok) throw new Error(body.error||`Import HTTP ${r.status}`);
    setPersistMessage(`Import ${status} tersimpan di ledger production.`); return true;
  };
  const parseDelimited=(text:string, name:string)=>{
    const rows=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(r=>r.split(/\t|,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(v=>v.replace(/^\"|\"$/g,'').trim()));
    const headers=rows[0]??[]; const dataRows=rows.slice(1); const aggregate=aggregateDelimitedRows(headers,dataRows);
    const base=calculateAvailableFinance(buildIntakeResult(aggregate as unknown as Partial<Record<string, unknown>>));
    base.fields.forEach(f=>{if(f.status==='available')f.evidence={sourceFile:name,sourceRow:2,rawValue:String(f.value??'')};});
    if(aggregate.rowCount>1) base.warnings.push(`CSV/TSV mempertahankan ${aggregate.rowCount} baris untuk canonical import; ringkasan finance di atas hanya agregasi untuk preview.`);
    return {result:base,rows:mapTabularRows(headers,dataRows,name,undefined,new Date(),sourceHash||name)};
  };
  const commitCanonical=async()=>{
    if(reviewState!=='approved'){setCanonicalMessage('Canonical import baru boleh dilakukan setelah import APPROVED.');return;}
    if(!organizationId.trim()){setCanonicalMessage('Isi Organization / Client ID terlebih dahulu.');return;}
    const summary=summarizeCanonicalImport(canonicalRows); if(!summary.valid){setCanonicalMessage('Tidak ada baris valid yang siap diimport.');return;}
    const supabase=getReactSupabase(); if(!supabase){setCanonicalMessage('Supabase React belum dikonfigurasi.');return;}
    setCanonicalBusy(true); setCanonicalMessage('Memvalidasi dan mengirim canonical rows ke server…');
    try{
      const sourceType=detectSourceType(fileName); const provider=sourceType==='xlsx'||sourceType==='xls'||sourceType==='ods'?'excel':sourceType;
      const {data,error}=await supabase.rpc('trace_commit_canonical_pos_import',{p_organization_id:organizationId.trim(),p_source_hash:sourceHash,p_source_name:fileName,p_provider:provider,p_rows:canonicalRows.filter(r=>r.status==='VALID')});
      if(error) throw error;
      const r=data as {insertedIngestion?:number;insertedEvents?:number;duplicates?:number;rejected?:number}|null;
      setCanonicalMessage(`Canonical import selesai: ${r?.insertedEvents??0} event tersimpan, ${r?.insertedIngestion??0} provenance dibuat, ${r?.duplicates??0} duplikat dilewati, ${r?.rejected??0} row ditolak.`);
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
        setCanonicalMessage(parsedCanonical.length?`${summarizeCanonicalImport(parsedCanonical).valid} row valid untuk canonical import.`:'Format ini menghasilkan ringkasan finance saja; canonical row import tersedia untuk CSV/Excel.');
        // Persist the immutable source as DRAFT first so the server can enforce
        // Draft → Reviewed → Approved instead of allowing a client-side skip.
        const payload={organizationId:organizationId.trim()||null,fields:parsed.fields,coveragePct:parsed.coveragePct,missingLabels:parsed.missingLabels,warnings:parsed.warnings};
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
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>TRACE · DATA INTAKE OS</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Upload data klien, biarkan TRACE memetakan.</h1>{recovered&&<div className="trace-recovery-banner">↻ Draft lokal dipulihkan otomatis · <button className="trace-link-button" onClick={()=>setRecovered(false)}>tutup</button></div>}<div className="trace-muted">TRACE mencari nama bisnis, outlet, periode, Revenue, COGS, Labor, dan OPEX meskipun urutan kolom berbeda. Data yang tidak ada tetap ditandai Missing.</div></div>
    <div className="trace-card" style={{display:'grid',gap:14}}><label style={{display:'grid',gap:8,fontWeight:700}}>Upload file klien<input type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.docx,.ods,.txt,.json,.png,.jpg,.jpeg,.webp" onChange={onFile} style={{padding:14,border:'1px dashed rgba(23,23,23,.2)',borderRadius:12,background:'#fafaf8'}}/></label>{fileName&&<div className="trace-muted">{busy?'Memproses…':`File: ${fileName}`}</div>}{error&&<div style={{padding:12,borderRadius:10,background:'#fff7ed',border:'1px solid #fed7aa',fontSize:13}}><strong>Belum diimport</strong><div style={{marginTop:4}}>{error}</div></div>}</div>
    {result&&<><div className="trace-card" style={{display:'grid',gap:10}}><div><strong>Canonical POS Import</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>CSV/Excel diproses per baris, bukan hanya dijumlahkan. Provenance disimpan, row invalid ditolak, dan duplicate source record ID dilewati secara idempotent.</div></div><label style={{fontWeight:700,fontSize:13}}>Organization / Client ID<input value={organizationId} onChange={e=>setOrganizationId(e.target.value)} placeholder="Contoh: client_abc" style={{...inputStyle,marginTop:6}}/></label>{canonicalRows.length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8}}>{(()=>{const q=summarizeCanonicalImport(canonicalRows);return <><div className="trace-card"><b>{q.total}</b><div className="trace-muted">Rows</div></div><div className="trace-card"><b>{q.valid}</b><div className="trace-muted">Valid</div></div><div className="trace-card"><b>{q.invalid}</b><div className="trace-muted">Invalid</div></div><div className="trace-card"><b>{q.duplicate}</b><div className="trace-muted">Duplicate</div></div></>})()}</div>}{canonicalRows.some(r=>r.status!=='VALID')&&<details><summary>Review row bermasalah</summary><div style={{display:'grid',gap:6,marginTop:8,maxHeight:260,overflow:'auto'}}>{canonicalRows.filter(r=>r.status!=='VALID').slice(0,100).map(r=><div key={`${r.sourceRecordId}-${r.sourceRow}`} style={{padding:9,border:'1px solid rgba(23,23,23,.08)',borderRadius:9,fontSize:12}}><b>Row {r.sourceRow} · {r.sourceRecordId}</b><div className="trace-muted">{r.issues.join(', ')}</div></div>)}</div></details>}<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button onClick={commitCanonical} disabled={canonicalBusy||reviewState!=='approved'||!canonicalRows.some(r=>r.status==='VALID')||!organizationId.trim()} className="trace-button">{canonicalBusy?'Mengimport…':'Commit canonical data'}</button><span className="trace-muted" style={{fontSize:12}}>{canonicalMessage}</span></div></div><div className="trace-kpis"><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>DATA COVERAGE</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{result.coveragePct}%</div><div className="trace-muted" style={{fontSize:12}}>Berdasarkan field yang tersedia/terhitung</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>BUSINESS</div><div style={{fontSize:20,fontWeight:750,marginTop:6}}>{result.businessName.value??'Tidak ditemukan'}</div><div className="trace-muted" style={{fontSize:12}}>Tidak ditebak oleh AI</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>PERIODE</div><div style={{fontSize:20,fontWeight:750,marginTop:6}}>{result.period.value??'Tidak ditemukan'}</div><div className="trace-muted" style={{fontSize:12}}>Perlu review jika tidak pasti</div></div></div>
      <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><strong>Import Review</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Draft → Review → Approve. TRACE tidak mengubah angka yang ditemukan tanpa tindakan pengguna.</div></div><span style={{fontSize:11,fontWeight:800}}>{reviewState.toUpperCase()}</span></div><div style={{display:'grid',gap:8,marginTop:12}}>{result.fields.map(f=><div key={f.key} style={{display:'grid',gridTemplateColumns:'1.1fr .8fr .9fr 1fr',gap:10,padding:'10px 0',borderTop:'1px solid rgba(23,23,23,.07)',fontSize:13,alignItems:'center'}}><span>{f.label}</span><strong>{f.value===null?'—':typeof f.value==='number'?f.value.toLocaleString('id-ID'):String(f.value)}</strong><span className="trace-muted">{f.status==='available'?'Available':f.status==='calculated'?'Calculated':f.status==='missing'?'Missing':f.status}</span>{f.status==='missing'&&['businessName','outletName','period','revenue','cogs','labor','opex'].includes(f.key)?<input value={manual[f.key]??''} onChange={e=>setManual(v=>({...v,[f.key]:e.target.value}))} placeholder="Isi manual jika tersedia" style={{minWidth:0,padding:'7px 8px',border:'1px solid #ddd',borderRadius:8}}/>:<span className="trace-muted" style={{fontSize:11}}>{f.evidence?.sourceFile?'Source: '+f.evidence.sourceFile:'—'}</span>}</div>)}</div><div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}><button onClick={()=>{if(result){const manualValues: Partial<Record<'businessName'|'outletName'|'period'|'revenue'|'cogs'|'labor'|'opex',unknown>>={}; Object.entries(manual).forEach(([k,v])=>{ if(['businessName','outletName','period','revenue','cogs','labor','opex'].includes(k)){ manualValues[k as keyof typeof manualValues]=['revenue','cogs','labor','opex'].includes(k)?parseAmount(v):v; }}); setResult(applyManualCompletion(result,manualValues)); setReviewState('draft');}}} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 11px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Terapkan input manual</button><button onClick={async()=>{try{if(await persistImport('reviewed'))setReviewState('reviewed');}catch(e){setPersistMessage(e instanceof Error?e.message:'Import review gagal.');}}} disabled={!organizationId.trim()} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 11px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Tandai sudah direview</button><button onClick={async()=>{if(reviewState!=='reviewed')return;try{if(await persistImport('approved'))setReviewState('approved');}catch(e){setPersistMessage(e instanceof Error?e.message:'Approval import gagal.');}}} disabled={reviewState!=='reviewed'} style={{border:0,borderRadius:9,padding:'8px 11px',background:reviewState==='reviewed'?'#171717':'#eee',color:reviewState==='reviewed'?'#fff':'#777',fontWeight:700,cursor:reviewState==='reviewed'?'pointer':'not-allowed'}}>Approve import</button></div>{persistMessage&&<div className="trace-muted" style={{marginTop:9,fontSize:12}}>{persistMessage}</div>}{reviewState==='approved'&&<div className="trace-muted" style={{marginTop:9,fontSize:12}}>Ledger approval tersimpan. Commit ke finance tetap merupakan langkah terpisah dan tidak dilakukan otomatis oleh approval import.</div>}</div>
      <div className="trace-card"><strong>TRACE Intelligence · Analisis awal</strong><p className="trace-muted" style={{lineHeight:1.6}}>Analisis boleh berjalan menggunakan data yang tersedia. TRACE tidak membuat angka yang tidak ditemukan. {result.missingLabels.length?`Data yang belum tersedia: ${result.missingLabels.join(', ')}.`:'Field utama tersedia.'}</p><div style={{padding:12,borderRadius:10,background:'#fafaf8',fontSize:13}}>Gross Profit: <strong>{fmtFieldAmount(result.fields.find(f=>f.key==='grossProfit')?.value)}</strong><br/>Operating Profit: <strong>{fmtFieldAmount(result.fields.find(f=>f.key==='operatingProfit')?.value)}</strong></div></div>
    </>}
  </div>
}


function SettingsCenter(){
  const [section,setSection]=useState<'diagnostic'|'chat'|'security'|'evolution'|'general'>('chat');
  const [chatMessages,setChatMessages]=useState<Array<{role:'user'|'assistant';content:string}>>([{role:'assistant',content:'Halo. Saya TRACE AI. Fokus utama saya software engineering: coding, debugging, architecture, security, Supabase/RLS, Netlify, performance, persistence, dan testing. Saya tidak mengarang evidence dan tidak mengubah production tanpa approval.'}]);
  const [chatInput,setChatInput]=useState(''); const [chatBusy,setChatBusy]=useState(false); const [pendingDeployApproval,setPendingDeployApproval]=useState<string|null>(null);
  const [securityFindings,setSecurityFindings]=useState<SecurityFinding[]>([]); const [evolutionRecommendations,setEvolutionRecommendations]=useState<EvolutionRecommendation[]>([]);
  const [snapshot,setSnapshot]=useState<DiagnosticCenterSnapshot>(()=>createEmptyDiagnosticCenterSnapshot());
  const [scanning,setScanning]=useState(false);
  const [error,setError]=useState('');
  const [repairPlans,setRepairPlans]=useState<Record<string,DiagnosticRepairPlan>>({});
  const [repairBusy,setRepairBusy]=useState<string|null>(null);
  const [repairMessage,setRepairMessage]=useState('');
  const [aiAutoAnalysis,setAiAutoAnalysis]=useState('');
  const [aiAnalysisBusy,setAiAnalysisBusy]=useState(false);
  const [lastAnalysisFingerprint,setLastAnalysisFingerprint]=useState('');
  const sendChat=async()=>{const text=chatInput.trim();if(!text||chatBusy)return;const next=[...chatMessages,{role:'user' as const,content:text}];setChatMessages(next);setChatInput('');setChatBusy(true);try{const token=await getToken();if(!token)throw new Error('Session Supabase tidak tersedia.');const affirmative=/^(ya|yaa|iya|yes|setuju|deploy|gas deploy|lanjut deploy|ya deploy)\s*$/i.test(text);if(pendingDeployApproval&&affirmative){const r=await fetchWithTimeout('/api/ai-deploy',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',approvalId:pendingDeployApproval,confirm:true})},15000);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`Deploy HTTP ${r.status}`);setPendingDeployApproval(null);setChatMessages(v=>[...v,{role:'assistant',content:p.message||'Deployment production telah dipicu setelah konfirmasi kamu.'}]);return;}const r=await fetchWithTimeout('/api/ai-chat',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messages:next})},30000);const p=await r.json().catch(()=>({}));if(!r.ok)throw new Error(p.error||`AI chat HTTP ${r.status}`);const d=p.provider||{};const answer=d.choices?.[0]?.message?.content||d.output||d.message||'AI provider tidak mengembalikan jawaban yang dapat dibaca.';let finalAnswer=String(answer);const deploymentIntent=/^(?:please\s+)?(?:deploy|rilis|publish)(?:\s+(?:ke|to)\s+)?(?:production)?(?:\s+now)?[.!\s]*$/i.test(text);if(deploymentIntent){const pr=await fetchWithTimeout('/api/ai-deploy',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action:'request',reason:text})},10000);const pp=await pr.json().catch(()=>({}));if(pr.ok&&pp.approvalId){setPendingDeployApproval(pp.approvalId);finalAnswer+=`\n\n⚠️ Production deployment belum dijalankan. Konfirmasi eksplisit diperlukan. Jika kamu setuju, jawab: YA DEPLOY.`;}}setChatMessages(v=>[...v,{role:'assistant',content:finalAnswer}]);}catch(e){setChatMessages(v=>[...v,{role:'assistant',content:`AI belum tersedia: ${e instanceof Error?e.message:'unknown error'}. Tidak ada perubahan production yang dilakukan.`}]);}finally{setChatBusy(false)}};
  const runSecurityScan=()=>{const files=(window as any).__traceSecurityFiles||[];setSecurityFindings(analyzeSecurity(files,[]));};
  const runEvolution=()=>{setEvolutionRecommendations(buildEvolutionRecommendations((window as any).__traceUsageSignals||[]));};
  const getToken=async()=>{
    const supa=(window as any).supabase;
    if(!supa?.auth?.getSession) return null;
    const session=await supa.auth.getSession();
    return session?.data?.session?.access_token ?? null;
  };
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
  const applyPlan=async(plan:DiagnosticRepairPlan)=>{
    if(!plan.canApplyAutomatically){ setRepairMessage('Perbaikan ini harus direview dulu. TRACE tidak mengubah source secara otomatis.'); return; }
    setRepairBusy(plan.id); setRepairMessage('');
    try { const token=await getToken(); const result=await requestRepairApply({findingId:plan.findingId,plan,approved:true},'/api/diagnostic-repair',token||undefined); setRepairMessage(result.applied?'Perbaikan diterapkan.':'Perbaikan belum diterapkan: '+(result.reason||result.status)); }
    finally { setRepairBusy(null); }
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
      {section==='chat'?<div style={{display:'grid',gap:12}}><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>TRACE AI · ENGINEERING BRAIN</div><h2 style={{margin:'6px 0'}}>Ngobrol dengan AI engineer TRACE</h2><div className="trace-muted">Coding, debugging, architecture, security, Supabase/RLS, Netlify, performance, persistence, testing, dan evolution.</div></div><div className="trace-card" style={{display:'grid',gap:10}}><div style={{display:'grid',gap:9,maxHeight:420,overflow:'auto'}}>{chatMessages.map((m,i)=><div key={i} style={{padding:12,borderRadius:12,background:m.role==='user'?'#171717':'#fafaf8',color:m.role==='user'?'#fff':'inherit',justifySelf:m.role==='user'?'end':'start',maxWidth:'88%',lineHeight:1.55,fontSize:13,whiteSpace:'pre-wrap'}}>{m.content}</div>)}</div><div style={{display:'flex',gap:8}}><textarea value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();}}} placeholder="Contoh: kenapa Acquisition timeout?" style={{flex:1,minHeight:72,padding:11,border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit'}}/><button onClick={sendChat} disabled={chatBusy||!chatInput.trim()} style={{border:0,borderRadius:10,padding:'0 16px',background:'#171717',color:'#fff',fontWeight:750}}>{chatBusy?'Thinking…':'Kirim'}</button></div></div><div className="trace-card"><strong>Approval gate</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>AI boleh menganalisis dan membuat proposal. Apply patch, commit, push, merge, migration, dan deploy tetap membutuhkan approval eksplisit. Deployment production dapat dijalankan AI hanya setelah kamu menjawab YA DEPLOY.</div><div style={{marginTop:10,display:'flex',gap:8,alignItems:'center',fontSize:11}}><span className="trace-badge" data-tone={requiresApproval('deploy','production')?'warning':'neutral'}>{requiresApproval('deploy','production')?'DEPLOY · APPROVAL REQUIRED':'DEPLOY · NO APPROVAL NEEDED'}</span><span className="trace-muted">{deploymentDecision(pendingDeployApproval?{id:pendingDeployApproval,action:'deploy',environment:'production',approvedBy:null,approvedAt:null,expiresAt:null}:null).reason}</span></div></div></div>:section==='security'?<div style={{display:'grid',gap:12}}><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>TRACE AI · SECURITY GUARD</div><h2 style={{margin:'6px 0'}}>AI ikut menjaga keamanan data TRACE</h2><div className="trace-muted">Mendeteksi indikasi secret exposure, privileged credential, unsafe storage, CORS, dan authentication abuse. Ini lapisan deteksi; keamanan tetap bergantung pada RLS, Auth, secrets management, network controls, dan monitoring.</div><button onClick={runSecurityScan} style={{marginTop:12,border:0,borderRadius:9,padding:'9px 12px',background:'#171717',color:'#fff',fontWeight:750}}>Jalankan security scan</button></div><div className="trace-card"><strong>Status: {securityStatus(securityFindings)}</strong>{securityFindings.map(f=><div key={f.id} style={{padding:10,borderTop:'1px solid rgba(23,23,23,.08)',marginTop:8}}><b>{f.severity.toUpperCase()} · {f.title}</b><div style={{fontSize:12,marginTop:4}}>{f.cause}</div><div className="trace-muted" style={{fontSize:12,marginTop:4}}>{f.recommendation}</div></div>)}</div></div>:section==='evolution'?<div style={{display:'grid',gap:12}}><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>TRACE AI · EVOLUTION ADVISOR</div><h2 style={{margin:'6px 0'}}>AI memberi saran update berdasarkan penggunaan</h2><div className="trace-muted">Prioritas berasal dari failure, completion, missing-data, dan performance signals nyata.</div><button onClick={runEvolution} style={{marginTop:12,border:0,borderRadius:9,padding:'9px 12px',background:'#171717',color:'#fff',fontWeight:750}}>Analisis kebutuhan update</button></div><div className="trace-card">{evolutionRecommendations.length?evolutionRecommendations.map(r=><div key={r.id} style={{padding:11,borderTop:'1px solid rgba(23,23,23,.08)'}}><b>{r.priority} · {r.title}</b><div style={{fontSize:12,marginTop:4}}>{r.rationale}</div><div className="trace-muted" style={{fontSize:12,marginTop:4}}>{r.evidence.join(' · ')} · Approval required</div></div>):<div className="trace-muted">Belum ada usage signals yang cukup. AI tidak akan mengarang rekomendasi dari data yang belum ada.</div>}</div></div>:section==='general'?<div className="trace-card"><strong>System Settings</strong><p className="trace-muted" style={{lineHeight:1.6}}>Diagnostic Center tetap read-only. Production deploy tersedia melalui approval gate: AI meminta konfirmasi, lalu hanya menjalankan deploy setelah kamu menjawab YA DEPLOY.</p><div style={{padding:14,border:'1px solid rgba(23,23,23,.08)',borderRadius:12}}><b>AI safety mode</b><div className="trace-muted" style={{fontSize:13,marginTop:4}}>READ-ONLY · ON</div></div></div>:<div style={{display:'grid',gap:16}}>
        <div className="trace-kpis"><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>FINDINGS</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{summary.total}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>CRITICAL / HIGH</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{summary.counts.critical+summary.counts.high}</div></div><div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>RELEASE</div><div style={{fontSize:20,fontWeight:800,marginTop:8}}>{summary.releaseBlocked?'BLOCKED':'NOT BLOCKED'}</div></div></div>
        <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center'}}><div><strong>Diagnostic sources</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Status unavailable/blocked tidak dianggap sehat.</div></div><span style={{fontSize:12,fontWeight:700}}>READ-ONLY</span></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10,marginTop:14}}>{snapshot.sources.map(source=>{const Icon=iconFor(source.id);return <div key={source.id} style={{padding:13,border:'1px solid rgba(23,23,23,.08)',borderRadius:12}}><div style={{display:'flex',gap:8,alignItems:'center'}}><Icon size={17}/><strong style={{fontSize:13}}>{source.label}</strong><span style={{marginLeft:'auto',fontSize:10,fontWeight:800}}>{source.status.toUpperCase()}</span></div><div className="trace-muted" style={{fontSize:12,lineHeight:1.5,marginTop:7}}>{source.detail}</div><div style={{fontSize:11,marginTop:7}}>Evidence: <b>{source.evidenceCount}</b></div></div>})}</div></div>
        <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div><strong>AI diagnosis & repair</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Diagnosis tetap diam. Perbaikan hanya dibuat sebagai proposal dan tidak mengubah source tanpa persetujuan.</div></div><span style={{fontSize:11,fontWeight:800}}>SAFE MODE</span></div>{snapshot.findings.length===0?<div className="trace-muted" style={{marginTop:8,lineHeight:1.6}}>Belum ada finding. Jalankan full diagnostic untuk menggabungkan static source scan + telemetry nyata.</div>:<div style={{display:'grid',gap:8,marginTop:12}}>{snapshot.findings.map(f=>{const plan=repairPlans[f.id];return <details key={f.id} style={{padding:12,border:'1px solid rgba(23,23,23,.08)',borderRadius:12}}><summary style={{cursor:'pointer',fontWeight:750,display:'flex',justifyContent:'space-between',gap:10}}><span>{f.title}</span><span className="trace-muted" style={{fontSize:11}}>{f.severity.toUpperCase()} · {f.status.toUpperCase()}</span></summary><div style={{fontSize:13,marginTop:9}}><b>Penyebab:</b> {f.cause}</div><div style={{fontSize:13,marginTop:5}}><b>Dampak:</b> {f.impact}</div><div style={{fontSize:13,marginTop:5}}><b>Solusi:</b> {f.solution}</div>{f.evidence.map((e,i)=><div key={i} className="trace-muted" style={{fontSize:12,marginTop:7}}><b>{e.file}{e.line?`:${e.line}`:''}</b> — {e.reason}{e.code?` · ${e.code}`:''}</div>)}<div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}><button onClick={()=>createPlan(f)} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 10px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Buat repair plan</button>{plan&&<button onClick={()=>applyPlan(plan)} disabled={repairBusy===plan.id} style={{border:0,borderRadius:9,padding:'8px 10px',background:plan.canApplyAutomatically?'#171717':'#eee',color:plan.canApplyAutomatically?'#fff':'#555',fontWeight:700,cursor:plan.canApplyAutomatically?'pointer':'not-allowed'}}>{repairBusy===plan.id?'Applying…':plan.canApplyAutomatically?'Apply fix':'Review required'}</button>}</div>{plan&&<div style={{marginTop:12,padding:12,borderRadius:10,background:'#fafaf8'}}><b>{plan.title}</b><div className="trace-muted" style={{fontSize:12,marginTop:5}}>{plan.reason}</div><div style={{display:'grid',gap:7,marginTop:8}}>{plan.steps.map((step,i)=><div key={i} style={{fontSize:12}}><b>{i+1}. {step.title}</b>{step.file&&<span className="trace-muted"> · {step.file}{step.line?`:${step.line}`:''}</span>}<div className="trace-muted" style={{marginTop:2}}>{step.detail}</div></div>)}</div></div>}</details>})}</div>}{repairMessage&&<div className="trace-muted" style={{marginTop:10,fontSize:12}}>{repairMessage}</div>}</div>
        <div className="trace-card"><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center'}}><div><strong>AI incident analysis</strong><div className="trace-muted" style={{fontSize:12,marginTop:4}}>Setiap fingerprint finding baru dianalisis otomatis. AI hanya menjelaskan evidence; AI tidak mengubah status test atau production.</div></div><span style={{fontSize:11,fontWeight:800}}>{aiAnalysisBusy?'ANALYZING':'EVIDENCE-FIRST'}</span></div>{aiAutoAnalysis?<div style={{marginTop:12,whiteSpace:'pre-wrap',lineHeight:1.65,fontSize:13}}>{aiAutoAnalysis}</div>:<div className="trace-muted" style={{marginTop:10}}>Belum ada incident baru yang membutuhkan analisis AI.</div>}</div>
        <div className="trace-card"><strong>Telemetry snapshot</strong><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginTop:12}}><div><div className="trace-muted" style={{fontSize:11}}>Runtime errors</div><b>{snapshot.telemetry.runtimeErrors.length}</b></div><div><div className="trace-muted" style={{fontSize:11}}>Slow resources</div><b>{snapshot.telemetry.networkSlowCount}</b></div><div><div className="trace-muted" style={{fontSize:11}}>Performance evidence</div><b>{snapshot.telemetry.performance.length}</b></div></div></div>
      </div>}
    </div>
  </div>
}

function startTelemetryOnce(){
  if(!(window as any).__traceDiagnosticTelemetryStarted) {
    (window as any).__traceDiagnosticTelemetryStarted=true;
    const cleanup=collectBrowserTelemetry();
    void cleanup;
  }
}
type FinanceDraft = { id:string|null; version:number|null; clientId:string; outletId:string; period:string; amount:number|string; category:'revenue'|'cogs'|'labor'|'opex'; evidenceNote:string; accountLabel:string; statementSection:FinanceStatementSection|'' };
const EMPTY_FINANCE_DRAFT: FinanceDraft = { id:null, version:null, clientId:'', outletId:'', period:'', amount:'', category:'revenue', evidenceNote:'', accountLabel:'', statementSection:'' };
const STATEMENT_SECTION_LABEL: Record<FinanceStatementSection,string> = { pendapatan_usaha:'Pendapatan Usaha', biaya_produksi:'Biaya Produksi', biaya_usaha_lain:'Biaya Usaha Lain', biaya_operasional:'Biaya Operasional', biaya_non_operasional:'Biaya Non Operasional', pendapatan_lain:'Pendapatan Lain', pengeluaran_lain:'Pengeluaran Lain' };

function FinanceEntry(){
  const [draft,setDraft]=useState<FinanceDraft>(EMPTY_FINANCE_DRAFT);
  const [rows,setRows]=useState<Array<Record<string,unknown>>>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [saving,setSaving]=useState(false);
  const [saveMessage,setSaveMessage]=useState('');
  const [exporting,setExporting]=useState<'pdf'|'xlsx'|''>('');
  const [previousPeriod,setPreviousPeriod]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');

  const refresh=async()=>{
    setLoading(true); setLoadError('');
    try{ const {data}=await loadTraceCollections([],draft.clientId?['finance']:[],draft.clientId); setRows(asArray(data['finance']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null)); }
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
      const meta={clientName:draft.clientId.trim(),currentPeriod:draft.period,previousPeriod:effectivePrevious||undefined};
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
      const meta={clientName:draft.clientId.trim(),currentPeriod:draft.period};
      if(kind==='pdf') await exportIncomeStatementPdf(statement,meta); else await exportIncomeStatementExcel(statement,meta);
    }catch(e){ setSaveMessage(e instanceof Error?`Gagal membuat file: ${e.message}`:'Gagal membuat file.'); }
    finally{ setExportingStatement(''); }
  };

  const [exportingDashboard,setExportingDashboard]=useState(false);
  const doExportDashboard=async()=>{
    if(!draft.clientId.trim()||!draft.period) return;
    setExportingDashboard(true);
    try{ await exportFinanceDashboardExcel(records,{clientName:draft.clientId.trim(),currentPeriod:draft.period}); }
    catch(e){ setSaveMessage(e instanceof Error?`Gagal membuat dashboard: ${e.message}`:'Gagal membuat dashboard.'); }
    finally{ setExportingDashboard(false); }
  };

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>FINANCE · GUIDED ENTRY</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Catat keuangan, simpan ke database, dan buat laporan</h1><div className="trace-muted">Data tersimpan permanen di Supabase (bukan draft sesi). Laporan PDF/Excel dibuat dari data yang sudah tersimpan, bukan dari input yang belum disimpan.</div></div>

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
const CATEGORY_LABEL_ID:Record<string,string>={revenue:'Revenue',cogs:'COGS',labor:'Labor',opex:'OPEX'};
const inputStyle: React.CSSProperties={width:'100%',marginTop:7,padding:'11px 12px',border:'1px solid rgba(23,23,23,.12)',borderRadius:10,font:'inherit',background:'#fff'};

type JournalLineDraft={accountId:string;debit:string|number;credit:string|number;memo:string};
const EMPTY_JOURNAL_LINE:JournalLineDraft={accountId:'',debit:'',credit:'',memo:''};

function AccountingView(){
  const [clientId,setClientId]=useState('');
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [accounts,setAccounts]=useState<Array<Record<string,unknown>>>([]);
  const [entries,setEntries]=useState<Array<Record<string,unknown>>>([]);
  const [lines,setLines]=useState<Array<Record<string,unknown>>>([]);
  const [arInvoicesRaw,setArInvoicesRaw]=useState<Array<Record<string,unknown>>>([]);
  const [arPaymentsRaw,setArPaymentsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [apBillsRaw,setApBillsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [apPaymentsRaw,setApPaymentsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [fixedAssetsRaw,setFixedAssetsRaw]=useState<Array<Record<string,unknown>>>([]);
  const [periodLocksRaw,setPeriodLocksRaw]=useState<Array<Record<string,unknown>>>([]);
  const [seeding,setSeeding]=useState(false);
  const [message,setMessage]=useState('');
  const clientsLive=useTraceCollections(['trace-clients']);
  const clients=asArray(clientsLive.data['trace-clients']).filter((x):x is Record<string,unknown>=>!!x&&typeof x==='object');

  const refresh=async()=>{
    if(!clientId.trim()){setAccounts([]);setEntries([]);setLines([]);setArInvoicesRaw([]);setArPaymentsRaw([]);setApBillsRaw([]);setApPaymentsRaw([]);setFixedAssetsRaw([]);setPeriodLocksRaw([]);setLoading(false);return;}
    setLoading(true); setLoadError('');
    try{
      const {data}=await loadTraceCollections([],['accounts','journal_entries','journal_lines','ar_invoices','ar_payments','ap_bills','ap_payments','fixed_assets','period_locks'],clientId);
      setAccounts(asArray(data['accounts']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setEntries(asArray(data['journal_entries']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setLines(asArray(data['journal_lines']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setArInvoicesRaw(asArray(data['ar_invoices']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setArPaymentsRaw(asArray(data['ar_payments']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setApBillsRaw(asArray(data['ap_bills']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setApPaymentsRaw(asArray(data['ap_payments']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setFixedAssetsRaw(asArray(data['fixed_assets']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
      setPeriodLocksRaw(asArray(data['period_locks']).filter((x):x is Record<string,unknown>=>typeof x==='object'&&x!==null));
    }catch(e){ setLoadError(e instanceof Error?e.message:'Data akuntansi tidak tersedia.'); }
    finally{ setLoading(false); }
  };
  useEffect(()=>{ refresh(); },[clientId]);

  const todayIso=new Date().toISOString().slice(0,10);
  const arInvoices:ArInvoice[]=arInvoicesRaw.map(r=>({id:String(r.id),clientId:String(r.client_id),customerName:String(r.customer_name),invoiceDate:String(r.invoice_date),dueDate:String(r.due_date),amount:Number(r.amount)}));
  const arPayments:ArPayment[]=arPaymentsRaw.map(r=>({invoiceId:String(r.invoice_id),amount:Number(r.amount),paidDate:String(r.paid_date)}));
  const arAging=arInvoices.length?buildArAging(arInvoices,arPayments,todayIso):null;
  const apBills:ApBill[]=apBillsRaw.map(r=>({id:String(r.id),clientId:String(r.client_id),vendorName:String(r.vendor_name),billDate:String(r.bill_date),dueDate:String(r.due_date),amount:Number(r.amount)}));
  const apPayments:ApPayment[]=apPaymentsRaw.map(r=>({billId:String(r.bill_id),amount:Number(r.amount),paidDate:String(r.paid_date)}));
  const apAging=apBills.length?buildApAging(apBills,apPayments,todayIso):null;
  const fixedAssetsList:FixedAsset[]=fixedAssetsRaw.map(r=>({id:String(r.id),clientId:String(r.client_id),name:String(r.name),acquisitionDate:String(r.acquisition_date),acquisitionCost:Number(r.acquisition_cost),usefulLifeMonths:Number(r.useful_life_months),residualValue:Number(r.residual_value)}));
  const monthlyDepreciationTotal=fixedAssetsList.length?totalMonthlyDepreciation(fixedAssetsList):0;
  const periodLocks:PeriodLock[]=periodLocksRaw.map(r=>({period:String(r.period),clientId:String(r.client_id),lockedAt:String(r.locked_at),lockedBy:String(r.locked_by)}));
  const currentPeriod=todayIso.slice(0,7);
  const currentPeriodLocked=isPeriodLocked(currentPeriod,clientId.trim(),periodLocks);

  const [arDraft,setArDraft]=useState({customerName:'',invoiceDate:todayIso,dueDate:todayIso,amount:''});
  const [arPaymentDraft,setArPaymentDraft]=useState({invoiceId:'',amount:'',paidDate:todayIso});
  const [apDraft,setApDraft]=useState({vendorName:'',billDate:todayIso,dueDate:todayIso,amount:''});
  const [apPaymentDraft,setApPaymentDraft]=useState({billId:'',amount:'',paidDate:todayIso});
  const [assetDraft,setAssetDraft]=useState({name:'',acquisitionDate:todayIso,acquisitionCost:'',usefulLifeMonths:'',residualValue:'0'});
  const [lockDraft,setLockDraft]=useState(currentPeriod);
  const [arApBusy,setArApBusy]=useState(false);

  const createArInvoice=async()=>{
    if(!clientId.trim()||!arDraft.customerName.trim()||!arDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_create_ar_invoice',{p_client_id:clientId.trim(),p_customer_name:arDraft.customerName.trim(),p_invoice_date:arDraft.invoiceDate,p_due_date:arDraft.dueDate,p_amount:Number(arDraft.amount)});
      if(error) throw error;
      setMessage('Invoice piutang dibuat.'); setArDraft({customerName:'',invoiceDate:todayIso,dueDate:todayIso,amount:''}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal membuat invoice.'); } finally{ setArApBusy(false); }
  };
  const recordArPayment=async()=>{
    if(!arPaymentDraft.invoiceId||!arPaymentDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_record_ar_payment',{p_invoice_id:arPaymentDraft.invoiceId,p_amount:Number(arPaymentDraft.amount),p_paid_date:arPaymentDraft.paidDate});
      if(error) throw error;
      setMessage('Pembayaran piutang dicatat.'); setArPaymentDraft({invoiceId:'',amount:'',paidDate:todayIso}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal mencatat pembayaran.'); } finally{ setArApBusy(false); }
  };
  const createApBill=async()=>{
    if(!clientId.trim()||!apDraft.vendorName.trim()||!apDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_create_ap_bill',{p_client_id:clientId.trim(),p_vendor_name:apDraft.vendorName.trim(),p_bill_date:apDraft.billDate,p_due_date:apDraft.dueDate,p_amount:Number(apDraft.amount)});
      if(error) throw error;
      setMessage('Tagihan utang dibuat.'); setApDraft({vendorName:'',billDate:todayIso,dueDate:todayIso,amount:''}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal membuat tagihan.'); } finally{ setArApBusy(false); }
  };
  const recordApPayment=async()=>{
    if(!apPaymentDraft.billId||!apPaymentDraft.amount) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_record_ap_payment',{p_bill_id:apPaymentDraft.billId,p_amount:Number(apPaymentDraft.amount),p_paid_date:apPaymentDraft.paidDate});
      if(error) throw error;
      setMessage('Pembayaran utang dicatat.'); setApPaymentDraft({billId:'',amount:'',paidDate:todayIso}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal mencatat pembayaran.'); } finally{ setArApBusy(false); }
  };
  const createFixedAsset=async()=>{
    if(!clientId.trim()||!assetDraft.name.trim()||!assetDraft.acquisitionCost||!assetDraft.usefulLifeMonths) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_create_fixed_asset',{p_client_id:clientId.trim(),p_name:assetDraft.name.trim(),p_acquisition_date:assetDraft.acquisitionDate,p_acquisition_cost:Number(assetDraft.acquisitionCost),p_useful_life_months:Number(assetDraft.usefulLifeMonths),p_residual_value:Number(assetDraft.residualValue||0)});
      if(error) throw error;
      setMessage('Aset tetap ditambahkan.'); setAssetDraft({name:'',acquisitionDate:todayIso,acquisitionCost:'',usefulLifeMonths:'',residualValue:'0'}); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal menambah aset.'); } finally{ setArApBusy(false); }
  };
  const lockPeriod=async()=>{
    if(!clientId.trim()||!lockDraft) return;
    if(!window.confirm(`Kunci periode ${lockDraft} untuk klien ini? Tidak bisa dibuka lagi lewat aplikasi — jurnal baru untuk periode ini akan ditolak.`)) return;
    setArApBusy(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {error}=await supabase.rpc('trace_lock_period',{p_client_id:clientId.trim(),p_period:lockDraft});
      if(error) throw error;
      setMessage(`Periode ${lockDraft} dikunci.`); await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal mengunci periode.'); } finally{ setArApBusy(false); }
  };

  const seedDefaultChart=async()=>{
    if(!clientId.trim()) return;
    setSeeding(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const {data,error}=await supabase.rpc('trace_seed_default_chart',{p_client_id:clientId.trim()});
      if(error) throw error;
      setMessage(`Chart of accounts default dibuat (${Number(data)??0} akun baru).`);
      await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal: ${e.message}`:'Gagal membuat chart of accounts.'); }
    finally{ setSeeding(false); }
  };

  const ledgerAccounts:LedgerAccount[]=accounts.map(a=>({id:String(a.id),clientId:String(a.client_id??clientId),code:String(a.code),name:String(a.name),type:a.account_type as LedgerAccount['type'],active:Boolean(a.active)}));
  const ledgerEntries:LedgerJournalEntry[]=entries.map(e=>({
    id:String(e.id),clientId:String(e.client_id??clientId),date:String(e.entry_date),memo:String(e.memo),
    source:(e.source as LedgerJournalEntry['source'])??'manual',
    lines:lines.filter(l=>String(l.entry_id)===String(e.id)).map(l=>({accountId:String(l.account_id),debit:Number(l.debit),credit:Number(l.credit),memo:l.memo?String(l.memo):undefined})),
  }));
  const trialBalance=ledgerAccounts.length?buildTrialBalance(ledgerAccounts,ledgerEntries):null;
  const currentPeriodForNeraca=new Date().toISOString().slice(0,7);
  const neraca=trialBalance&&ledgerAccounts.length?buildBalanceSheet(withInferredSubTypes(ledgerAccounts),trialBalance,currentPeriodForNeraca,null):null;
  const neracaGroups:BalanceSheetGroup[]=neraca?[neraca.asetLancar,neraca.asetTetap,neraca.liabilitasLancar,neraca.liabilitasJangkaPanjang,neraca.ekuitas]:[];

  const [entryDate,setEntryDate]=useState(new Date().toISOString().slice(0,10));
  const [entryMemo,setEntryMemo]=useState('');
  const [entryLines,setEntryLines]=useState<JournalLineDraft[]>([{...EMPTY_JOURNAL_LINE},{...EMPTY_JOURNAL_LINE}]);
  const [posting,setPosting]=useState(false);
  const totalDebit=entryLines.reduce((s,l)=>s+(Number(l.debit)||0),0);
  const totalCredit=entryLines.reduce((s,l)=>s+(Number(l.credit)||0),0);
  const linesValid=entryLines.filter(l=>l.accountId&&(Number(l.debit)>0||Number(l.credit)>0)).length>=2;
  const balanced=totalDebit>0&&Math.abs(totalDebit-totalCredit)<0.005;
  const canPost=clientId.trim()&&entryMemo.trim()&&linesValid&&balanced&&!posting;

  const updateLine=(i:number,patch:Partial<JournalLineDraft>)=>setEntryLines(prev=>prev.map((l,idx)=>idx===i?{...l,...patch}:l));
  const addLine=()=>setEntryLines(prev=>[...prev,{...EMPTY_JOURNAL_LINE}]);
  const removeLine=(i:number)=>setEntryLines(prev=>prev.length>2?prev.filter((_,idx)=>idx!==i):prev);

  const postJournal=async()=>{
    if(!canPost) return;
    setPosting(true); setMessage('');
    try{
      const supabase=getReactSupabase(); if(!supabase) throw new Error('Supabase belum dikonfigurasi.');
      const p_lines=entryLines.filter(l=>l.accountId&&(Number(l.debit)>0||Number(l.credit)>0)).map(l=>({account_id:l.accountId,debit:Number(l.debit)||0,credit:Number(l.credit)||0,memo:l.memo.trim()||null}));
      const {error}=await supabase.rpc('trace_post_balanced_journal',{p_client_id:clientId.trim(),p_entry_date:entryDate,p_reference_type:null,p_reference_id:null,p_memo:entryMemo.trim(),p_source:'manual',p_lines});
      if(error) throw error;
      setMessage('Jurnal berhasil diposting.'); setEntryMemo(''); setEntryLines([{...EMPTY_JOURNAL_LINE},{...EMPTY_JOURNAL_LINE}]);
      await refresh();
    }catch(e){ setMessage(e instanceof Error?`Gagal posting: ${e.message}`:'Gagal posting jurnal.'); }
    finally{ setPosting(false); }
  };

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>AKUNTANSI · CHART OF ACCOUNTS, JURNAL, NERACA, PIUTANG/UTANG, ASET TETAP, TUTUP BUKU</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Chart of accounts, jurnal berpasangan, Neraca, dan modul pendukungnya</h1><div className="trace-muted">Terhubung ke trace_accounts / trace_journal_entries / trace_journal_lines / trace_ar_invoices / trace_ar_payments / trace_ap_bills / trace_ap_payments / trace_fixed_assets / trace_period_locks lewat RPC masing-masing (migration 032–033) — bukan draft lokal. Sub-tipe akun untuk Neraca ditebak dari kode akun, belum jadi kolom database.</div></div>

    <div className="trace-card">
      <label>Klien / Scope (wajib)<select value={clientId} onChange={e=>setClientId(e.target.value)} style={inputStyle}><option value="">Pilih klien</option>{clients.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name??c.business_name??c.id)}</option>)}</select></label>
      {message&&<div className="trace-muted" style={{fontSize:12,marginTop:8}}>{message}</div>}
    </div>

    {clientId.trim()&&<div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(280px,.8fr)',gap:16}}>
      <div className="trace-card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Chart of Accounts</strong>{accounts.length===0&&<button onClick={seedDefaultChart} disabled={seeding} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>{seeding?'Membuat…':'Buat Chart Default'}</button>}</div>
        {loading?<div className="trace-muted" style={{marginTop:12}}>Memuat…</div>:loadError?<div className="trace-muted" style={{marginTop:12}}>{loadError}</div>:accounts.length===0?<div className="trace-muted" style={{marginTop:12}}>Belum ada akun. Klik "Buat Chart Default" untuk membuat 10 akun standar (Kas, Piutang, Persediaan, Utang, Modal, Pendapatan, COGS, Labor, OPEX, Marketing).</div>:
        <div style={{marginTop:12,display:'grid',gap:5,fontSize:13}}>{[...accounts].sort((a,b)=>String(a.code).localeCompare(String(b.code))).map(a=><div key={String(a.id)} style={{display:'grid',gridTemplateColumns:'70px 1fr 100px',gap:10,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span className="trace-muted">{String(a.code)}</span><span>{String(a.name)}</span><span className="trace-muted" style={{textTransform:'capitalize'}}>{String(a.account_type)}</span></div>)}</div>}
      </div>

      <div className="trace-card" style={{alignSelf:'start'}}>
        <strong>Trial Balance</strong>
        {!trialBalance?<div className="trace-muted" style={{fontSize:12,marginTop:8}}>Buat chart of accounts dulu.</div>:
        <div style={{marginTop:10}}>
          <div style={{display:'flex',gap:9,alignItems:'center',marginBottom:8}}>{trialBalance.balanced?<CircleCheck size={16}/>:<TriangleAlert size={16}/>}<span style={{fontSize:13,fontWeight:700}}>{trialBalance.balanced?'Balanced':'Belum balanced / ada akun hilang'}</span></div>
          <div style={{display:'grid',gap:4,fontSize:12,maxHeight:260,overflowY:'auto'}}>{trialBalance.accounts.filter(r=>r.debit||r.credit).map(r=>{const acc=ledgerAccounts.find(a=>a.id===r.accountId);return <div key={r.accountId} style={{display:'grid',gridTemplateColumns:'1fr 70px 70px',gap:8,padding:'4px 0',borderTop:'1px solid rgba(23,23,23,.06)'}}><span>{acc?`${acc.code} ${acc.name}`:r.accountId}</span><span>{fmtFieldAmount(r.debit)}</span><span>{fmtFieldAmount(r.credit)}</span></div>})}</div>
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:13,marginTop:8,borderTop:'1px solid rgba(23,23,23,.12)',paddingTop:8}}><span>Total</span><span>{fmtFieldAmount(trialBalance.totalDebit)} / {fmtFieldAmount(trialBalance.totalCredit)}</span></div>
        </div>}
      </div>
    </div>}

    {clientId.trim()&&neraca&&<div className="trace-card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Neraca (Balance Sheet) — {neraca.asOfPeriod}</strong><div style={{display:'flex',gap:9,alignItems:'center'}}>{neraca.balanced?<CircleCheck size={16}/>:<TriangleAlert size={16}/>}<span style={{fontSize:13,fontWeight:700}}>{neraca.balanced?'Balanced':`Selisih ${fmtFieldAmount(neraca.selisih)}`}</span></div></div>
      <div className="trace-muted" style={{fontSize:12,marginTop:6}}>Sub-tipe akun (aset lancar/tetap, liabilitas jangka pendek/panjang, dst) ditebak otomatis dari kode + tipe akun (lihat accountSubTypeInference.ts) — belum jadi kolom database tersendiri.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:14}}>
        <div>
          <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>Aset</div>
          {neracaGroups.slice(0,2).map(g=>g.lines.length>0&&<div key={g.subType} style={{marginBottom:10}}><div className="trace-muted" style={{fontSize:12}}>{g.label}</div>{g.lines.map(l=><div key={l.accountId} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span>{l.accountCode} {l.accountName}</span><span>{fmtFieldAmount(l.balance)}</span></div>)}<div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,borderTop:'1px solid rgba(23,23,23,.1)',paddingTop:4}}><span>Total {g.label}</span><span>{fmtFieldAmount(g.total)}</span></div></div>)}
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,marginTop:6,borderTop:'2px solid #171717',paddingTop:6}}><span>Total Aset</span><span>{fmtFieldAmount(neraca.totalAset)}</span></div>
        </div>
        <div>
          <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>Liabilitas &amp; Ekuitas</div>
          {neracaGroups.slice(2).map(g=>g.lines.length>0&&<div key={g.subType} style={{marginBottom:10}}><div className="trace-muted" style={{fontSize:12}}>{g.label}</div>{g.lines.map(l=><div key={l.accountId} style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span>{l.accountCode} {l.accountName}</span><span>{fmtFieldAmount(l.balance)}</span></div>)}<div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:700,borderTop:'1px solid rgba(23,23,23,.1)',paddingTop:4}}><span>Total {g.label}</span><span>{fmtFieldAmount(g.total)}</span></div></div>)}
          {neraca.labaBerjalan!==null&&<div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span>Laba berjalan (belum ditutup)</span><span>{fmtFieldAmount(neraca.labaBerjalan)}</span></div>}
          <div style={{display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14,marginTop:6,borderTop:'2px solid #171717',paddingTop:6}}><span>Total Liabilitas + Ekuitas</span><span>{fmtFieldAmount(neraca.totalLiabilitasDanEkuitas)}</span></div>
        </div>
      </div>
      {neraca.missingAccountIds.length>0&&<div className="trace-muted" style={{fontSize:12,marginTop:10,color:'#b91c1c'}}>{neraca.missingAccountIds.length} akun punya saldo di jurnal tapi tidak ketemu di chart of accounts — cek data sebelum kirim laporan ke klien.</div>}
    </div>}

    {clientId.trim()&&accounts.length>0&&<div className="trace-card">
      <strong>Posting Jurnal Baru</strong>
      <div style={{display:'grid',gap:10,marginTop:10}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10}}>
          <label>Tanggal<input type="date" value={entryDate} onChange={e=>setEntryDate(e.target.value)} style={inputStyle}/></label>
          <label>Memo<input value={entryMemo} onChange={e=>setEntryMemo(e.target.value)} placeholder="mis. Penjualan tunai 14 Sep" style={inputStyle}/></label>
        </div>
        {entryLines.map((l,i)=><div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,alignItems:'center'}}>
          <select value={l.accountId} onChange={e=>updateLine(i,{accountId:e.target.value})} style={inputStyle}><option value="">Pilih akun</option>{[...accounts].sort((a,b)=>String(a.code).localeCompare(String(b.code))).map(a=><option key={String(a.id)} value={String(a.id)}>{String(a.code)} · {String(a.name)}</option>)}</select>
          <input type="number" placeholder="Debit" value={l.debit} onChange={e=>updateLine(i,{debit:e.target.value,credit:e.target.value?0:l.credit})} style={inputStyle}/>
          <input type="number" placeholder="Kredit" value={l.credit} onChange={e=>updateLine(i,{credit:e.target.value,debit:e.target.value?0:l.debit})} style={inputStyle}/>
          <button onClick={()=>removeLine(i)} disabled={entryLines.length<=2} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 10px',background:'#fff',cursor:entryLines.length>2?'pointer':'not-allowed'}}><X size={14}/></button>
        </div>)}
        <button onClick={addLine} style={{justifySelf:'start',border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 12px',background:'#fff',fontWeight:700,cursor:'pointer'}}>+ Tambah baris</button>
        <div className="trace-muted" style={{fontSize:12}}>Total debit {fmtFieldAmount(totalDebit)} · Total kredit {fmtFieldAmount(totalCredit)} · {balanced?'Sudah balance.':'Belum balance — debit harus sama dengan kredit.'}</div>
        <button onClick={postJournal} disabled={!canPost} style={{justifySelf:'start',border:0,borderRadius:9,padding:'10px 16px',background:canPost?'#171717':'#eee',color:canPost?'#fff':'#999',fontWeight:700,cursor:canPost?'pointer':'not-allowed'}}>{posting?'Memposting…':'Posting Jurnal'}</button>
      </div>
    </div>}

    {clientId.trim()&&entries.length>0&&<div className="trace-card">
      <strong>Histori Jurnal</strong>
      <div style={{marginTop:10,display:'grid',gap:6,fontSize:13}}>{[...entries].sort((a,b)=>String(b.entry_date).localeCompare(String(a.entry_date))).map(e=><div key={String(e.id)} style={{padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><div style={{display:'flex',justifyContent:'space-between'}}><span>{String(e.entry_date)}</span><span className="trace-muted">{String(e.source)}</span></div><div>{String(e.memo)}</div></div>)}</div>
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Piutang Usaha (AR) &amp; Umur Piutang</strong>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Nama pelanggan<input value={arDraft.customerName} onChange={e=>setArDraft(d=>({...d,customerName:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl invoice<input type="date" value={arDraft.invoiceDate} onChange={e=>setArDraft(d=>({...d,invoiceDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jatuh tempo<input type="date" value={arDraft.dueDate} onChange={e=>setArDraft(d=>({...d,dueDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jumlah<input type="number" value={arDraft.amount} onChange={e=>setArDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <button onClick={createArInvoice} disabled={arApBusy} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>+ Invoice</button>
      </div>
      {arAging&&<div style={{marginTop:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,fontSize:12}}>{(Object.keys(arAging.buckets) as Array<keyof typeof arAging.buckets>).map(b=><div key={b} style={{border:'1px solid rgba(23,23,23,.1)',borderRadius:9,padding:8}}><div className="trace-muted">{b}</div><div style={{fontWeight:700}}>{fmtFieldAmount(arAging.buckets[b])}</div></div>)}</div>
        <div style={{marginTop:10,fontSize:13,fontWeight:700}}>Total belum tertagih: {fmtFieldAmount(arAging.totalOutstanding)}</div>
        <div style={{marginTop:10,display:'grid',gap:5,fontSize:13,maxHeight:220,overflowY:'auto'}}>{arAging.invoices.map(s=><div key={s.invoice.id} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 90px 90px',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{s.invoice.customerName}</span><span className="trace-muted">jth {s.invoice.dueDate}</span><span>{fmtFieldAmount(s.outstanding)} sisa</span><span className="trace-muted">{s.status}</span><span className="trace-muted">{s.agingBucket}</span></div>)}</div>
      </div>}
      {arInvoices.length>0&&<div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginTop:14,alignItems:'end'}}>
        <label style={{fontSize:12}}>Invoice<select value={arPaymentDraft.invoiceId} onChange={e=>setArPaymentDraft(d=>({...d,invoiceId:e.target.value}))} style={inputStyle}><option value="">Pilih invoice</option>{arInvoices.map(i=><option key={i.id} value={i.id}>{i.customerName} · {fmtFieldAmount(i.amount)}</option>)}</select></label>
        <label style={{fontSize:12}}>Jumlah bayar<input type="number" value={arPaymentDraft.amount} onChange={e=>setArPaymentDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl bayar<input type="date" value={arPaymentDraft.paidDate} onChange={e=>setArPaymentDraft(d=>({...d,paidDate:e.target.value}))} style={inputStyle}/></label>
        <button onClick={recordArPayment} disabled={arApBusy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 14px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Catat Bayar</button>
      </div>}
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Utang Usaha (AP) &amp; Umur Utang</strong>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Nama supplier<input value={apDraft.vendorName} onChange={e=>setApDraft(d=>({...d,vendorName:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl tagihan<input type="date" value={apDraft.billDate} onChange={e=>setApDraft(d=>({...d,billDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jatuh tempo<input type="date" value={apDraft.dueDate} onChange={e=>setApDraft(d=>({...d,dueDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Jumlah<input type="number" value={apDraft.amount} onChange={e=>setApDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <button onClick={createApBill} disabled={arApBusy} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>+ Tagihan</button>
      </div>
      {apAging&&<div style={{marginTop:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,fontSize:12}}>{(Object.keys(apAging.buckets) as Array<keyof typeof apAging.buckets>).map(b=><div key={b} style={{border:'1px solid rgba(23,23,23,.1)',borderRadius:9,padding:8}}><div className="trace-muted">{b}</div><div style={{fontWeight:700}}>{fmtFieldAmount(apAging.buckets[b])}</div></div>)}</div>
        <div style={{marginTop:10,fontSize:13,fontWeight:700}}>Total belum dibayar: {fmtFieldAmount(apAging.totalOutstanding)}</div>
        <div style={{marginTop:10,display:'grid',gap:5,fontSize:13,maxHeight:220,overflowY:'auto'}}>{apAging.bills.map(s=><div key={s.bill.id} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 90px 90px',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{s.bill.vendorName}</span><span className="trace-muted">jth {s.bill.dueDate}</span><span>{fmtFieldAmount(s.outstanding)} sisa</span><span className="trace-muted">{s.status}</span><span className="trace-muted">{s.agingBucket}</span></div>)}</div>
      </div>}
      {apBills.length>0&&<div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr auto',gap:8,marginTop:14,alignItems:'end'}}>
        <label style={{fontSize:12}}>Tagihan<select value={apPaymentDraft.billId} onChange={e=>setApPaymentDraft(d=>({...d,billId:e.target.value}))} style={inputStyle}><option value="">Pilih tagihan</option>{apBills.map(b=><option key={b.id} value={b.id}>{b.vendorName} · {fmtFieldAmount(b.amount)}</option>)}</select></label>
        <label style={{fontSize:12}}>Jumlah bayar<input type="number" value={apPaymentDraft.amount} onChange={e=>setApPaymentDraft(d=>({...d,amount:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl bayar<input type="date" value={apPaymentDraft.paidDate} onChange={e=>setApPaymentDraft(d=>({...d,paidDate:e.target.value}))} style={inputStyle}/></label>
        <button onClick={recordApPayment} disabled={arApBusy} style={{border:'1px solid rgba(23,23,23,.14)',borderRadius:9,padding:'8px 14px',background:'#fff',fontWeight:700,cursor:'pointer'}}>Catat Bayar</button>
      </div>}
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Aset Tetap &amp; Penyusutan</strong>
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr 1fr auto',gap:8,marginTop:10,alignItems:'end'}}>
        <label style={{fontSize:12}}>Nama aset<input value={assetDraft.name} onChange={e=>setAssetDraft(d=>({...d,name:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Tgl beli<input type="date" value={assetDraft.acquisitionDate} onChange={e=>setAssetDraft(d=>({...d,acquisitionDate:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Harga beli<input type="number" value={assetDraft.acquisitionCost} onChange={e=>setAssetDraft(d=>({...d,acquisitionCost:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Umur (bulan)<input type="number" value={assetDraft.usefulLifeMonths} onChange={e=>setAssetDraft(d=>({...d,usefulLifeMonths:e.target.value}))} style={inputStyle}/></label>
        <label style={{fontSize:12}}>Nilai sisa<input type="number" value={assetDraft.residualValue} onChange={e=>setAssetDraft(d=>({...d,residualValue:e.target.value}))} style={inputStyle}/></label>
        <button onClick={createFixedAsset} disabled={arApBusy} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>+ Aset</button>
      </div>
      {fixedAssetsList.length>0&&<div style={{marginTop:14}}>
        <div style={{fontSize:13,fontWeight:700}}>Total penyusutan/bulan (semua aset): {fmtFieldAmount(monthlyDepreciationTotal)}</div>
        <div style={{marginTop:10,display:'grid',gap:5,fontSize:13}}>{fixedAssetsList.map(a=>{const sched=buildDepreciationSchedule(a,[currentPeriod]); return <div key={a.id} style={{display:'grid',gridTemplateColumns:'1.4fr 1fr 1fr 1fr',gap:8,padding:'6px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{a.name}</span><span className="trace-muted">beli {a.acquisitionDate}</span><span>{fmtFieldAmount(sched.monthlyDepreciation)}/bln</span><span className="trace-muted">{sched.fullyDepreciated?'lunas susut':`sisa buku ${fmtFieldAmount(sched.schedule[0]?.bookValue)}`}</span></div>;})}</div>
      </div>}
    </div>}

    {clientId.trim()&&<div className="trace-card">
      <strong>Tutup Buku (Period Lock)</strong>
      <div className="trace-muted" style={{fontSize:12,marginTop:6}}>Mengunci periode mencegah jurnal baru diposting ke bulan itu — tidak bisa dibuka lagi lewat aplikasi. Periode berjalan ({currentPeriod}): <b>{currentPeriodLocked?'sudah terkunci':'masih terbuka'}</b>.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,marginTop:10,maxWidth:320}}>
        <input type="month" value={lockDraft} onChange={e=>setLockDraft(e.target.value)} style={inputStyle}/>
        <button onClick={lockPeriod} disabled={arApBusy||periodLocks.some(l=>l.period===lockDraft)} style={{border:0,borderRadius:9,padding:'8px 14px',background:'#b91c1c',color:'#fff',fontWeight:700,cursor:'pointer'}}>Kunci Periode</button>
      </div>
      {periodLocks.length>0&&<div style={{marginTop:12,display:'grid',gap:4,fontSize:13}}>{[...periodLocks].sort((a,b)=>b.period.localeCompare(a.period)).map(l=><div key={l.period} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderTop:'1px solid rgba(23,23,23,.07)'}}><span>{l.period}</span><span className="trace-muted">dikunci {String(l.lockedAt).slice(0,10)}</span></div>)}</div>}
    </div>}

    <div className="trace-card" style={{background:'#fff7ed',border:'1px solid #fed7aa'}}>
      <strong style={{fontSize:13}}>Belum termasuk di layar ini</strong>
      <div className="trace-muted" style={{fontSize:12,marginTop:6}}>COGS resep (`calculateRecipeCogs`) belum ada UI-nya di sini karena butuh input komponen resep per produk yang saat ini hidup di modul inventory — akan menyusul sebagai layar terpisah, bukan diklaim selesai di sini.</div>
    </div>
  </div>
}

const CHANNEL_OPTIONS:Array<[SaleLine['channel'],string]>=[['dine_in','Dine-in'],['gofood','GoFood'],['grabfood','GrabFood'],['shopeefood','ShopeeFood'],['other','Lainnya']];
type ProductDraft={id:string|null;version:number|null;clientId:string;outletId:string;productName:string;menuCategory:string;price:number|string};
const EMPTY_PRODUCT_DRAFT:ProductDraft={id:null,version:null,clientId:'',outletId:'',productName:'',menuCategory:'',price:''};
type SaleDraft={clientId:string;outletId:string;productId:string;channel:SaleLine['channel'];qty:number|string;soldAt:string};
const EMPTY_SALE_DRAFT:SaleDraft={clientId:'',outletId:'',productId:'',channel:'dine_in',qty:1,soldAt:new Date().toISOString().slice(0,16)};

function SalesView(){
  const [tab,setTab]=useState<'produk'|'transaksi'|'dashboard'>('dashboard');
  const [products,setProducts]=useState<Array<Record<string,unknown>>>([]);
  const [sales,setSales]=useState<Array<Record<string,unknown>>>([]);
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [clientId,setClientId]=useState('');
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
  const Panel=({title,items}:{title:string;items:BreakdownItemLike[]})=><div className="trace-card"><strong style={{fontSize:13}}>{title}</strong>{items.length===0?<div className="trace-muted" style={{fontSize:12,marginTop:8}}>Belum ada data.</div>:<div style={{marginTop:10,display:'grid',gap:5}}>{items.map((it,i)=><div key={it.label} style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span>{i+1}. {it.label}</span><strong>{it.sharePct}%</strong></div>)}</div>}</div>;

  return <div style={{display:'grid',gap:16}}>
    <div className="trace-card" style={{padding:26}}><div className="trace-muted" style={{fontSize:12}}>PENJUALAN & DASHBOARD</div><h1 style={{margin:'7px 0 5px',fontSize:30}}>Katalog produk, transaksi, dan analitik penjualan</h1><div className="trace-muted">Dashboard di bawah dihitung langsung dari transaksi yang tercatat — tidak ada angka contoh. Belum ada fitur target/pembanding tahun lalu; itu perlu fitur "target periode" terpisah yang belum dibangun.</div></div>
    <div className="trace-card"><label>Klien / Scope<input value={clientId} onChange={e=>setClientId(e.target.value)} placeholder="mis. nama-klien (harus sama dengan yang dipakai di Keuangan)" style={inputStyle}/></label></div>
    <div style={{display:'flex',gap:18,borderBottom:'1px solid rgba(23,23,23,.08)'}}><TabBtn id="dashboard" label="Dashboard"/><TabBtn id="produk" label="Produk"/><TabBtn id="transaksi" label="Transaksi"/></div>
    {message&&<div className="trace-muted" style={{fontSize:12}}>{message}</div>}
    {!clientId.trim()&&<div className="trace-card"><div className="trace-muted">Isi Klien/Scope dulu di atas untuk melihat atau mencatat data.</div></div>}

    {clientId.trim()&&tab==='produk'&&<div className="trace-card">
      <strong>Tambah / edit produk</strong>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:10}}>
        <label>Nama Produk<input value={productDraft.productName} onChange={e=>setProductDraft({...productDraft,productName:e.target.value})} style={inputStyle}/></label>
        <label>Kategori Menu<input value={productDraft.menuCategory} onChange={e=>setProductDraft({...productDraft,menuCategory:e.target.value})} style={inputStyle}/></label>
        <label>Outlet (opsional)<input value={productDraft.outletId} onChange={e=>setProductDraft({...productDraft,outletId:e.target.value})} style={inputStyle}/></label>
        <label>Harga Jual<input type="number" value={productDraft.price} onChange={e=>setProductDraft({...productDraft,price:e.target.value===''?'':Number(e.target.value)})} style={inputStyle}/></label>
      </div>
      <button onClick={saveProduct} disabled={saving} style={{marginTop:12,border:0,borderRadius:9,padding:'10px 16px',background:'#171717',color:'#fff',fontWeight:700,cursor:'pointer'}}>{productDraft.id?'Update Produk':'Simpan Produk'}</button>
      <div style={{marginTop:16,display:'grid',gap:6}}>{loading?<div className="trace-muted">Memuat…</div>:scopedProducts.length===0?<div className="trace-muted">Belum ada produk untuk klien ini.</div>:scopedProducts.map(p=><div key={String(p.id)} onClick={()=>setProductDraft({id:String(p.id),version:Number(p.version),clientId,outletId:String(p.outlet_id??''),productName:String(p.product_name),menuCategory:String(p.menu_category??''),price:Number(p.price)})} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:10,padding:'8px 0',borderTop:'1px solid rgba(23,23,23,.07)',fontSize:13,cursor:'pointer'}}><span>{String(p.product_name)}</span><span className="trace-muted">{String(p.menu_category??'—')}</span><strong>{fmtFieldAmount(p.price)}</strong></div>)}</div>
    </div>}

    {clientId.trim()&&tab==='transaksi'&&<div className="trace-card">
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
    </div>}

    {clientId.trim()&&tab==='dashboard'&&<>
      <div className="trace-card"><div className="trace-muted" style={{fontSize:12}}>TOTAL REVENUE (SEMUA TRANSAKSI TERCATAT)</div><div style={{fontSize:30,fontWeight:800,marginTop:6}}>{fmtFieldAmount(dashboard.totalRevenue)}</div></div>
      {dashboard.monthlyRevenue.length>0&&<div className="trace-card"><strong style={{fontSize:13}}>Revenue per bulan</strong><div style={{width:'100%',height:220,marginTop:10}}><ResponsiveContainer><BarChart data={dashboard.monthlyRevenue}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="period" fontSize={11}/><YAxis fontSize={11}/><RTooltip formatter={(v)=>fmtFieldAmount(v as number)}/><Bar dataKey="value" fill="#171717"/></BarChart></ResponsiveContainer></div></div>}
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
type BreakdownItemLike={label:string;value:number;sharePct:number};

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
