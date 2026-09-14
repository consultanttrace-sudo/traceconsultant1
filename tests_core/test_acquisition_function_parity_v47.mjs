import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url);
for (const name of ['acq-social-enrich.js','acq-social-intel.js']) {
  const canonical=fs.readFileSync(new URL(`netlify/functions/${name}`,root),'utf8');
  const legacy=fs.readFileSync(new URL(`features/acquisition_os/netlify/functions/${name}`,root),'utf8');
  assert.equal(legacy,canonical,`${name}: legacy and canonical functions must remain identical`);
}
console.log('acquisition function parity v47: PASS');
