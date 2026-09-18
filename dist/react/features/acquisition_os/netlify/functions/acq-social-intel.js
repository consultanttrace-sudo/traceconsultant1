const {cors,requireAuth}=require('./_auth');
const {isPublicHttpUrl,fetchPublicUrl}=require('./_url');
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return {statusCode:204,headers:cors(event)};
  if (event.httpMethod !== 'POST') return {statusCode:405,headers:cors(event),body:JSON.stringify({error:'POST only'})};
  const auth=await requireAuth(event); if(!auth.ok)return {statusCode:auth.statusCode,headers:cors(event),body:JSON.stringify({error:auth.error})};
  let body={}; try{body=JSON.parse(event.body||'{}')}catch(e){return {statusCode:400,headers:cors(event),body:JSON.stringify({error:'Invalid JSON'})}};
  const lead=body.lead||{};
  const urls=[];
  if(lead.website && (await isPublicHttpUrl(lead.website))) urls.push({url:lead.website,type:'website'});
  if(lead.instagram){
    const handle=String(lead.instagram).replace(/^@/,'').trim();
    if(/^[A-Za-z0-9_.-]+$/.test(handle)) urls.push({url:`https://www.instagram.com/${handle}/`,type:'instagram'});
  }
  const unique=[]; const seen=new Set();
  for(const item of urls){const key=item.url.toLowerCase();if(!seen.has(key)){seen.add(key);unique.push(item)}}
  const timeoutMs=Math.max(1500,Math.min(9000,Number(process.env.SOCIAL_TIMEOUT_MS||7000)));
  const globalDeadlineMs=Math.max(timeoutMs,Math.min(12000,Number(process.env.SOCIAL_GLOBAL_DEADLINE_MS||9000)));
  const concurrency=Math.max(1,Math.min(2,Number(process.env.SOCIAL_CONCURRENCY||2)));
  const started=Date.now();
  const globalController=new AbortController();
  const globalTimer=setTimeout(()=>globalController.abort(),globalDeadlineMs);
  const docs=[];
  let cursor=0;
  async function worker(){
    while(cursor<unique.length && !globalController.signal.aborted){
      const item=unique[cursor++];
      try{
        if(globalController.signal.aborted) break;
        const r=await fetchPublicUrl(item.url,{headers:{'user-agent':'Mozilla/5.0 TRACE-Acquisition-OS/1.0'}},timeoutMs,3,globalController.signal);
        const html=(await r.text()).slice(0,1000000);
        const title=meta(html,'og:title')||meta(html,'twitter:title')||tag(html,'title');
        const description=meta(html,'og:description')||meta(html,'description')||meta(html,'twitter:description');
        const h1=(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'';
        const text=strip(`${title||''} ${description||''} ${h1||''}`).replace(/\s+/g,' ').trim();
        docs.push({type:item.type,url:item.url,title:title||null,description:description||null,text:text.slice(0,2000),status:r.status});
      }catch(e){
        docs.push({type:item.type,url:item.url,error:e?.name==='AbortError'?'timeout':String(e?.message||e)});
      }
    }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,unique.length)},worker));
  clearTimeout(globalTimer);

  const combined=docs.map(d=>d.text||'').join(' ').toLowerCase();
  const keywords={food:['coffee','kopi','cafe','café','restaurant','resto','bakery','dessert','kitchen','brunch'],promo:['promo','discount','diskon','voucher','order','delivery','reservasi','booking'],community:['community','event','music','workshop','space'],premium:['specialty','artisan','premium','signature','roastery'],conversion:['menu','whatsapp','contact','order','booking','reservasi']};
  const hits={}; Object.entries(keywords).forEach(([k,arr])=>hits[k]=arr.filter(x=>combined.includes(x)));
  const websiteReachable=docs.some(d=>d.type==='website'&&d.status>=200&&d.status<400);
  const instagramReachable=docs.some(d=>d.type==='instagram'&&d.status>=200&&d.status<400);
  const hasCTA=hits.promo.length>0;
  const evidence={website:websiteReachable,instagram:instagramReachable,offerSignals:hits.promo.length,communitySignals:hits.community.length,premiumSignals:hits.premium.length,conversionSignals:hits.conversion.length};
  const publicSignals=[];
  if(lead.instagram) publicSignals.push({signal:'Instagram profile identified',type:'fact',detail:'Profil Instagram tersedia dari data lead.'});
  if(instagramReachable) publicSignals.push({signal:'Public Instagram page reachable',type:'fact',detail:'Halaman publik Instagram dapat diakses saat pengecekan.'});
  if(websiteReachable) publicSignals.push({signal:'Website reachable',type:'fact',detail:'Website bisnis dapat diakses saat pengecekan.'});
  if(hasCTA) publicSignals.push({signal:'Offer / CTA language detected',type:'fact',detail:`Tema CTA terdeteksi: ${hits.promo.join(', ')}.`});
  if(hits.community.length) publicSignals.push({signal:'Community/event signal',type:'fact',detail:`Tema community/event terdeteksi: ${hits.community.join(', ')}.`});
  if(hits.premium.length) publicSignals.push({signal:'Premium/specialty positioning signal',type:'fact',detail:`Tema premium/specialty terdeteksi: ${hits.premium.join(', ')}.`});
  // Evidence-derived scoring: every point is tied to an observed signal.
  // Missing evidence contributes 0 and is reported as a coverage limitation;
  // it is never converted into a made-up positive score.
  const brand=Math.min(100,(websiteReachable?35:0)+(lead.instagram?20:0)+(instagramReachable?20:0)+(lead.rating>=4.5?10:0));
  const content=Math.min(100,(instagramReachable?35:0)+(hits.community.length?20:0)+(hits.premium.length?20:0)+(hits.food.length?10:0));
  const reach=Math.min(100,(instagramReachable?30:0)+(lead.review_count>=500?20:0)+(lead.rating>=4.5?15:0)+(lead.outlet_count>1?15:0));
  const conversion=Math.min(100,(hasCTA?30:0)+(websiteReachable?20:0)+(hits.conversion.length?25:0)+(lead.review_count>=500?10:0));
  const evidenceCount=Object.values(evidence).filter(v=>typeof v==='boolean'?v:v>0).length;
  const coveragePct=Math.round((evidenceCount/Object.keys(evidence).length)*100);
  let angle='Business & Profitability Insight';
  if(instagramReachable && reach>=50) angle='Social Media Growth / Reach';
  else if(conversion>=50) angle='Content-to-Conversion';
  else if(lead.outlet_count>1) angle='Operational Scaling + Profitability';
  const sourceNote=instagramReachable||websiteReachable
    ? 'Analisis otomatis hanya memakai sinyal publik yang berhasil diakses saat pemeriksaan; tidak mengklaim observasi feed pixel-level.'
    : 'Tidak ada sumber publik yang berhasil diverifikasi saat pemeriksaan; sistem tidak mengarang isi social/website.';
  const result={
    status:instagramReachable?'auto_public_data':(websiteReachable?'partial_public_data':'limited_public_data'),
    instagram:lead.instagram||null,source_note:sourceNote,
    public_pages:docs.map(d=>({type:d.type,url:d.url,status:d.status||null,title:d.title||null,description:d.description||null,error:d.error||null})),
    signals:publicSignals,metrics:{brand_presence:brand,content_opportunity:content,reach_opportunity:reach,conversion_opportunity:conversion},
    detected_themes:hits, evidence_coverage_pct:coveragePct, evidence,
    primary_opportunity:coveragePct>=40?`Peluang utama yang perlu diuji: ${angle}.`:'Data publik belum cukup untuk menyimpulkan peluang utama; validasi lewat percakapan atau sumber tambahan.',
    recommended_sales_angle:angle,
    dm_hook:coveragePct>=40?`Saya sempat melihat presence digital ${lead.business_name}; ada satu peluang yang menurut saya menarik dari sisi ${angle.toLowerCase()}.`:`Saya melihat data publik ${lead.business_name} masih terbatas; ada satu insight bisnis yang menurut saya menarik untuk divalidasi.`,
    diagnostics:{requestedSources:unique.length,completedSources:docs.length,timeoutMs,globalDeadlineMs,elapsedMs:Date.now()-started,deadlineExceeded:globalController.signal.aborted},
    analyzed_at:new Date().toISOString()
  };
  return {statusCode:200,headers:{...cors(event),'content-type':'application/json'},body:JSON.stringify(result)};
};

function meta(html,name){const re=new RegExp(`<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'][^>]+content=["']([^"']*)["'][^>]*>`,'i');const m=html.match(re);return m?decode(m[1]):null}
function tag(html,name){const m=html.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'));return m?decode(m[1]):null}
function strip(s){return decode(s.replace(/<[^>]+>/g,' '))}
function decode(s){return String(s||'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
