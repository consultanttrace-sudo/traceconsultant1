import fs from 'node:fs';
const main=fs.readFileSync('src/app/views/DataIntake.tsx','utf8'); // main.tsx dipecah 2026-09-17; alur Data Intake sekarang di sini
const endpoint=fs.readFileSync('netlify/functions/data-intake-import.js','utf8');
const release=fs.readFileSync('TRACE_RELEASE_VERSION.txt','utf8').trim();
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
function ok(label, condition){ if(!condition) throw new Error(`FAIL: ${label}`); console.log(`PASS ${label}`); }
const pkgVersionMatch = pkg.version.match(/-v(\d+(?:\.\d+)?)$/);
const releaseVersionMatch = release.match(/\bv(\d+(?:\.\d+)?)\b/i);
ok('release metadata is aligned', !!pkgVersionMatch && !!releaseVersionMatch && pkgVersionMatch[1] === releaseVersionMatch[1]);
ok('Data Intake persists Draft before Review', /status:'draft'/.test(main) && /status:'draft'/.test(main.slice(main.indexOf('if\(parsed\)'))));
ok('Data Intake UI Review follows Draft persistence', /persistImport\('reviewed'\)/.test(main));
ok('Data Intake UI Approval remains Review-gated', /reviewState!=='reviewed'/.test(main) && /persistImport\('approved'\)/.test(main));
ok('Server delegates state transition to transactional Supabase RPC', /trace_transition_data_intake/.test(endpoint) && /p_status:status/.test(endpoint) && /p_client_id:clientId/.test(endpoint));
ok('Server rejects invalid transition from RPC result', /TRACE_IMPORT_INVALID_STATUS_TRANSITION/.test(endpoint) && /Status import tidak mengikuti alur Draft/.test(endpoint));
