const { cors, requireAuth, fetchWithTimeout } = require('./_auth');

const ALLOWED_KEYS = new Set([
  'trace-clients','trace-companies','trace-brands','trace-outlets','trace-team',
  'trace-timeline','trace-revenue','trace-akuntansi','trace-kpi-individu','trace-kpi-indikator-def',
  'trace-opex','trace-outlet-jual','trace-ingredient-master','trace-supplier','trace-purchase',
  'trace-purchase-request','trace-stock-movement','trace-stock-opname','trace-marketing-event'
]);
const MAX_KEYS = 20;
const MAX_VALUE_BYTES = 3_000_000;
const CLIENT_SCOPED_KEYS = new Set([
  'trace-revenue','trace-akuntansi','trace-kpi-individu','trace-kpi-indikator-def','trace-opex',
  'trace-outlet-jual','trace-ingredient-master','trace-supplier','trace-purchase','trace-purchase-request',
  'trace-stock-movement','trace-stock-opname','trace-marketing-event'
]);
const RESOURCES = new Set([
  'tasks','audit','clients','outlets','imports','finance','products','sales','pos_events','inventory_movements','inventory_items',
  'inventory_recipes','anomalies','alerts','health','social_accounts','content_items','content_metrics',
  'content_inquiries','ad_accounts','ad_campaigns','ad_metrics','competitor_accounts','competitor_snapshots',
  'competitor_posts','competitor_discovery_lens','content_plans','ingestion','accounts','journal_entries','journal_lines','ar_invoices','ar_payments','ap_bills','ap_payments','fixed_assets','period_locks'
]);
const CLIENT_SCOPED_RESOURCES = new Set([...RESOURCES].filter(x => x !== 'audit' && x !== 'clients' && x !== 'outlets'));
const RESOURCE_RPC_KEYS = new Set([
  'tasks','imports','finance','products','sales','pos_events','inventory_movements','inventory_items',
  'inventory_recipes','anomalies','alerts','health','social_accounts','content_items','content_metrics',
  'content_inquiries','ad_accounts','ad_campaigns','ad_metrics','competitor_accounts','competitor_snapshots',
  'competitor_posts','competitor_discovery_lens','content_plans','ingestion','accounts','journal_entries','journal_lines','ar_invoices','ar_payments','ap_bills','ap_payments','fixed_assets','period_locks'
]);
const response=(statusCode,body,event)=>({statusCode,headers:{...cors(event),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
function parseList(raw,max){return [...new Set(String(raw||'').split(',').map(x=>x.trim()).filter(Boolean))].slice(0,max);}
function parseKeys(event){return parseList(event.queryStringParameters?.keys,MAX_KEYS);}
function parseResources(event){return parseList(event.queryStringParameters?.resources,20);}
function parseClientId(event){const raw=String(event.queryStringParameters?.client_id||'').trim(); return raw||null;}
function jsonValueBytes(value){return new TextEncoder().encode(JSON.stringify(value)).length;}

exports.handler=async(event)=>{
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:cors(event),body:''};
  if(event.httpMethod!=='GET') return response(405,{error:'GET only'},event);
  const auth=await requireAuth(event);
  if(!auth.ok) return response(auth.statusCode,{error:auth.error},event);
  const keys=parseKeys(event);
  const resources=parseResources(event);
  const clientId=parseClientId(event);
  if(!keys.length && !resources.length) return response(400,{error:'keys or resources query parameter is required'},event);
  if(keys.some(k=>!ALLOWED_KEYS.has(k))) return response(400,{error:'One or more requested data keys are not allowed'},event);
  if(resources.some(r=>!RESOURCES.has(r))) return response(400,{error:'One or more requested resources are not allowed'},event);
  if((keys.some(k=>CLIENT_SCOPED_KEYS.has(k))||resources.some(r=>CLIENT_SCOPED_RESOURCES.has(r)))&&!clientId){
    return response(400,{error:'client_id wajib untuk resource client-scoped. TRACE tidak mengirim data antar-klien dalam satu scope.'},event);
  }

  const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const anon=process.env.SUPABASE_ANON_KEY||'';
  const bearer=event.headers?.authorization||event.headers?.Authorization||'';
  if(!base||!anon) return response(503,{error:'Supabase environment is not configured'},event);
  const headers={apikey:anon,Authorization:bearer,'content-type':'application/json'};
  const out={}; const unavailable=[];

  // Operational client data is read through a SQL RPC that applies the client
  // predicate before serialization. No broad PostgREST table query is allowed.
  const scopedResources=resources.filter(r=>RESOURCE_RPC_KEYS.has(r));
  if(scopedResources.length){
    try{
      const r=await fetchWithTimeout(`${base}/rest/v1/rpc/trace_read_client_dataset`,{method:'POST',headers,body:JSON.stringify({p_client_id:clientId})},5000);
      if(!r.ok) throw new Error(`HTTP_${r.status}`);
      const dataset=await r.json();
      if(!dataset || typeof dataset!=='object' || Array.isArray(dataset)) throw new Error('INVALID_CLIENT_DATASET');
      for(const name of scopedResources){
        const value=dataset[name] ?? [];
        if(jsonValueBytes(value)>MAX_VALUE_BYTES) unavailable.push({key:name,reason:'value_too_large'});
        else out[name]=value;
      }
    }catch(error){
      for(const name of scopedResources) unavailable.push({key:name,reason:error?.name==='AbortError'?'timeout':'unavailable'});
    }
  }

  // Global governance/audit data remains team-scoped and is intentionally not
  // merged with client operational datasets.
  for(const name of resources.filter(r=>r==='audit')){
    try{
      const url=`${base}/rest/v1/trace_audit_log?select=id,actor_user_id,action,entity_type,entity_id,before_data,after_data,reason,created_at&order=created_at.desc&limit=100`;
      const r=await fetchWithTimeout(url,{headers},5000);
      if(!r.ok) throw new Error(`HTTP_${r.status}`);
      const value=await r.json();
      if(!Array.isArray(value)) throw new Error('INVALID_RESOURCE_RESPONSE');
      out[name]=value;
    }catch(error){unavailable.push({key:name,reason:error?.name==='AbortError'?'timeout':'unavailable'});}
  }

  // Client master list: internal team metadata, read via the audited RPC
  // (trace_list_clients) rather than a broad PostgREST table query — same
  // trust boundary as 'audit' above, never merged with per-client datasets.
  for(const name of resources.filter(r=>r==='clients')){
    try{
      const r=await fetchWithTimeout(`${base}/rest/v1/rpc/trace_list_clients`,{method:'POST',headers,body:JSON.stringify({})},5000);
      if(!r.ok) throw new Error(`HTTP_${r.status}`);
      const value=await r.json();
      if(!Array.isArray(value)) throw new Error('INVALID_RESOURCE_RESPONSE');
      out[name]=value;
    }catch(error){unavailable.push({key:name,reason:error?.name==='AbortError'?'timeout':'unavailable'});}
  }

  // Outlet master list: internal team metadata (client_id column, not a
  // per-client dataset), read via the audited RPC (trace_list_outlets) —
  // same trust boundary as 'clients' above. The client-side scope selector
  // filters this global list down to one client's outlets itself, the same
  // way it already does with the (never-populated) hierarchy KV keys.
  for(const name of resources.filter(r=>r==='outlets')){
    try{
      const r=await fetchWithTimeout(`${base}/rest/v1/rpc/trace_list_outlets`,{method:'POST',headers,body:JSON.stringify({})},5000);
      if(!r.ok) throw new Error(`HTTP_${r.status}`);
      const value=await r.json();
      if(!Array.isArray(value)) throw new Error('INVALID_RESOURCE_RESPONSE');
      out[name]=value;
    }catch(error){unavailable.push({key:name,reason:error?.name==='AbortError'?'timeout':'unavailable'});}
  }

  // Client-scoped legacy collections now come from row-scoped storage, never
  // from the old multi-client trace_kv blob.
  const scopedKeys=keys.filter(k=>CLIENT_SCOPED_KEYS.has(k));
  if(scopedKeys.length){
    try{
      const r=await fetchWithTimeout(`${base}/rest/v1/rpc/trace_read_client_kv`,{method:'POST',headers,body:JSON.stringify({p_client_id:clientId,p_keys:scopedKeys})},5000);
      if(!r.ok) throw new Error(`HTTP_${r.status}`);
      const value=await r.json();
      if(!value || typeof value!=='object' || Array.isArray(value)) throw new Error('INVALID_CLIENT_KV_RESPONSE');
      for(const key of scopedKeys){
        const v=value[key] ?? [];
        if(jsonValueBytes(v)>MAX_VALUE_BYTES) unavailable.push({key,reason:'value_too_large'}); else out[key]=v;
      }
    }catch(error){for(const key of scopedKeys) unavailable.push({key,reason:error?.name==='AbortError'?'timeout':'unavailable'});}
  }

  // Metadata keys are intentionally global: they define the internal client
  // directory/hierarchy used to choose a scope and contain no client payload.
  // The legacy table itself is not browser-readable; the SQL function is an
  // allowlisted server boundary for these metadata keys.
  const globalKeys=keys.filter(k=>!CLIENT_SCOPED_KEYS.has(k));
  if(globalKeys.length){
    try{
      const pKeys=globalKeys.map(k=>`trace_os::${k}`);
      const r=await fetchWithTimeout(`${base}/rest/v1/rpc/trace_read_global_kv`,{method:'POST',headers,body:JSON.stringify({p_keys:pKeys})},5000);
      if(!r.ok) throw new Error(`HTTP_${r.status}`);
      const value=await r.json();
      for(const key of globalKeys){
        const v=value?.[`trace_os::${key}`];
        if(v===undefined){unavailable.push({key,reason:'missing'});continue;}
        if(jsonValueBytes(v)>MAX_VALUE_BYTES) unavailable.push({key,reason:'value_too_large'}); else out[key]=v;
      }
    }catch(error){for(const key of globalKeys) unavailable.push({key,reason:error?.name==='AbortError'?'timeout':'unavailable'});}
  }

  return response(200,{data:out,unavailable,actorUserId:auth.user.id,scope:{clientId:clientId||null,clientScoped:!!clientId}},event);
};
