import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_ANON_KEY = 'anon-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
process.env.TRACE_GITHUB_TOKEN = 'github-test';
process.env.TRACE_GITHUB_OWNER = 'trace-owner';
process.env.TRACE_GITHUB_REPO = 'trace-repo';
process.env.TRACE_GITHUB_BASE_BRANCH = 'main';

const approvalId = '11111111-1111-4111-8111-111111111111';
const plan = {
  id: 'repair:test-github-pr',
  findingId: 'finding:test',
  title: 'Test GitHub PR repair',
  safety: 'review_required',
  canApplyAutomatically: false,
  reason: 'runtime contract test',
  steps: [{ action: 'patch', title: 'Replace test file', detail: 'test' }],
  verification: ['test'],
  patch: { files: [{ path: 'tests_core/__trace_self_repair_fixture.txt', content: 'TRACE SELF REPAIR TEST\n' }] },
};
const scopeHash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
let mode = 'approve';
const calls = [];

globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  calls.push({ url: u, method: options.method || 'GET' });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.endsWith('/auth/v1/user')) return json({ id: 'leader-user' });
  if (u.includes('/rest/v1/trace_team_members')) return json([{ user_id: 'leader-user' }]);
  if (u.endsWith('/rest/v1/rpc/trace_record_repair_approval')) return json({ approved: true, approvalId, findingId: plan.findingId, planId: plan.id, expiresAt: new Date(Date.now() + 600000).toISOString() });
  if (u.includes('/rest/v1/trace_ai_approvals?')) return json([{ id: approvalId, actor_user_id: 'leader-user', action: 'apply_patch', environment: 'workspace', status: 'approved', scope_hash: scopeHash, expires_at: new Date(Date.now() + 600000).toISOString(), revoked_at: null, metadata: {} }]);
  if (u.includes('/rest/v1/trace_ai_approvals?id=') && options.method === 'PATCH') return json({});
  if (u.includes('/repos/trace-owner/trace-repo/git/ref/heads/main')) return json({ object: { sha: 'base-sha' } });
  if (u.includes('/repos/trace-owner/trace-repo/git/commits/base-sha')) return json({ tree: { sha: 'base-tree' } });
  if (u.endsWith('/git/blobs')) return json({ sha: 'blob-sha' });
  if (u.endsWith('/git/trees')) return json({ sha: 'tree-sha' });
  if (u.endsWith('/git/commits')) return json({ sha: 'commit-sha' });
  if (u.endsWith('/git/refs')) return json({ ref: 'refs/heads/trace-ai/test' });
  if (u.endsWith('/pulls')) return json({ number: 42, html_url: 'https://github.com/trace-owner/trace-repo/pull/42', state: 'open', title: 'chore(ai-repair): Test GitHub PR repair' });
  throw new Error(`Unexpected fetch: ${u}`);
};

const runtimeAuth = path.join(process.cwd(), 'tests_core/_auth_runtime_test.cjs');
const runtimeFunction = path.join(process.cwd(), 'tests_core/diagnostic-repair_runtime_test.cjs');
fs.copyFileSync(path.join(process.cwd(), 'netlify/functions/_auth.js'), runtimeAuth);
fs.copyFileSync(path.join(process.cwd(), 'netlify/functions/diagnostic-repair.js'), runtimeFunction);
let runtimeSource = fs.readFileSync(runtimeFunction, 'utf8').replace("require('./_auth')", "require('./_auth_runtime_test.cjs')");
fs.writeFileSync(runtimeFunction, runtimeSource);
let handler;
try {
  const mod = await import('./diagnostic-repair_runtime_test.cjs');
  handler = mod.handler;

const event = { httpMethod: 'POST', headers: { Authorization: 'Bearer user-token' } };

const approved = await handler({ ...event, body: JSON.stringify({ action: 'approve', approved: true, plan }) });
if (approved.statusCode !== 200) throw new Error(`approve failed: ${approved.statusCode} ${approved.body}`);
const approvedBody = JSON.parse(approved.body);
if (approvedBody.approvalId !== approvalId || approvedBody.executable !== true) throw new Error('approval response contract failed');

mode = 'apply';
const applied = await handler({ ...event, body: JSON.stringify({ action: 'apply', approved: true, approvalId, plan }) });
if (applied.statusCode !== 200) throw new Error(`apply failed: ${applied.statusCode} ${applied.body}`);
const appliedBody = JSON.parse(applied.body);
if (appliedBody.status !== 'pull_request_created' || appliedBody.pullRequest?.number !== 42) throw new Error('PR creation response contract failed');
if (!calls.some(c => c.url.endsWith('/git/refs'))) throw new Error('branch creation was not called');
if (!calls.some(c => c.url.endsWith('/pulls'))) throw new Error('PR creation was not called');
console.log('GitHub Self-Repair mocked end-to-end runtime: PASS');
console.log(`Verified calls: ${calls.length}`);
} finally {
  fs.rmSync(runtimeAuth, { force: true });
  fs.rmSync(runtimeFunction, { force: true });
}
