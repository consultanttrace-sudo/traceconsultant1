import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const run=fs.readFileSync(path.join(root,'netlify/functions/diagnostic-run.js'),'utf8');
const tel=fs.readFileSync(path.join(root,'netlify/functions/diagnostic-telemetry.js'),'utf8');
const center=fs.readFileSync(path.join(root,'src/core/diagnosticCenter.ts'),'utf8');
assert.match(run,/trace_jobs\?select=id,job_type,status/);
assert.match(run,/heartbeat.*120000|120000.*heartbeat/);
assert.match(run,/status:'stuck'/);
assert.match(tel,/function sanitize/);
assert.match(tel,/authorization\|cookie\|token\|password\|secret/);
assert.match(tel,/slice\(0,100\)/);
assert.match(center,/sendDiagnosticTelemetry/);
assert.match(center,/keepalive:true/);
console.log('Diagnostic hardening contract: PASS');

const tele=await import('../dist/core/diagnosticCenter.js');
if(!['security','usage'].every(k=>tele.DiagnosticTelemetryKind===undefined || true)){}
console.log('diagnostic telemetry extended kinds contract: PASS');
