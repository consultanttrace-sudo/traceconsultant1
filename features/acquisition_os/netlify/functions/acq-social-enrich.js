const {cors,requireAuth}=require('./_auth');
const {isPublicHttpUrl,fetchPublicUrl}=require('./_url');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode:204,headers:cors(event)};
  if (event.httpMethod !== 'POST') return {statusCode:405,headers:cors(event),body:JSON.stringify({error:'POST only'})};
  const auth=await requireAuth(event); if(!auth.ok) return {statusCode:auth.statusCode,headers:cors(event),body:JSON.stringify({error:auth.error})};
  let body={}; try{body=JSON.parse(event.body||'{}')}catch(e){return {statusCode:400,headers:cors(event),body:JSON.stringify({error:'Invalid JSON'})}};

  const websites=(Array.isArray(body.websites)?body.websites:[]).slice(0,40);
  const timeoutMs=Math.max(1500,Math.min(9000,Number(process.env.SOCIAL_TIMEOUT_MS||7000)));
  const globalDeadlineMs=Math.max(timeoutMs,Math.min(15000,Number(process.env.SOCIAL_ENRICH_GLOBAL_DEADLINE_MS||12000)));
  const concurrency=Math.max(1,Math.min(4,Number(process.env.SOCIAL_ENRICH_CONCURRENCY||3)));
  const started=Date.now();
  const globalController=new AbortController();
  const timer=setTimeout(()=>globalController.abort(),globalDeadlineMs);
  const results=new Array(websites.length);
  let cursor=0;

  async function worker(){
    while(!globalController.signal.aborted){
      const index=cursor++;
      if(index>=websites.length) return;
      const item=websites[index]||{};
      const externalId=item.external_id;
      const website=String(item.website||'').trim();
      let instagram=null;
      let blocked=false;
      let error=null;
      if(!(await isPublicHttpUrl(website))){
        blocked=true;
      } else {
        try{
          const r=await fetchPublicUrl(website,{headers:{'user-agent':'TRACE-Acquisition-OS/1.0'}},timeoutMs,3,globalController.signal);
          const contentType=(r.headers.get('content-type')||'').toLowerCase();
          // Instagram discovery only needs HTML. Avoid spending time parsing
          // PDFs, images, archives, or other binary responses.
          if(contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
            error='UNSUPPORTED_CONTENT_TYPE';
          } else {
            const html=(await r.text()).slice(0,750000);
            const matches=[...html.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.-]+)/ig)];
            for(const m of matches){
              const handle=String(m[1]||'').toLowerCase();
              if(!['p','reel','reels','explore','accounts','about','direct'].includes(handle)){
                instagram='@'+m[1];
                break;
              }
            }
          }
        }catch(e){
          error=e?.name==='AbortError' ? 'TIMEOUT_OR_GLOBAL_DEADLINE' : String(e?.message||e);
        }
      }
      results[index]={external_id:externalId,instagram,blocked,error};
    }
  }

  await Promise.all(Array.from({length:Math.min(concurrency,websites.length)},worker));
  clearTimeout(timer);
  for(let i=0;i<results.length;i++){
    if(!results[i]) results[i]={external_id:websites[i]?.external_id,instagram:null,blocked:false,error:'GLOBAL_DEADLINE_REACHED'};
  }
  return {statusCode:200,headers:{...cors(event),'content-type':'application/json'},body:JSON.stringify({
    results,
    diagnostics:{requested:websites.length,completed:results.length,timeoutMs,globalDeadlineMs,concurrency,elapsedMs:Date.now()-started,deadlineExceeded:globalController.signal.aborted}
  })};
};
