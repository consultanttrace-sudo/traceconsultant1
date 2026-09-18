const {cors,requireAuth,fetchWithTimeout}=require('./_auth');
const OPENAI_KEY=(process.env.OPENAI_API_KEY||'').trim();
const GEMINI_KEY=(process.env.GEMINI_API_KEY||'').trim();
const TRACE_KEY=(process.env.TRACE_AI_API_KEY||'').trim();
const AI_PROVIDER=(process.env.TRACE_AI_PROVIDER|| (GEMINI_KEY ? 'gemini' : OPENAI_KEY ? 'openai' : 'custom')).trim().toLowerCase();
const AI_MODEL=(process.env.TRACE_AI_MODEL||process.env.GEMINI_MODEL||process.env.OPENAI_MODEL||'').trim();
const CUSTOM_ENDPOINT=(process.env.TRACE_AI_ENDPOINT||'').trim();
const AI_TIMEOUT_MS=Math.max(5000,Math.min(60000,Number(process.env.TRACE_AI_TIMEOUT_MS||30000)));
const DEFAULT_GEMINI_MODEL='gemini-2.5-flash-lite';
function configError(){
  if(!AI_MODEL && AI_PROVIDER!=='gemini')return 'AI engine belum lengkap: TRACE_AI_MODEL, GEMINI_MODEL, atau OPENAI_MODEL wajib diisi.';
  if(AI_PROVIDER==='gemini' && !GEMINI_KEY)return 'AI engine belum lengkap: GEMINI_API_KEY wajib diisi untuk provider Gemini.';
  if(AI_PROVIDER==='openai' && !OPENAI_KEY)return 'AI engine belum lengkap: OPENAI_API_KEY wajib diisi untuk provider OpenAI.';
  if(AI_PROVIDER==='custom' && !CUSTOM_ENDPOINT)return 'AI engine belum dikonfigurasi. Set TRACE_AI_ENDPOINT + TRACE_AI_MODEL (+ TRACE_AI_API_KEY bila endpoint membutuhkan Bearer token).';
  return null;
}
function providerHeaders(){
  const key=TRACE_KEY || OPENAI_KEY;
  return {'content-type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})};
}
function clean(ms){return(Array.isArray(ms)?ms:[]).map(m=>({role:['user','assistant'].includes(m?.role)?m.role:'user',content:String(m?.content??'')}))}
function systemPrompt(mode){
  if(mode==='business_advisor')return `You are TRACE Business Advisor, the internal business-consulting AI for TRACE Consultant OS. Analyze client business evidence across revenue, transactions, products, ingredients, suppliers, COGS, labor, OPEX, profit, marketing and customer behavior. Distinguish CONFIRMED, LIKELY, POSSIBLE and UNKNOWN. Never invent numbers, sources, transactions, customers, costs or outcomes. If data is insufficient, say exactly what is missing and what would validate the hypothesis. When calculating a percentage, show the source values and formula. Give practical recommendations with rationale, expected mechanism and measurement method. TRACE team members make the final decision. Do not expose credentials or claim actions were executed.`;
  if(mode==='guardian')return `You are TRACE Guardian, the internal engineering reliability AI for TRACE Consultant OS. Diagnose application incidents using only supplied evidence. Focus on frontend, Netlify Functions, Supabase/RLS, authentication, persistence, network, performance, dependencies and deployment. Separate CONFIRMED, SUSPECTED and BLOCKED evidence. Identify the smallest defensible root cause, impact, safe next step and verification test. Never invent logs, files, test results or external state. Never mutate production; changes, migrations, PRs, merges and deploys require explicit human approval.`;
  return `You are TRACE AI, the internal software-engineering brain for TRACE Consultant OS. Prioritize coding, architecture, debugging, security, Supabase/RLS, Netlify, TypeScript/React, performance, persistence and tests. Never invent code, logs, data or evidence. Distinguish confirmed, suspected and unknown. Propose fixes with evidence. Production changes, migrations, pushes, merges and deployments require explicit approval. For deployment, ask the leader for a clear confirmation before triggering production. Never expose credentials.`;
}
function geminiEndpoint(model){return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_KEY)}`}
function openAiEndpoint(){return CUSTOM_ENDPOINT || (AI_PROVIDER==='openai' ? 'https://api.openai.com/v1/chat/completions' : '')}
function geminiPayload(messages,system){
  const contents=messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
  return {systemInstruction:{parts:[{text:system}]},contents,generationConfig:{temperature:.2}};
}
function openAiPayload(messages,system){return {model:AI_MODEL,messages:[{role:'system',content:system},...messages],temperature:.1}}
function extractGemini(data){return data?.candidates?.[0]?.content?.parts?.map(p=>p?.text||'').filter(Boolean).join('\n')||''}
function extractOpenAI(data){return data?.choices?.[0]?.message?.content||data?.output_text||data?.output||data?.message||''}
exports.handler=async e=>{
  if(e.httpMethod==='OPTIONS')return{statusCode:204,headers:cors(e),body:''};
  if(e.httpMethod==='GET'){
    const auth=await requireAuth(e);if(!auth.ok)return{statusCode:auth.statusCode,headers:cors(e),body:JSON.stringify({error:auth.error})};
    const configurationError=configError();
    const model=AI_MODEL || (AI_PROVIDER==='gemini'?DEFAULT_GEMINI_MODEL:'');
    return{statusCode:200,headers:{...cors(e),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({configured:!configurationError,provider:AI_PROVIDER,model:model||null,endpointConfigured:Boolean(CUSTOM_ENDPOINT||GEMINI_KEY||OPENAI_KEY),configurationError})};
  }
  if(e.httpMethod!=='POST')return{statusCode:405,headers:cors(e),body:JSON.stringify({error:'POST only'})};
  const auth=await requireAuth(e);if(!auth.ok)return{statusCode:auth.statusCode,headers:cors(e),body:JSON.stringify({error:auth.error})};
  const configurationError=configError();
  if(configurationError)return{statusCode:503,headers:{...cors(e),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({error:configurationError,code:'AI_NOT_CONFIGURED',configured:false})};
  let b={};try{b=JSON.parse(e.body||'{}')}catch{return{statusCode:400,headers:cors(e),body:JSON.stringify({error:'Invalid JSON'})}}
  const messages=clean(b.messages);if(!messages.length)return{statusCode:400,headers:cors(e),body:JSON.stringify({error:'messages required'})};
  const mode=['business_advisor','guardian','engineering'].includes(b.mode)?b.mode:'engineering';
  const system=systemPrompt(mode);
  try{
    const model=AI_MODEL || (AI_PROVIDER==='gemini'?DEFAULT_GEMINI_MODEL:'');
    const isGemini=AI_PROVIDER==='gemini';
    const endpoint=isGemini?geminiEndpoint(model):openAiEndpoint();
    if(!endpoint)return{statusCode:503,headers:cors(e),body:JSON.stringify({error:'AI endpoint belum dikonfigurasi',code:'AI_NOT_CONFIGURED'})};
    const payload=isGemini?geminiPayload(messages,system):openAiPayload(messages,system);
    const headers=isGemini?{'content-type':'application/json'}:providerHeaders();
    const r=await fetchWithTimeout(endpoint,{method:'POST',headers,body:JSON.stringify(payload)},AI_TIMEOUT_MS);
    const text=await r.text();
    if(!r.ok){
      const code=r.status===401||r.status===403?'AI_PROVIDER_AUTH_FAILED':r.status===429?'AI_PROVIDER_QUOTA':'AI_PROVIDER_ERROR';
      return{statusCode:r.status===429?429:502,headers:{...cors(e),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({error:code==='AI_PROVIDER_QUOTA'?'AI provider quota/rate limit tercapai':'AI provider failed',code,status:r.status,provider:AI_PROVIDER,model})};
    }
    let data={};try{data=JSON.parse(text)}catch{data={output:text}}
    const answer=isGemini?extractGemini(data):extractOpenAI(data);
    return{statusCode:200,headers:{...cors(e),'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({ok:true,answer:String(answer||''),provider:AI_PROVIDER,model})};
  }catch(err){
    return{statusCode:502,headers:cors(e),body:JSON.stringify({error:err?.name==='AbortError'?'AI provider timeout':'AI provider unavailable',code:err?.name==='AbortError'?'AI_PROVIDER_TIMEOUT':'AI_PROVIDER_UNAVAILABLE'})};
  }
};
