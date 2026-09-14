// Static release checks: no browser/dependency required.
const fs=require('fs'), cp=require('child_process'), path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const tests=[
  ['Supabase Auth login exists', /signInWithPassword/.test(html)],
  ['Supabase Auth session check exists', /auth\.getSession\(\)/.test(html)],
  ['Auth state listener exists', /onAuthStateChange/.test(html)],
  ['Logout exists', /authLogoutBtn/.test(html) && /auth\.signOut\(\)/.test(html)],
  ['No public RLS policy in app docs', !/public read write/i.test(html)],
  ['Auth RLS file packaged', fs.existsSync(path.join(root,'SUPABASE_AUTH_RLS.sql'))],
  ['Dead script_1.js absent', !fs.existsSync(path.join(root,'script_1.js'))],
  ['Full client report export exists', /exportFullTraceReportPdf/.test(html)],
  ['Accounting PDF export exists', /exportAkuntansiPdf/.test(html)],
  ['Total backup export exists', /id="exportBtn"/.test(html) && /JSON\.stringify\(\{ exportedAt/.test(html)],
  ['History close listener exists', /historyClose/.test(html) && /closeHistory/.test(html)],
  ['TRACE Consultant client PDF branding exists', /TRACE CONSULTANT/.test(html) && /Client Performance/.test(html)],
  ['Bullet is sanitized in client report', /\[·•\]/.test(html) && /replace\(\/\[\\u00A0\]/.test(html)],
  ['Historical sale price is captured', /unitPrice:\s*Number\(produkMaster\?\.harga/.test(html)],
  ['Revenue uses stored historical sale price', /Number\.isFinite\(Number\(rec\.unitPrice\)\)/.test(html) && /const unitPrice =/.test(html)],
  ['Negative OPEX credit is excluded from cash-expense source linking', /filter\(x=>x\.scope===scope && Number\(x\.amount\|\|0\)>0\)/.test(html)],
  ['Transaction source uses canonical outletRevenue engine', /const revenue=outletRevenue\(x,pm\)/.test(html)],
  ['Data Intake adapters packaged', fs.existsSync(path.join(root,'src/core/fileIntakeAdapters.ts'))],
  ['Data Intake extended formats', /docx.*txt.*json.*image/.test(fs.readFileSync(path.join(root,'src/core/dataIntake.ts'),'utf8'))],
  ['Diagnostic run endpoint packaged', fs.existsSync(path.join(root,'netlify/functions/diagnostic-run.js'))],
  ['Diagnostic telemetry endpoint packaged', fs.existsSync(path.join(root,'netlify/functions/diagnostic-telemetry.js'))],
  ['Overpass has global deadline', /GLOBAL_DEADLINE_MS/.test(fs.readFileSync(path.join(root,'netlify/functions/acq-overpass.js'),'utf8'))],
  ['Google Places has global deadline', /GOOGLE_GLOBAL_DEADLINE_MS/.test(fs.readFileSync(path.join(root,'netlify/functions/acq-google-places.js'),'utf8'))],
  ['React Vite input points to project source', (()=>{const v=fs.readFileSync(path.join(root,'vite.config.ts'),'utf8'); return /input:\s*['"]react-app\/index\.html['"]/.test(v) || /root:\s*['"]react-app['"]/.test(v)})()],
  ['Data Intake parser dependencies declared', (()=>{const p=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')); return !!p.dependencies.mammoth && !!p.dependencies['tesseract.js']})()],
];
let pass=0;
for(const [name,ok] of tests){ if(ok){pass++;console.log('PASS',name)} else console.error('FAIL',name); }
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1].trim()).filter(Boolean);
const js=scripts.filter(x=>x.includes('function todayISO') && x.length>100000).sort((a,b)=>b.length-a.length)[0]||'';
if(!js){console.error('FAIL production inline JavaScript extraction: app block not found');process.exit(1);}
fs.writeFileSync('/tmp/trace_release_inline.js',js);
try{cp.execFileSync(process.execPath,['--check','/tmp/trace_release_inline.js'],{stdio:'pipe'});console.log('PASS production inline JavaScript syntax')}catch(e){console.error('FAIL production inline JavaScript syntax');console.error(e.stderr?.toString()||e.message)}
console.log(`\\n${pass}/${tests.length} static assertions passed.`);
if(pass!==tests.length)process.exit(1);
