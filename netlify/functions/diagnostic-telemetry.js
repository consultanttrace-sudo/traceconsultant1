const { cors, requireAuth, fetchWithTimeout } = require('./_auth');
function response(statusCode, body, event){return{statusCode,headers:{...cors(event),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)}}
function sanitize(value, depth=0){
  if(depth>4) return '[truncated]';
  if(value===null||typeof value==='number'||typeof value==='boolean') return value;
  if(typeof value==='string') return value.length>4000?value.slice(0,4000)+'…':value;
  if(Array.isArray(value)) return value.slice(0,50).map(v=>sanitize(v,depth+1));
  if(typeof value==='object'){
    const out={};
    for(const [k,v] of Object.entries(value)){
      if(/authorization|cookie|token|password|secret|api[-_]?key|private[-_]?key/i.test(k)) continue;
      out[k]=sanitize(v,depth+1);
    }
    return out;
  }
  return String(value);
}
exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:cors(event),body:''};
  if(event.httpMethod!=='POST')return response(405,{error:'POST only'},event);
  const auth=await requireAuth(event); if(!auth.ok)return response(auth.statusCode,{error:auth.error},event);
  let body; try{body=JSON.parse(event.body||'{}')}catch{return response(400,{error:'Invalid JSON'},event)}
  const events=Array.isArray(body.events)?body.events.slice(0,100):[];
  if(!events.length)return response(400,{error:'events[] is required'},event);
  for(const item of events){if(!item||typeof item.kind!=='string'||!['runtime','performance','network','data','job','test','supabase','dependency','security','usage'].includes(item.kind))return response(400,{error:'Unsupported telemetry kind'},event)}
  const base=(process.env.SUPABASE_URL||'').replace(/\/$/,''); const key=process.env.SUPABASE_ANON_KEY||''; const authHeader=event.headers?.authorization||event.headers?.Authorization||'';
  if(!base||!key)return response(503,{error:'Supabase environment is not configured'},event);
  const rows=events.map(payload=>({kind:payload.kind,payload:sanitize(payload),created_at:new Date().toISOString(),actor_user_id:auth.user.id}));
  try{
    const r=await fetchWithTimeout(`${base}/rest/v1/trace_diagnostic_events`,{method:'POST',headers:{apikey:key,Authorization:authHeader,'content-type':'application/json','prefer':'return=minimal'},body:JSON.stringify(rows)},4000);
    if(!r.ok)return response(r.status===401||r.status===403?403:502,{error:'Diagnostic telemetry persistence failed'},event);
    return response(202,{accepted:events.length},event);
  }catch(error){return response(502,{error:error?.name==='AbortError'?'Diagnostic telemetry persistence timeout':'Diagnostic telemetry unavailable'},event)}
};
