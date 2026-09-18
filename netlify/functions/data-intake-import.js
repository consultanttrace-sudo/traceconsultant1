const crypto = require('node:crypto');
const { cors, requireAuth, fetchWithTimeout } = require('./_auth');
const BASE=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const KEY=process.env.SUPABASE_ANON_KEY||'';
const json=(status,body,event)=>({statusCode:status,headers:{...cors(event),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
function hashSource(source){return crypto.createHash('sha256').update(String(source||'')).digest('hex');}
function safeStatus(s){return ['draft','reviewed','approved','rejected'].includes(s)?s:'draft';}
function bounded(value,depth=0){if(depth>4)return '[truncated]';if(value===null||typeof value==='number'||typeof value==='boolean')return value;if(typeof value==='string')return value.length>4000?value.slice(0,4000)+'…':value;if(Array.isArray(value))return value.slice(0,500).map(v=>bounded(v,depth+1));if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,200))out[String(k).slice(0,120)]=bounded(v,depth+1);return out}return String(value)}
exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return json(204,{},event);
  if(event.httpMethod!=='POST')return json(405,{error:'POST only'},event);
  const auth=await requireAuth(event); if(!auth.ok)return json(auth.statusCode,{error:auth.error},event);
  if(!BASE||!KEY)return json(503,{error:'Supabase environment is not configured'},event);
  let b={}; try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid JSON'},event)}
  const sourceHash=String(b.sourceHash||hashSource(b.sourceContentHash||b.sourceName||''));
  if(!/^[a-f0-9]{64}$/i.test(sourceHash))return json(400,{error:'sourceHash must be a SHA-256 hex digest'},event);
  const payload=b.payload&&typeof b.payload==='object'?bounded(b.payload):{};
  const evidence=Array.isArray(b.evidence)?bounded(b.evidence):[];
  const status=safeStatus(b.status);
  const clientId=String(b.clientId||payload.organizationId||'').trim()||null;
  try{
    const authHeader=event.headers?.authorization||event.headers?.Authorization||'';
    const r=await fetchWithTimeout(`${BASE}/rest/v1/rpc/trace_transition_data_intake`,{
      method:'POST',
      headers:{apikey:KEY,Authorization:authHeader,'content-type':'application/json'},
      body:JSON.stringify({p_source_hash:sourceHash,p_source_name:String(b.sourceName||'unknown').slice(0,255),p_source_type:String(b.sourceType||'unknown').slice(0,40),p_status:status,p_payload:payload,p_evidence:evidence,p_client_id:clientId})
    },10000);
    const text=await r.text();
    let body={}; try{body=text?JSON.parse(text):{}}catch{}
    if(!r.ok){
      const detail=String(body?.message||body?.hint||body?.details||body?.error||'');
      if(/TRACE_IMPORT_CLIENT_REQUIRED/i.test(detail))return json(400,{error:'Client ID wajib dipilih sebelum approve import.'},event);
      if(/TRACE_IMPORT_CLIENT_FORBIDDEN/i.test(detail))return json(403,{error:'Client scope tidak diizinkan untuk user ini.'},event);
      if(/TRACE_IMPORT_INVALID_STATUS_TRANSITION/i.test(detail))return json(409,{error:'Status import tidak mengikuti alur Draft → Reviewed → Approved.'},event);
      if(/TRACE_IMPORT_TEAM_MEMBER_REQUIRED|TRACE_IMPORT_AUTH_REQUIRED/i.test(detail))return json(403,{error:'User tidak memiliki akses team TRACE.'},event);
      return json(r.status>=400&&r.status<500?r.status:502,{error:'Data Intake persistence failed',detail:detail.slice(0,300)},event);
    }
    return json(202,{ok:true,status,idempotent:body?.idempotent??false,import:body?.import??body},event);
  }catch(error){return json(502,{error:error?.name==='AbortError'?'Data Intake persistence timeout':'Data Intake persistence unavailable'},event)}
};
