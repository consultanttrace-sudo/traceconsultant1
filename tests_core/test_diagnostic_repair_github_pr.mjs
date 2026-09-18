import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fn = fs.readFileSync(path.join(root, 'netlify/functions/diagnostic-repair.js'), 'utf8');
const ts = fs.readFileSync(path.join(root, 'src/core/diagnosticRepair.ts'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/app/views/SettingsCenter.tsx'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/036_acquisition_kv_and_repair_approval.sql'), 'utf8');

const checks = [
  ['GitHub token is server-side only', /process\.env\.TRACE_GITHUB_TOKEN/.test(fn)],
  ['GitHub branch is created through Git refs API', /\/git\/refs/.test(fn) && /refs\/heads\//.test(fn)],
  ['Git blobs are created from patch content', /\/git\/blobs/.test(fn) && /encoding: 'base64'/.test(fn)],
  ['Git tree is created from patch files', /\/git\/trees/.test(fn) && /base_tree/.test(fn)],
  ['Commit is created before PR', /\/git\/commits/.test(fn)],
  ['Pull Request is created', /\/pulls/.test(fn)],
  ['Production deploy is explicitly not triggered', /Production is \*\*not\*\* changed/.test(fn)],
  ['Executable patch is required', /status: 'patch_required'/.test(fn) && /normalizePatch/.test(fn)],
  ['Path traversal is blocked', /path\.includes\('\.\.'\)/.test(fn)],
  ['Patch size is bounded', /MAX_FILE_BYTES/.test(fn) && /MAX_TOTAL_BYTES/.test(fn)],
  ['Approval scope is bound to exact plan hash', /approval\.scope_hash !== scopeHash/.test(fn) && /sha256\(canonicalPlan\(plan\)\)/.test(fn)],
  ['Approval must belong to current leader and remain valid', /actor_user_id=eq\./.test(fn) && /status=eq\.approved/.test(fn) && /expires_at=gt\./.test(fn) && /revoked_at=is\.null/.test(fn)],
  ['Approval is consumed after PR creation', /status: 'executed'/.test(fn) && /executed_at/.test(fn)],
  ['Client sends approvalId', /approvalId: string/.test(ts) && /request\.approvalId/.test(ts)],
  ['Client calls apply action', /action: 'apply'/.test(ts)],
  ['UI stores server approvalId', /repairApprovals/.test(settings) && /p\.approvalId/.test(settings)],
  ['UI exposes GitHub PR only for executable approved plan', /Create GitHub PR/.test(settings) && /plan\.patch\?\.files\?\.length/.test(settings)],
  ['SQL approval row uses apply_patch/workspace', /'apply_patch','workspace'/.test(migration) && /returning id into r_id/.test(migration)],
  ['Old 4-argument RPC is removed to avoid overload ambiguity', /drop function if exists public\.trace_record_repair_approval\(text,text,text,jsonb\)/.test(migration)],
];
const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
if (failed.length) process.exit(1);
console.log(`GitHub Self-Repair contract checks: PASS (${checks.length}/${checks.length})`);
