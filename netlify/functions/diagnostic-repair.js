const crypto = require('node:crypto');
const { cors, requireAuth, fetchWithTimeout } = require('./_auth');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GITHUB_TOKEN = process.env.TRACE_GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.TRACE_GITHUB_OWNER || '';
const GITHUB_REPO = process.env.TRACE_GITHUB_REPO || '';
const GITHUB_BASE_BRANCH = process.env.TRACE_GITHUB_BASE_BRANCH || 'main';
const APPROVAL_TTL_MS = Math.max(60_000, Number(process.env.TRACE_AI_REPAIR_APPROVAL_TTL_MS || 15 * 60_000));
const MAX_FILES = 25;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const GITHUB_API = 'https://api.github.com';

function response(status, body, event) {
  return {
    statusCode: status,
    headers: { ...cors(event), 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonicalPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('Invalid repair plan');
  return JSON.stringify(plan);
}

function sanitizePlan(plan) {
  const raw = JSON.parse(canonicalPlan(plan));
  if (!String(raw.id || '').trim() || !String(raw.findingId || '').trim()) throw new Error('Repair plan id/findingId required');
  return raw;
}

function normalizePatch(plan) {
  const files = plan?.patch?.files;
  if (!Array.isArray(files) || files.length === 0) return null;
  if (files.length > MAX_FILES) throw new Error(`Patch exceeds ${MAX_FILES} files`);
  let totalBytes = 0;
  const normalized = files.map((file, index) => {
    if (!file || typeof file !== 'object') throw new Error(`Patch file ${index + 1} is invalid`);
    const path = String(file.path || '').trim().replaceAll('\\', '/');
    if (!path || path.startsWith('/') || path.includes('..') || path.includes('//')) throw new Error(`Unsafe patch path: ${path || '(empty)'}`);
    if (path.startsWith('.git/') || path === '.git' || path.includes('/.git/')) throw new Error(`Protected patch path: ${path}`);
    const isDelete = file.content === null;
    if (!isDelete && typeof file.content !== 'string') throw new Error(`Patch content missing for ${path}`);
    const content = isDelete ? null : file.content;
    const bytes = content === null ? 0 : Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) throw new Error(`Patch file exceeds ${MAX_FILE_BYTES} bytes: ${path}`);
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error(`Patch exceeds ${MAX_TOTAL_BYTES} total bytes`);
    return { path, content, mode: file.mode === '100755' ? '100755' : '100644' };
  });
  const seen = new Set();
  for (const file of normalized) {
    if (seen.has(file.path)) throw new Error(`Duplicate patch path: ${file.path}`);
    seen.add(file.path);
  }
  return normalized;
}

async function supabaseFetch(path, options = {}, timeoutMs = 5000) {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not configured');
  return fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${String(path).replace(/^\/+/, '')}`, options, timeoutMs);
}

async function supabaseService(path, method = 'GET', body) {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
  const r = await supabaseFetch(path, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...(method === 'GET' ? {} : { Prefer: 'return=representation' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, 7000);
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function isLeader(event, userId) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  const r = await supabaseFetch(
    `trace_team_members?user_id=eq.${encodeURIComponent(userId)}&active=eq.true&role=eq.leader&select=user_id`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: authHeader } },
    3000,
  );
  if (!r.ok) return false;
  const rows = await r.json();
  return Array.isArray(rows) && rows.length === 1;
}

function githubConfigured() {
  return Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
}

async function githubRequest(path, options = {}, timeoutMs = 15_000) {
  if (!githubConfigured()) throw new Error('GitHub Self-Repair belum dikonfigurasi');
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'TRACE-Consultant-OS-AI-Self-Repair',
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  const r = await fetchWithTimeout(`${GITHUB_API}${path}`, { ...options, headers }, timeoutMs);
  const text = await r.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 500) }; }
  if (!r.ok) {
    const detail = data?.message || `GitHub HTTP ${r.status}`;
    const error = new Error(detail);
    error.status = r.status;
    error.github = data;
    throw error;
  }
  return data;
}

function branchName(plan) {
  const base = String(plan.id || plan.findingId || 'repair')
    .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'repair';
  return `trace-ai/repair-${base}-${Date.now().toString(36)}`;
}

async function createPullRequest(plan, patch, actorUserId, approvalId) {
  const baseRef = await githubRequest(`/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/ref/heads/${encodeURIComponent(GITHUB_BASE_BRANCH)}`);
  const baseSha = baseRef?.object?.sha;
  if (!baseSha) throw new Error('GitHub base branch SHA unavailable');
  const baseCommit = await githubRequest(`/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/commits/${encodeURIComponent(baseSha)}`);
  const branch = branchName(plan);
  const blobs = [];
  for (const file of patch) {
    if (file.content === null) {
      blobs.push({ ...file, sha: null });
      continue;
    }
    const blob = await githubRequest(`/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' }),
    });
    if (!blob?.sha) throw new Error(`GitHub blob creation failed for ${file.path}`);
    blobs.push({ ...file, sha: blob.sha });
  }
  const tree = await githubRequest(`/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.tree?.sha,
      tree: blobs.map(file => ({ path: file.path, mode: file.mode, type: 'blob', sha: file.sha })),
    }),
  });
  if (!tree?.sha) throw new Error('GitHub tree creation failed');
  const commitMessage = `chore(ai-repair): ${String(plan.title || plan.id).slice(0, 100)}`;
  const commit = await githubRequest(`/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: commitMessage, tree: tree.sha, parents: [baseSha] }),
  });
  if (!commit?.sha) throw new Error('GitHub commit creation failed');
  await githubRequest(`/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  });
  const body = [
    '## TRACE AI Self-Repair',
    '',
    'This pull request was created after explicit leader approval.',
    '',
    `- Finding: \`${plan.findingId}\``,
    `- Repair plan: \`${plan.id}\``,
    `- Approval: \`${approvalId}\``,
    `- Actor: \`${actorUserId}\``,
    `- Patch SHA: \`${sha256(JSON.stringify(patch))}\``,
    '',
    'Production is **not** changed by this workflow. Human review and merge are required.',
  ].join('\n');
  const pr = await githubRequest(`/repos/${encodeURIComponent(GITHUB_OWNER)}/${encodeURIComponent(GITHUB_REPO)}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title: commitMessage, head: branch, base: GITHUB_BASE_BRANCH, body, draft: false }),
  });
  return { branch, commitSha: commit.sha, treeSha: tree.sha, pullRequest: { number: pr.number, url: pr.html_url, state: pr.state, title: pr.title } };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(event), body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed' }, event);
  const auth = await requireAuth(event);
  if (!auth.ok) return response(auth.statusCode, { error: auth.error }, event);
  if (!SUPABASE_ANON_KEY) return response(500, { error: 'SUPABASE_ANON_KEY not configured' }, event);
  if (!await isLeader(event, auth.user.id)) return response(403, { error: 'Leader role required' }, event);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON' }, event); }
  let plan;
  try { plan = sanitizePlan(body.plan); } catch (error) { return response(400, { error: error.message }, event); }

  if (body.action === 'approve') {
    try {
      const patch = normalizePatch(plan);
      const scopeHash = sha256(canonicalPlan(plan));
      const reason = String(body.reason || 'Explicit repair approval').slice(0, 1000);
      const r = await supabaseFetch('/rpc/trace_record_repair_approval', {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: event.headers?.authorization || event.headers?.Authorization || '', 'content-type': 'application/json' },
        body: JSON.stringify({
          p_finding_id: String(plan.findingId),
          p_plan_id: String(plan.id),
          p_reason: reason,
          p_plan: plan,
          p_scope_hash: scopeHash,
          p_expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
        }),
      }, 7000);
      const payload = await r.json().catch(() => ({}));
      if (!r.ok) return response(r.status >= 400 && r.status < 500 ? r.status : 502, { error: payload.message || payload.error || 'Repair approval failed' }, event);
      return response(200, {
        approved: true,
        status: 'approved',
        approvalId: payload?.approvalId,
        executable: Boolean(patch),
        githubConfigured: githubConfigured(),
        expiresAt: payload?.expiresAt || new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
      }, event);
    } catch (error) {
      return response(500, { error: error.message || 'Repair approval failed' }, event);
    }
  }

  if (body.action !== 'apply') return response(400, { error: 'action must be approve or apply' }, event);
  if (body.approved !== true) return response(409, { error: 'Explicit leader approval required', status: 'approval_required' }, event);
  if (!body.approvalId) return response(400, { error: 'approvalId required; approve the exact plan first' }, event);

  let patch;
  try { patch = normalizePatch(plan); } catch (error) { return response(400, { error: error.message }, event); }
  if (!patch) return response(409, { error: 'This repair plan has no executable source patch. No source change was made.', status: 'patch_required' }, event);
  if (!githubConfigured()) return response(503, { error: 'GitHub Self-Repair is not configured on Netlify. No source change was made.', status: 'github_not_configured' }, event);

  try {
    const approvalRows = await supabaseService(
      `trace_ai_approvals?id=eq.${encodeURIComponent(String(body.approvalId))}&actor_user_id=eq.${encodeURIComponent(auth.user.id)}&action=eq.apply_patch&environment=eq.workspace&status=eq.approved&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&revoked_at=is.null&select=*`,
      'GET',
    );
    const approval = Array.isArray(approvalRows) ? approvalRows[0] : null;
    if (!approval) return response(409, { error: 'Approval not found, expired, revoked, or already used.', status: 'approval_invalid' }, event);
    const scopeHash = sha256(canonicalPlan(plan));
    if (approval.scope_hash !== scopeHash) return response(409, { error: 'Repair plan does not match the approved scope. No source change was made.', status: 'approval_scope_mismatch' }, event);

    const result = await createPullRequest(plan, patch, auth.user.id, approval.id);
    await supabaseService(`trace_ai_approvals?id=eq.${encodeURIComponent(approval.id)}&status=eq.approved`, 'PATCH', {
      status: 'executed',
      executed_at: new Date().toISOString(),
      metadata: { ...(approval.metadata || {}), github: result },
    });
    return response(200, { applied: false, status: 'pull_request_created', approvalId: approval.id, ...result, message: 'GitHub Pull Request created. Production was not changed; human review and merge are required.' }, event);
  } catch (error) {
    const status = Number(error.status);
    return response(status >= 400 && status < 500 ? status : 502, { error: error.message || 'GitHub PR creation failed', status: 'pull_request_failed' }, event);
  }
};
