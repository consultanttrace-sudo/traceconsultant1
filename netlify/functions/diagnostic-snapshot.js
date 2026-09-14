const fs = require('node:fs');
const path = require('node:path');
const { cors, requireAuth, fetchWithTimeout } = require('./_auth');

function response(statusCode, body, event){
  return { statusCode, headers:{...cors(event),'content-type':'application/json','cache-control':'no-store'}, body:JSON.stringify(body) };
}
async function isLeader(user,event){
  const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_ANON_KEY||'';
  const auth=event.headers?.authorization||event.headers?.Authorization||'';
  if(!base||!key) return {ok:false,error:'Supabase environment is not configured'};
  try{
    const r=await fetchWithTimeout(`${base}/rest/v1/rpc/trace_is_leader`,{method:'POST',headers:{apikey:key,Authorization:auth,'content-type':'application/json'}},2500);
    if(!r.ok) return {ok:false,error:'Leader authorization could not be verified'};
    const value=await r.json();
    return {ok:value===true};
  }catch(error){return {ok:false,error:error?.message||'Leader authorization unavailable'};}
}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:cors(event),body:''};
  if(event.httpMethod!=='GET') return response(405,{error:'GET only'},event);
  const auth=await requireAuth(event);
  if(!auth.ok) return response(auth.statusCode,{error:auth.error},event);
  const leader=await isLeader(auth.user,event);
  if(!leader.ok) return response(403,{error:leader.error||'Leader role required'},event);
  const manifestPath=path.join(__dirname,'_diagnostic-manifest.json');
  if(!fs.existsSync(manifestPath)) return response(503,{error:'Diagnostic manifest unavailable. Run the diagnostic manifest build step.'},event);
  try{
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    return response(200,{readOnly:true,generatedAt:manifest.generatedAt,fileCount:manifest.files.length,files:manifest.files.map(f=>({path:f.path,bytes:Buffer.byteLength(f.content,'utf8')}))},event);
  }catch(error){return response(500,{error:'Diagnostic manifest unreadable',detail:error?.message||String(error)},event);}
};
