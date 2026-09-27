import assert from 'node:assert/strict';
import fs from 'node:fs';

const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync('netlify/functions/_diagnostic-manifest.json','utf8'));
assert.equal(manifest.staticChecks.length,0,'diagnostic manifest must have zero static checks');
assert.equal(manifest.files.some(f=>f.path.endsWith('.md')),false,'diagnostic source manifest must not treat historical markdown as executable source evidence');

const deploy=fs.readFileSync('netlify/functions/ai-deploy.js','utf8');
assert.match(deploy,/async function db\(path,method='GET',body\)/);
assert.match(deploy,/status=eq\.pending/);
assert.match(deploy,/status:'approved'/);
assert.match(deploy,/status:'executed'/);
assert.match(deploy,/status:'rejected'/);
assert.match(deploy,/TRACE_NETLIFY_BUILD_HOOK_URL/);

for (const file of ['_auth.js','acq-google-places.js','acq-overpass.js']) {
  assert.equal(
    fs.readFileSync(`netlify/functions/${file}`,'utf8'),
    fs.readFileSync(`features/acquisition_os/netlify/functions/${file}`,'utf8'),
    `canonical and legacy Acquisition ${file} must remain identical`
  );
}
assert.equal(fs.existsSync('acq-google-places.js'),false,'obsolete root Acquisition duplicate must be removed');
assert.equal(fs.existsSync('features/acquisition_os/acq-google-places.js'),false,'obsolete feature Acquisition duplicate must be removed');
assert.equal(fs.existsSync('netlify/functions/data-intake-import.js'),true,'durable Data Intake import endpoint must be packaged');
assert.equal(fs.existsSync('supabase/migrations/006_trace_data_intake_imports.sql'),true,'durable Data Intake import migration must be packaged');
assert.equal(fs.existsSync('supabase/migrations/008_trace_data_intake_approval_guard.sql'),true,'Data Intake provenance/commit guard must be packaged');
assert.equal(fs.existsSync('supabase/migrations/056_data_intake_race_fix_v73.sql'),true,'Data Intake client_id/source_hash race-condition fix (audit v73) must be packaged');

// audit v73 finding #4 (2026-09-26): guard against copy-static-for-publish.mjs
// regressing back to shipping the whole features/ tree (internal docs,
// schema.sql, netlify function source, and a stale, checksum-divergent
// second copy of the Acquisition tool) or the orphaned root
// trace-acquisition-os.html, while still packaging the one file the
// legacy classic app's iframe actually needs.
const copyScript=fs.readFileSync('scripts/copy-static-for-publish.mjs','utf8');
assert.doesNotMatch(copyScript,/copyDir\(\s*['"]features['"]/,'features/ must not be copied wholesale to the deployed site (audit v73 #4)');
assert.doesNotMatch(copyScript,/copyFile\(\s*['"]trace-acquisition-os\.html['"]\s*\)/,'orphaned root Acquisition duplicate must not ship to the deployed site (audit v73 #4)');
assert.match(copyScript,/features['"]?,\s*['"]?acquisition_os['"]?,\s*['"]?index\.html/,'legacy-classic.html\'s Acquisition iframe target must still be packaged for the deployed site');
console.log('Acquisition duplicate cleanup (audit v73 #4): PASS');

const legacy=fs.readFileSync('index.html','utf8');
assert.match(legacy,/features\/acquisition_os\/index\.html\?embedded=1/,'legacy-classic.html must still point its Acquisition iframe at features/acquisition_os/index.html -- if this ever changes, copy-static-for-publish.mjs above needs to change with it');
assert.match(legacy,/--accent:\s*#f9622c/);
assert.match(legacy,/backdrop-filter:\s*blur/);
assert.match(legacy,/prefers-reduced-motion/);
assert.match(legacy,/:focus-visible/);
assert.match(legacy,/safe-area-inset/);
assert.match(legacy,/@media/);
console.log('Total audit contract: PASS');
const auth=fs.readFileSync('netlify/functions/_auth.js','utf8');
assert.doesNotMatch(auth,/return ALLOWED_ORIGINS\[0\]\|\|['"]\*['"]/,'CORS must not fall back to wildcard origin');
assert.doesNotMatch(auth,/\.netlify\.app\)\$/,'CORS must not allow arbitrary Netlify subdomains');
console.log('CORS wildcard hardening: PASS');

console.log('v44 persistence/workflow integrity contracts are packaged and exercised by core build.');
