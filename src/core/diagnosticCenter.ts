import { fetchWithTimeout } from './browserNetwork.js';
import type { DiagnosticFinding } from './aiDiagnostic.js';

export type DiagnosticSourceId = 'source'|'dependencies'|'supabase'|'network'|'runtime'|'performance'|'data'|'jobs'|'tests'|'ide';
export type DiagnosticSourceStatus = 'connected'|'partial'|'unavailable'|'blocked';
export interface DiagnosticSource { id: DiagnosticSourceId; label: string; status: DiagnosticSourceStatus; detail: string; evidenceCount: number; lastCheckedAt?: string; }
export interface RuntimeDiagnosticEvent { type:'error'|'unhandledrejection'; message:string; file?:string; line?:number; stack?:string; timestamp:string; }
export interface PerformanceDiagnosticEvent { name:string; durationMs:number; entryType:string; thresholdMs:number; timestamp:string; }
export interface DiagnosticTelemetrySnapshot { runtimeErrors:RuntimeDiagnosticEvent[]; performance:PerformanceDiagnosticEvent[]; networkSlowCount:number; }
export interface DiagnosticCenterSnapshot { generatedAt:string; sources:DiagnosticSource[]; findings:DiagnosticFinding[]; telemetry:DiagnosticTelemetrySnapshot; readOnly:true; }

export function createEmptyDiagnosticCenterSnapshot(now=new Date().toISOString()):DiagnosticCenterSnapshot{return{generatedAt:now,readOnly:true,sources:[
{id:'source',label:'Source code',status:'partial',detail:'Repository manifest tersedia melalui server-side diagnostic bridge; source tidak diekspos mentah ke browser.',evidenceCount:0},
{id:'dependencies',label:'Dependencies',status:'partial',detail:'package.json dapat discan; resolusi dependency runtime harus dibuktikan lewat build/typecheck.',evidenceCount:0},
{id:'supabase',label:'Supabase / RLS',status:'unavailable',detail:'Belum ada koneksi runtime yang berhasil diverifikasi pada scan ini.',evidenceCount:0},
{id:'network',label:'Network / API',status:'connected',detail:'Resource timing browser dikumpulkan; payload/header sensitif tidak dikirim.',evidenceCount:0},
{id:'runtime',label:'Runtime errors',status:'connected',detail:'window error dan unhandled rejection dikumpulkan selama sesi.',evidenceCount:0},
{id:'performance',label:'Performance',status:'connected',detail:'Resource timing dan PerformanceObserver digunakan bila tersedia.',evidenceCount:0},
{id:'data',label:'Data integrity',status:'partial',detail:'Memerlukan evidence dari Data Intake, Finance, Acquisition, dan modul terkait.',evidenceCount:0},
{id:'jobs',label:'Jobs / persistence',status:'partial',detail:'Memerlukan telemetry trace_jobs dan checkpoint dari workflow.',evidenceCount:0},
{id:'tests',label:'Tests / build',status:'unavailable',detail:'Hanya hasil test/build yang benar-benar dikirim yang boleh dianggap evidence.',evidenceCount:0},
{id:'ide',label:'Cursor / IDE',status:'unavailable',detail:'Tidak ada akses langsung ke Cursor. Hanya evidence dari IDE bridge yang sah.',evidenceCount:0},
],findings:[],telemetry:{runtimeErrors:[],performance:[],networkSlowCount:0}};}

let cleanup:(()=>void)|null=null;
let runtimeErrors:RuntimeDiagnosticEvent[]=[];
let performanceEvents:PerformanceDiagnosticEvent[]=[];

function stackLocation(stack?:string){if(!stack)return{};const m=stack.match(/(?:at\s+.*?\s+)?(?:\(|\s)([^():\s]+):([0-9]+):[0-9]+\)?/);return m?{file:m[1],line:Number(m[2])}:{};}
function recordPerformance(entries:PerformanceEntry[], threshold:number){for(const entry of entries){if(entry.duration<threshold)continue;performanceEvents.push({name:entry.name,durationMs:Math.round(entry.duration),entryType:entry.entryType,thresholdMs:threshold,timestamp:new Date().toISOString()});}performanceEvents=performanceEvents.slice(-200);}

export function startBrowserTelemetry(performanceThresholdMs=1500){
  if(typeof window==='undefined') return ()=>{};
  if(cleanup) return cleanup;
  const onError=(event:ErrorEvent)=>{const loc=stackLocation(event.error?.stack);runtimeErrors.push({type:'error',message:event.message||'Unknown runtime error',file:event.filename||loc.file,line:event.lineno||loc.line,stack:event.error?.stack,timestamp:new Date().toISOString()});runtimeErrors=runtimeErrors.slice(-200);};
  const onRejection=(event:PromiseRejectionEvent)=>{const reason=event.reason instanceof Error?event.reason:new Error(String(event.reason));const loc=stackLocation(reason.stack);runtimeErrors.push({type:'unhandledrejection',message:reason.message,file:loc.file,line:loc.line,stack:reason.stack,timestamp:new Date().toISOString()});runtimeErrors=runtimeErrors.slice(-200);};
  window.addEventListener('error',onError);window.addEventListener('unhandledrejection',onRejection);
  let observer:PerformanceObserver|undefined;
  try{observer=new PerformanceObserver(list=>recordPerformance(list.getEntries(),performanceThresholdMs));observer.observe({type:'resource',buffered:true});}catch{try{observer=new PerformanceObserver(list=>recordPerformance(list.getEntries(),performanceThresholdMs));observer.observe({entryTypes:['resource']});}catch{observer=undefined;}}
  try{recordPerformance(window.performance.getEntriesByType('resource'),performanceThresholdMs);}catch{}
  cleanup=()=>{window.removeEventListener('error',onError);window.removeEventListener('unhandledrejection',onRejection);observer?.disconnect();cleanup=null;};
  return cleanup;
}

export function collectBrowserTelemetry(performanceThresholdMs=1500):DiagnosticTelemetrySnapshot{
  startBrowserTelemetry(performanceThresholdMs);
  let current:PerformanceEntry[]=[];try{current=window.performance.getEntriesByType('resource');}catch{}
  recordPerformance(current,performanceThresholdMs);
  const dedup=new Map<string,PerformanceDiagnosticEvent>();for(const e of performanceEvents)dedup.set(`${e.name}:${e.durationMs}:${e.timestamp.slice(0,16)}`,e);
  const performance=[...dedup.values()].slice(-200);
  return{runtimeErrors:[...runtimeErrors],performance,networkSlowCount:performance.filter(e=>/^https?:\/\//i.test(e.name)).length};
}
export function disposeBrowserTelemetry(){cleanup?.();runtimeErrors=[];performanceEvents=[];}

export type DiagnosticTelemetryKind='runtime'|'performance'|'network'|'data'|'job'|'test'|'supabase'|'dependency'|'security'|'usage';
export interface DiagnosticTelemetryEvent { kind: DiagnosticTelemetryKind; event: Record<string, unknown>; }

export async function sendDiagnosticTelemetry(events: DiagnosticTelemetryEvent[], endpoint='/api/diagnostic-telemetry', token?:string){
  if(typeof fetch==='undefined' || !events.length || !token) return {sent:false, reason:'unavailable'};
  const safe=events.slice(-100).map(item=>({kind:item.kind,event:item.event}));
  try{
    const response=await fetchWithTimeout(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({events:safe}),keepalive:true},5000);
    if(!response.ok) return {sent:false, reason:`http_${response.status}`};
    return {sent:true, count:safe.length};
  }catch(error){ return {sent:false, reason:error instanceof Error?error.message:'telemetry_unavailable'}; }
}
