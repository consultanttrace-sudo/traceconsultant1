const GOOGLE_URL='https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK=['places.id','places.displayName','places.formattedAddress','places.location','places.primaryType','places.types','places.rating','places.userRatingCount','places.websiteUri','places.nationalPhoneNumber','places.regularOpeningHours','places.priceLevel','places.googleMapsUri','places.businessStatus'].join(',');
const {cors,requireAuth,fetchWithTimeout}=require('./_auth');
const BOGOR_CITY=new Set(['Bogor Tengah','Bogor Selatan','Bogor Utara','Bogor Timur','Bogor Barat']);
const BOGOR_KAB=new Set(['Cibinong','Sentul','Citeureup','Gunung Putri','Cileungsi','Ciawi','Parung']);
const TERMS={all:['coffee shop','cafe','restoran','rumah makan','kedai','bakery','dessert'],coffee_shop:['coffee shop','kedai kopi'],cafe:['cafe','coffee shop'],restaurant:['restaurant','restoran','rumah makan','kedai makan'],bakery:['bakery','toko roti'],dessert:['dessert','ice cream','gelato'],casual_dining:['restaurant','restoran']};
function runPool(items,concurrency,worker,signal){let cursor=0;return Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(true){if(signal?.aborted)return;const i=cursor++;if(i>=items.length)return;await worker(items[i],signal);}}));}
const AREA_CENTER_NAMES={
  dki_jakarta:['Jakarta Pusat','Jakarta Selatan','Jakarta Barat','Jakarta Timur','Jakarta Utara','Kebayoran Baru','Kelapa Gading','Cengkareng'],
  kota_bogor:['Bogor Tengah','Bogor Selatan','Bogor Utara','Bogor Timur','Bogor Barat'],
  kabupaten_bogor:['Cibinong','Sentul','Citeureup','Gunung Putri','Cileungsi','Ciawi','Parung'],
  kota_depok:['Depok','Cinere','Sawangan','Beji Depok'],
  kota_bekasi:['Bekasi Barat','Bekasi Timur','Summarecon Bekasi'],
  kabupaten_bekasi:['Cikarang','Cibitung','Tambun'],
  kota_tangerang:['Tangerang','Karawaci'],
  kabupaten_tangerang:['Gading Serpong','Alam Sutera'],
  tangerang_selatan:['Bintaro','BSD City','Ciputat','Pamulang'],
  kota_bandung:['Bandung Tengah','Bandung Utara','Bandung Timur','Bandung Selatan','Bandung Barat','Dago','Setiabudi Bandung','Buah Batu','Antapani'],
  kabupaten_bandung:['Soreang','Majalaya'],
  bandung_barat:['Padalarang','Lembang'],
  kota_cimahi:['Cimahi']
};
function centersFor(area,centers){
  if(area==='jabodetabek')return centers.filter(c=>c.region==='jabodetabek');
  if(area==='bandung')return centers.filter(c=>c.region==='bandung');
  if(area==='jabodetabek_bandung')return centers;
  if(area==='kota')return centers.filter(c=>BOGOR_CITY.has(c.name));
  if(area==='kabupaten')return centers.filter(c=>BOGOR_KAB.has(c.name));
  if(area==='both')return centers.filter(c=>BOGOR_CITY.has(c.name)||BOGOR_KAB.has(c.name));
  const allowed=AREA_CENTER_NAMES[area];
  return allowed?centers.filter(c=>allowed.includes(c.name)):centers;
}
exports.handler=async(event)=>{if(event.httpMethod==='OPTIONS')return{statusCode:204,headers:cors(event)};if(event.httpMethod!=='POST')return{statusCode:405,headers:cors(event),body:JSON.stringify({error:'POST only'})};const auth=await requireAuth(event);if(!auth.ok)return{statusCode:auth.statusCode,headers:cors(event),body:JSON.stringify({error:auth.error})};const key=process.env.GOOGLE_MAPS_API_KEY;if(!key)return{statusCode:503,headers:cors(event),body:JSON.stringify({error:'Google Places belum dikonfigurasi: GOOGLE_MAPS_API_KEY'})};let body;try{body=JSON.parse(event.body||'{}')}catch{return{statusCode:400,headers:cors(event),body:JSON.stringify({error:'Invalid JSON'})}};if(body.healthcheck)return{statusCode:200,headers:cors(event),body:JSON.stringify({ok:true,provider:'Google Places API (New)'})};let centers=Array.isArray(body.centers)?body.centers:[];centers=centersFor(body.area||'jabodetabek_bandung',centers);const queries=Array.isArray(body.queries)&&body.queries.length?body.queries:(TERMS[body.category]||TERMS.all);const radius=Math.max(1000,Math.min(10000,Number(body.radius||5000)));const maxJobs=Math.max(1,Math.min(80,Number(process.env.GOOGLE_MAX_SEARCHES||80)));const jobs=[];for(const c of centers)for(const q of queries)jobs.push({center:c,query:String(q).trim()});const planned=jobs.slice(0,maxJobs);const truncated=jobs.length>planned.length;const timeout=Math.max(1000,Number(process.env.GOOGLE_TIMEOUT_MS||6000));const globalDeadline=Math.max(timeout+500,Math.min(22000,Number(process.env.GOOGLE_GLOBAL_DEADLINE_MS||20000)));const globalController=new AbortController();const globalTimer=setTimeout(()=>globalController.abort(),globalDeadline);const concurrency=Math.max(1,Math.min(8,Number(process.env.GOOGLE_CONCURRENCY||4)));const places=new Map(),failures=[],completed=[];await runPool(planned,concurrency,async(job,signal)=>{const {center,query}=job;const payload={textQuery:`${query} in ${center.name}, Indonesia`,pageSize:20,languageCode:'id',locationBias:{circle:{center:{latitude:center.lat,longitude:center.lng},radius}}};try{const r=await fetchWithTimeout(GOOGLE_URL,{method:'POST',headers:{'content-type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':FIELD_MASK},body:JSON.stringify(payload)},timeout,signal);const text=await r.text();if(!r.ok){failures.push({center:center.name,query,status:r.status,detail:text.slice(0,160)});return;}const data=JSON.parse(text);for(const p of data.places||[])if(p.id)places.set(p.id,p);completed.push({center:center.name,query,count:(data.places||[]).length});}catch(e){failures.push({center:center.name,query,error:e?.name==='AbortError'?'timeout':(e?.message||'request_failed')});}} ,globalController.signal);clearTimeout(globalTimer);return{statusCode:200,headers:{...cors(event),'content-type':'application/json'},body:JSON.stringify({places:[...places.values()],diagnostics:{plannedJobs:planned.length,totalJobs:jobs.length,successfulJobs:completed.length,failedJobs:failures.length,uniquePlaces:places.size,truncated,completed,failures,globalDeadlineMs:globalDeadline,deadlineExceeded:globalController.signal.aborted}})};};
