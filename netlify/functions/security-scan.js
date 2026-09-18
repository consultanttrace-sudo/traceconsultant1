const fs = require('node:fs');
const path = require('node:path');
const { cors, requireAuth, fetchWithTimeout } = require('./_auth');

const response=(status,body,event)=>({statusCode:status,headers:{...cors(event),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
const SENSITIVE=/(authorization|cookie|token|password|secret|api[-_]?key|private[-_]?key|service[-_]?role)/i;
function add(out,x,id){out.push({...x,id});}
function lineOf(c,i){return c.slice(0,i).split(/\r?\n/).length;}
function scan(files){
  const out=[];
  for(const file of files||[]){
    const c=String(file.content||''), p=String(file.path||'');
    const secret=/(?:SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|PRIVATE_KEY|SECRET_KEY)\s*=\s*["'`]?\w[\w.\-]{15,}/.exec(c);
    if(secret)add(out,{severity:'critical',category:'secrets',status:'confirmed',title:'Potential secret embedded in source',cause:'A privileged/secret key pattern appears in the scanned source.',impact:'A leaked repository or bundle could expose privileged credentials.',recommendation:'Remove it from source and rotate it if real; privileged keys must remain server-side.',evidence:[{source:'server manifest',file:p,line:lineOf(c,secret.index),detail:'Secret-like assignment detected.'}]},`secret:${p}`);
    const priv=/createClient\([^\n]*(SERVICE_ROLE|service_role)|Authorization:\s*`Bearer \$\{[^}]*SERVICE_ROLE/i.exec(c);
    if(priv)add(out,{severity:'critical',category:'data_access',status:'suspected',title:'Privileged Supabase credential may reach client code',cause:'A service-role-like credential reference appears in code.',impact:'A browser context could gain privileged database access if the reference is real.',recommendation:'Use only the publishable/anon key in browser code; keep service-role access server-side.',evidence:[{source:'server manifest',file:p,line:lineOf(c,priv.index),detail:'Privileged credential reference detected.'}]},`priv-client:${p}`);
    const storage=/localStorage\.(?:setItem|getItem)\([^\n]*(?:token|session|password|secret|apikey)/i.exec(c);
    if(storage)add(out,{severity:'high',category:'secrets',status:'suspected',title:'Sensitive authentication material may be stored in localStorage',cause:'A sensitive key name is accessed through localStorage.',impact:'XSS or a compromised browser context could expose reusable credentials.',recommendation:'Use the auth library session mechanism; never manually persist secrets.',evidence:[{source:'server manifest',file:p,line:lineOf(c,storage.index),detail:'Sensitive localStorage pattern detected.'}]},`storage-secret:${p}`);
    const corsWild=/Access-Control-Allow-Origin[^\n]*\*/i.exec(c);
    if(corsWild)add(out,{severity:'medium',category:'transport',status:'confirmed',title:'Wildcard CORS detected',cause:'A response policy allows every origin.',impact:'Cross-origin callers may reach an endpoint if other controls fail.',recommendation:'Use the explicit production origin allowlist.',evidence:[{source:'server manifest',file:p,line:lineOf(c,corsWild.index),detail:'Wildcard CORS policy detected.'}]},`cors:${p}`);
  }
  return out;
}
exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:cors(event),body:''};
  if(event.httpMethod!=='POST')return response(405,{error:'POST only'},event);
  const auth=await requireAuth(event); if(!auth.ok)return response(auth.statusCode,{error:auth.error},event);
  try{
    const manifestPath=path.join(__dirname,'_diagnostic-manifest.json');
    if(!fs.existsSync(manifestPath)) return response(503,{error:'Security manifest unavailable',status:'blocked',message:'Server-side diagnostic manifest belum tersedia. Jalankan build:react agar manifest dibuat dan ikut dideploy.'},event);
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    const staticFindings=scan(manifest.files||[]);
    let telemetry=[];
    const base=(process.env.SUPABASE_URL||'').replace(/\/$/,''); const key=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||''; const bearer=key?`Bearer ${key}`:(event.headers?.authorization||event.headers?.Authorization||'');
    if(base&&key){
      try{const r=await fetchWithTimeout(`${base}/rest/v1/trace_diagnostic_events?select=kind,payload,created_at&order=created_at.desc&limit=200`,{headers:{apikey:key,Authorization:bearer}},2500);if(r.ok)telemetry=await r.json();}catch{}
    }
    const authFailures=telemetry.filter(x=>x?.kind==='auth'&&/fail|denied|invalid|expired|unauthorized|forbidden/i.test(JSON.stringify(x?.payload||{}))).length;
    if(authFailures>=5)add(staticFindings,{severity:'high',category:'anomaly',status:'confirmed',title:'Repeated authentication failures detected',cause:`${authFailures} authentication-failure events were recorded.`,impact:'Could indicate credential abuse or an integration/session problem.',recommendation:'Inspect access logs, rate-limit sensitive endpoints, revoke suspicious sessions, and review auth configuration.',evidence:[{source:'runtime telemetry',detail:`${authFailures} matching auth-failure events.`}]},'auth-failure-burst');
    const result=[...staticFindings].filter((f,i,a)=>a.findIndex(x=>x.id===f.id)===i);
    return response(200,{ok:true,status:result.some(f=>f.status==='confirmed'&&['critical','high'].includes(f.severity))?'HIGH_RISK':result.length?'REVIEW':'NO_CONFIRMED_FINDING',findings:result,scannedFiles:(manifest.files||[]).length,generatedAt:new Date().toISOString()},event);
  }catch(e){return response(500,{error:'Security scan failed',detail:e?.message||String(e)},event)}
};
