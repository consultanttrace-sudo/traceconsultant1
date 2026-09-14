import assert from 'node:assert/strict';
import { diagnoseApplication, summarizeDiagnostics } from '../dist/core/aiDiagnostic.js';

const findings = diagnoseApplication({
  files: [
    { path:'netlify/functions/example.js', content:`const a = Array.from(items).map(x => fetch('/api/'+x));\nwhile (true) { console.log('x') }` },
    { path:'src/storage.js', content:`localStorage.setItem('acquisitionLeads', JSON.stringify(LEADS));` }
  ],
  missingDependencies:['react'],
  missingFiles:['src/missing-module.ts'],
  runtimeErrors:[{message:'Cannot read properties of undefined',file:'src/app/main.tsx',line:42}],
  performance:[{file:'netlify/functions/example.js',metric:'request duration',valueMs:22000,thresholdMs:9000}]
});
assert.ok(findings.some(f => f.category === 'runtime_risk' && f.severity === 'critical'));
assert.ok(findings.some(f => f.category === 'missing_dependency' && f.status === 'blocked'));
assert.ok(findings.some(f => f.category === 'missing_data' ) === false);
assert.ok(findings.some(f => f.category === 'performance'));
assert.ok(findings.some(f => f.category === 'persistence'));
assert.ok(findings.some(f => f.category === 'integration'));
const summary = summarizeDiagnostics(findings);
assert.equal(summary.releaseBlocked, true);
assert.equal(summary.total, findings.length);
console.log('AI diagnostic core: PASS');

const bounded=diagnoseApplication({files:[{path:'bounded.js',content:`let i=0; while(true){ if(i++ > 3) return; }`}]}); assert.equal(bounded.filter(f=>f.id.startsWith('loop:')).length,0); console.log('bounded loop diagnostic: PASS');
