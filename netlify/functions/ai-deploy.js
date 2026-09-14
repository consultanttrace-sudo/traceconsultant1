const crypto=require('node:crypto');
const {cors,requireAuth,fetchWithTimeout}=require('./_auth');
const SUPABASE_URL=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SUPABASE_ANON_KEY=process.env.SUPABASE_ANON_KEY||'';
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const DEPLOY_HOOK_URL=process.env.TRACE_NETLIFY_BUILD_HOOK_URL||'';
const TTL_MS=Math.max(60_000,Number(process.env.TRACE_AI_DEPLOY_APPROVAL_TTL_MS||10*60_000));
const json=(status,body,event)=>({statusCode:status,headers:{...cors(event),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
function hashScope(body){return crypto.createHash('sha256').update(JSON.stringify({action:'deploy',environment:'production',site:body.site||'trace',commit:body.commit||'current',reason:body.reason||''})).digest('hex');}
async function isLeader(event,userId){
  if(!SUPABASE_URL||!SUPABASE_ANON_KEY)return false;
  const auth=event.headers?.authorization||event.headers?.Authorization||'';
  const r=await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/trace_team_members?user_id=eq.${encodeURIComponent(userId)}&active=eq.true&role=eq.leader&select=user_id`,{headers:{apikey:SUPABASE_ANON_KEY,Authorization:auth}},3000);
  if(!r.ok)return false; const rows=await r.json(); return Array.isArray(rows)&&rows.length===1;
}
async function db(path,method='GET',body){
  if(!SUPABASE_SERVICE_ROLE_KEY)throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const r=await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:{apikey:SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json','prefer':(method==='POST'||method==='PATCH')?'return=representation':'return=minimal'},body:body?JSON.stringify(body):undefined},5000);
  const text=await r.text(); if(!r.ok)throw new Error(`Supabase ${r.status}: ${text.slice(0,300)}`); return text?JSON.parse(text):null;
}
exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return json(204,{},event);
  if(event.httpMethod!=='POST')return json(405,{error:'POST only'},event);
  const auth=await requireAuth(event); if(!auth.ok)return json(auth.statusCode,{error:auth.error},event);
  if(!await isLeader(event,auth.user.id))return json(403,{error:'leader approval required'},event);
  let b={};try{b=JSON.parse(event.body||'{}')}catch{return json(400,{error:'Invalid JSON'},event)}
  const action=b.action||'status';
  try{
    if(action==='request'){
      const scopeHash=hashScope(b);
      const rows=await db('trace_ai_approvals','POST', {actor_user_id:auth.user.id,action:'deploy',environment:'production',scope_hash:scopeHash,status:'pending',approved_at:null,expires_at:new Date(Date.now()+TTL_MS).toISOString(),metadata:{site:b.site||'trace',commit:b.commit||'current',reason:b.reason||''}});
      const row=rows?.[0]; return json(200,{ok:true,status:'confirmation_required',approvalId:row?.id,scopeHash,expiresAt:row?.expires_at,message:'Deployment siap. Konfirmasi eksplisit diperlukan sebelum production deploy.'},event);
    }
    if(action==='confirm'){
      if(b.confirm!==true||!b.approvalId)return json(400,{error:'explicit confirmation and approvalId required'},event);
      if(!DEPLOY_HOOK_URL)return json(503,{error:'TRACE_NETLIFY_BUILD_HOOK_URL belum dikonfigurasi; deployment belum dijalankan.'},event);
      // Atomically claim the pending approval so two concurrent confirmations
      // cannot trigger two production deployments from the same approval.
      const nowIso=new Date().toISOString();
      const claimed=await db(`trace_ai_approvals?id=eq.${encodeURIComponent(b.approvalId)}&actor_user_id=eq.${encodeURIComponent(auth.user.id)}&action=eq.deploy&environment=eq.production&status=eq.pending&expires_at=gt.${encodeURIComponent(nowIso)}&select=*`,'PATCH',{status:'approved',approved_at:nowIso});
      const row=claimed?.[0];
      if(!row)return json(409,{error:'pending deployment approval not found, expired, or already claimed'},event);
      const scope=hashScope({site:row.metadata?.site,commit:row.metadata?.commit,reason:row.metadata?.reason});
      if(scope!==row.scope_hash){await db(`trace_ai_approvals?id=eq.${encodeURIComponent(row.id)}`,'PATCH',{status:'rejected'});return json(409,{error:'deployment scope mismatch'},event);}
      const hook=await fetchWithTimeout(DEPLOY_HOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({trigger:'TRACE AI explicit approval',approval_id:row.id,actor_user_id:auth.user.id})},8000);
      if(!hook.ok){await db(`trace_ai_approvals?id=eq.${encodeURIComponent(row.id)}`,'PATCH',{status:'rejected'});return json(502,{error:'Netlify deploy hook failed',status:hook.status},event);}
      await db(`trace_ai_approvals?id=eq.${encodeURIComponent(row.id)}`,'PATCH',{status:'executed',executed_at:new Date().toISOString()});
      return json(200,{ok:true,status:'deployment_triggered',approvalId:row.id,message:'Production deployment telah dipicu setelah approval eksplisit.'},event);
    }
    return json(400,{error:'action must be request or confirm'},event);
  }catch(err){return json(500,{error:'deployment workflow failed',detail:err?.message||'unknown'},event)}
};
