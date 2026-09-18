// Static release checks: no browser/dependency required.
const fs=require('fs'), cp=require('child_process'), path=require('path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const appHtml=fs.readFileSync(path.join(root,'..','..','index.html'),'utf8');
const tests=[
  ['Supabase Auth login exists', /signInWithPassword/.test(appHtml)],
  ['Supabase Auth session check exists', /auth\.getSession\(\)/.test(appHtml)],
  ['Auth state listener exists', /onAuthStateChange/.test(appHtml)],
  ['Logout exists', /authLogoutBtn/.test(appHtml) && /auth\.signOut\(\)/.test(appHtml)],
  ['No public RLS policy in app docs', !/public read write/i.test(html)],
  ['Auth RLS file packaged', fs.existsSync(path.join(root,'SUPABASE_AUTH_RLS.sql'))],
  ['Dead script_1.js absent', !fs.existsSync(path.join(root,'script_1.js'))],
  ['Full client report export exists', /exportFullTraceReportPdf/.test(appHtml)],
  ['Accounting PDF export exists', /exportAkuntansiPdf/.test(appHtml)],
  ['Total backup export exists', /id="exportBtn"/.test(appHtml) && /JSON\.stringify\(\{ exportedAt/.test(appHtml)],
  ['History close listener exists', /historyClose/.test(appHtml) && /closeHistory/.test(appHtml)],
  ['TRACE Consultant client PDF branding exists', /TRACE CONSULTANT/.test(appHtml) && /Client Performance/.test(appHtml)],
  ['Bullet is sanitized in client report', /\[·•\]/.test(appHtml) && /replace\(\/\[\\u00A0\]/.test(appHtml)],
];
let pass=0;
for(const [name,ok] of tests){ if(ok){pass++;console.log('PASS',name)} else console.error('FAIL',name); }
const scripts=[...appHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1].trim()).filter(Boolean);
const js=scripts.filter(x=>x.includes('function todayISO') && x.length>100000).sort((a,b)=>b.length-a.length)[0]||'';
if(!js){console.error('FAIL production inline JavaScript extraction: app block not found');process.exit(1);}
fs.writeFileSync('/tmp/trace_release_inline.js',js);
try{cp.execFileSync(process.execPath,['--check','/tmp/trace_release_inline.js'],{stdio:'pipe'});console.log('PASS production inline JavaScript syntax')}catch(e){console.error('FAIL production inline JavaScript syntax');console.error(e.stderr?.toString()||e.message)}
console.log(`\\n${pass}/${tests.length} static assertions passed.`);
if(pass!==tests.length)process.exit(1);
