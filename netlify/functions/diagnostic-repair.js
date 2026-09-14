const crypto = require('node:crypto');
const { cors, requireAuth, fetchWithTimeout } = require('./_auth');

function response(status, body, event) {
  return { statusCode: status, headers: { ...cors(event), 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

function sanitizePlan(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('Invalid repair plan');
  return { id:String(plan.id || ''), findingId:String(plan.findingId || ''), safety:String(plan.safety || ''), canApplyAutomatically:Boolean(plan.canApplyAutomatically) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode:204, headers:cors(event), body:'' };
  if (event.httpMethod !== 'POST') return response(405, { error:'Method not allowed' }, event);
  const auth = await requireAuth(event);
  if (!auth.ok) return response(auth.statusCode, { error:auth.error }, event);
  const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_ANON_KEY||'';
  const authHeader=event.headers?.authorization||event.headers?.Authorization||'';
  if(!base||!key) return response(500,{error:'Supabase environment is not configured'},event);
  try {
    const leader=await fetchWithTimeout(`${base}/rest/v1/rpc/trace_is_leader`,{method:'POST',headers:{apikey:key,Authorization:authHeader,'content-type':'application/json'}},2500);
    if(!leader.ok || (await leader.json())!==true) return response(403,{error:'Leader role required'},event);
  } catch { return response(502,{error:'Leader authorization unavailable'},event); }
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error:'Invalid JSON' }, event); }
  const plan = sanitizePlan(body.plan);
  if (!body.approved) return response(409, { error:'Explicit approval required', status:'approval_required' }, event);
  if (!plan.canApplyAutomatically || plan.safety !== 'safe') return response(409, { error:'This repair requires review or a local workspace bridge.', status:'review_required' }, event);
  // Netlify production functions are intentionally not allowed to mutate repository source files.
  // A future local IDE/workspace bridge may consume the signed proposal after explicit approval.
  const proposalHash = crypto.createHash('sha256').update(JSON.stringify(body.plan)).digest('hex');
  return response(202, { applied:false, status:'workspace_bridge_required', proposalHash, message:'Repair proposal accepted for review, but production server cannot mutate repository source.' }, event);
};
