import fs from 'node:fs';
const main=fs.readFileSync('index.html','utf8');
const acq=fs.readFileSync('features/acquisition_os/index.html','utf8');
const checks=[
 ['TRACE guided workflow', main.includes('trace-workflow-step') && main.includes('Kelola Klien') && main.includes('Hitung Keuangan')],
 ['Finance guided/advanced mode', main.includes('data-finance-mode="guided"') && main.includes('data-finance-mode="advanced"')],
 ['Finance advanced feature access', main.includes('data-akttab="target"') && main.includes('data-akttab="marketing"') && main.includes('data-akttab="leakage"')],
 ['Acquisition guided flow', acq.includes('trace-acq-flow') && acq.includes('data-flow-page="discovery"') && acq.includes('data-flow-page="followups"')],
 ['Atomic Data Intake migration packaged', fs.existsSync('supabase/migrations/014_trace_data_intake_atomic_transition.sql')],
 ['Atomic Data Intake RPC present', fs.existsSync('supabase/migrations/014_trace_data_intake_atomic_transition.sql') && fs.readFileSync('supabase/migrations/014_trace_data_intake_atomic_transition.sql','utf8').includes('trace_transition_data_intake')],
];
let fail=0; for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name); if(!ok) fail++;}
if(fail) process.exit(1);
console.log(`${checks.length}/${checks.length} UX hardening assertions passed.`);
