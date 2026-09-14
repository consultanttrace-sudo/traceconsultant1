import fs from 'node:fs';
const main=fs.readFileSync('src/app/main.tsx','utf8');
const endpoint=fs.readFileSync('netlify/functions/data-intake-import.js','utf8');
const release=fs.readFileSync('TRACE_RELEASE_VERSION.txt','utf8').trim();
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
function ok(label, condition){ if(!condition) throw new Error(`FAIL: ${label}`); console.log(`PASS ${label}`); }
const pkgVersionMatch = pkg.version.match(/-v(\d+)$/);
const releaseVersionMatch = release.match(/\bv(\d+)\b/i);
ok('release metadata is aligned', !!pkgVersionMatch && !!releaseVersionMatch && pkgVersionMatch[1] === releaseVersionMatch[1]);
ok('Data Intake persists Draft before Review', /status:'draft'/.test(main) && /status:'draft'/.test(main.slice(main.indexOf('if\(parsed\)'))));
ok('Data Intake UI Review follows Draft persistence', /persistImport\('reviewed'\)/.test(main));
ok('Data Intake UI Approval remains Review-gated', /reviewState!=='reviewed'/.test(main) && /persistImport\('approved'\)/.test(main));
ok('Server enforces none→draft→reviewed→approved', /current==='none'&&status==='draft'/.test(endpoint) && /current==='draft'&&\['draft','reviewed'\]/.test(endpoint) && /current==='reviewed'&&\['reviewed','approved'\]/.test(endpoint));
ok('Server rejects direct approval from absent state', /!allowedTransition\)return json\(409/.test(endpoint));
