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
  const row={actor_user_id:auth.user.id,source_hash:sourceHash,source_name:String(b.sourceName||'unknown').slice(0,255),source_type:String(b.sourceType||'unknown').slice(0,40),status,payload,evidence};
  try{
    const authHeader=event.headers?.authorization||event.headers?.Authorization||'';
    const existingResponse=await fetchWithTimeout(`${BASE}/rest/v1/trace_data_intake_imports?actor_user_id=eq.${encodeURIComponent(auth.user.id)}&source_hash=eq.${encodeURIComponent(sourceHash)}&select=id,status&limit=1`,{headers:{apikey:KEY,Authorization:authHeader}},5000);
    if(!existingResponse.ok)return json(existingResponse.status===401||existingResponse.status===403?403:502,{error:'Data Intake existing-state lookup failed'},event);
    const existingRows=await existingResponse.json();
    const existing=Array.isArray(existingRows)?existingRows[0]:null;
    const current=existing?.status||'none';
    const allowedTransition=(current==='none'&&status==='draft')||(current==='draft'&&['draft','reviewed'].includes(status))||(current==='reviewed'&&['reviewed','approved'].includes(status))||(current==='approved'&&status==='approved');
    if(!allowedTransition)return json(409,{error:`Invalid import status transition: ${current} -> ${status}`},event);
    const r=await fetchWithTimeout(`${BASE}/rest/v1/trace_data_intake_imports?on_conflict=actor_user_id%2Csource_hash`,{method:'POST',headers:{apikey:KEY,Authorization:authHeader, 'content-type':'application/json','prefer':'resolution=merge-duplicates,return=representation'},body:JSON.stringify(row)},5000);
    const text=await r.text(); if(!r.ok)return json(r.status===401||r.status===403?403:502,{error:'Data Intake persistence failed'},event);
    return json(202,{ok:true,status:row.status,import:r.ok&&text?JSON.parse(text)[0]:null,idempotent:true},event);
  }catch(error){return json(502,{error:error?.name==='AbortError'?'Data Intake persistence timeout':'Data Intake persistence unavailable'},event)}
};
