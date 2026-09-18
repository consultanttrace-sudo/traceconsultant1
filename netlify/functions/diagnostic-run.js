const fs = require('node:fs');
const path = require('node:path');
const { cors, requireAuth, fetchWithTimeout } = require('./_auth');

function response(statusCode, body, event) {
  return { statusCode, headers: { ...cors(event), 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

function lineOf(content, index) { return content.slice(0, index).split(/\r?\n/).length; }
function snippet(content, index) { return content.slice(Math.max(0, index - 90), Math.min(content.length, index + 220)).replace(/\s+/g, ' ').trim(); }
function add(findings, f) { findings.push(f); }

function scanManifest(manifest) {
  const findings = [];
  for (const file of manifest.files || []) {
    const { path: filePath, content = '' } = file;
    const isCode = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/.test(filePath);
    const todo = /\b(?:TODO|FIXME|XXX)\b|throw new Error\(['"]TODO/i.exec(content);
    if (isCode && todo) add(findings, { id: `todo:${filePath}:${lineOf(content, todo.index)}`, severity: 'medium', category: 'runtime_risk', title: 'Unfinished error path detected', cause: 'Explicit TODO/FIXME or placeholder error path exists.', impact: 'A workflow may fail or remain incomplete when this path executes.', solution: 'Implement the missing branch and add a regression test.', evidence: [{ file: filePath, line: lineOf(content, todo.index), code: snippet(content, todo.index), reason: 'Explicit unfinished marker.' }], confidence: 0.99, status: 'suspected' });
    const loop = /while\s*\(\s*true\s*\)/.exec(content);
    if (isCode && loop && !/(?:break\s*;|return\b)/.test(content.slice(loop.index, loop.index + 1200))) add(findings, { id: `loop:${filePath}:${lineOf(content, loop.index)}`, severity: 'high', category: 'runtime_risk', title: 'Potential non-terminating loop', cause: 'while(true) has no nearby break or return in the inspected block.', impact: 'A request/job can hang or consume resources.', solution: 'Add an explicit termination condition, cancellation, retry bound, and deadline.', evidence: [{ file: filePath, line: lineOf(content, loop.index), code: snippet(content, loop.index), reason: 'Unbounded loop pattern.' }], confidence: 0.9, status: 'suspected' });
    const fetches = [...content.matchAll(/fetch\s*\(/g)];
    if (isCode && fetches.length >= 5 && !/AbortController|AbortSignal/.test(content)) {
      const idx = fetches[0].index ?? 0;
      add(findings, { id: `fetch-timeout:${filePath}`, severity: 'medium', category: 'performance', title: 'Network calls without visible cancellation', cause: `${fetches.length} fetch calls are present without an AbortController/AbortSignal reference.`, impact: 'Slow providers can keep workflows open longer than intended.', solution: 'Use bounded request deadlines and propagate AbortSignal through provider calls.', evidence: [{ file: filePath, line: lineOf(content, idx), code: snippet(content, idx), reason: 'Multiple network calls without cancellation primitive.' }], confidence: 0.86, status: 'suspected' });
    }
    const mapFetch = /\.map\([^\n]+=>[^\n]+fetch\s*\(/.exec(content);
    if (isCode && mapFetch) add(findings, { id: `parallel-map-fetch:${filePath}:${lineOf(content, mapFetch.index)}`, severity: 'medium', category: 'performance', title: 'Potential unbounded request fan-out', cause: 'fetch appears inside a map callback.', impact: 'Large inputs can create bursts, rate limits, memory pressure, or slowdowns.', solution: 'Use bounded concurrency and a global deadline.', evidence: [{ file: filePath, line: lineOf(content, mapFetch.index), code: snippet(content, mapFetch.index), reason: 'fetch inside map pattern.' }], confidence: 0.82, status: 'suspected' });

    if (isCode && /localStorage\.(setItem|removeItem)\(/.test(content) && /(LEADS|acquisitionLeads|JSON\.stringify)/.test(content)) {
      const idx = content.search(/localStorage\.(setItem|removeItem)\(/);
      add(findings, { id: `storage:${filePath}:${lineOf(content, idx)}`, severity: 'medium', category: 'persistence', title: 'Operational data uses client-side persistence', cause: 'Operational data is serialized through localStorage.', impact: 'Writes are non-transactional, size-limited, and vulnerable to browser/session loss.', solution: 'Use relational Supabase persistence with checkpoints; keep localStorage only as bounded compatibility fallback.', evidence: [{ file: filePath, line: lineOf(content, idx), code: snippet(content, idx), reason: 'Client-side operational persistence pattern.' }], confidence: 0.88, status: 'suspected' });
    }
  }
  return findings;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(event), body: '' };
  if (event.httpMethod !== 'POST') return response(405, { error: 'POST only' }, event);
  const auth = await requireAuth(event);
  if (!auth.ok) return response(auth.statusCode, { error: auth.error }, event);
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  try {
    const manifestPath = path.join(__dirname, '_diagnostic-manifest.json');
    if (!fs.existsSync(manifestPath)) return response(503, { error: 'Diagnostic manifest unavailable' }, event);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const staticFindings = scanManifest(manifest);
    for (const check of manifest.staticChecks || []) {
      if (check.kind === 'syntax') staticFindings.push({ id:`syntax:${check.file}`, severity:'critical', category:'syntax', title:'JavaScript syntax check FAILED', cause:'The build-time Node syntax check failed for this file.', impact:'The affected function/module cannot be safely executed or built until syntax is corrected.', solution:'Fix the syntax at the reported file/code location, then rerun the build/typecheck and regression tests.', evidence:[{file:check.file,code:check.code,reason:check.reason}], confidence:1, status:'confirmed' });
      if (check.kind === 'missing_local_import') staticFindings.push({ id:`missing-import:${check.file}:${check.code}`, severity:'high', category:'integration', title:'Local import target is missing', cause:`${check.code} does not resolve to a known repository file.`, impact:'The affected module can fail at build time or runtime.', solution:'Restore the missing module or update the import to the canonical path, then rerun typecheck/build.', evidence:[{file:check.file,code:check.code,reason:check.reason}], confidence:1, status:'suspected' });
    }
    let telemetry = { runtimeErrors: [], performance: [], networkSlowCount: 0, evidence: [] };
    let supabaseConnected = false;
    let operationalJobs = [];
    if (base && key) {
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const [telemetryResult, jobsResult] = await Promise.allSettled([
        fetchWithTimeout(`${base}/rest/v1/trace_diagnostic_events?select=kind,payload,created_at&order=created_at.desc&limit=200`, { headers }, 2500),
        fetchWithTimeout(`${base}/rest/v1/trace_jobs?select=id,job_type,status,requested_by,progress,error,heartbeat_at,updated_at&order=updated_at.desc&limit=100`, { headers }, 2500)
      ]);
      if (telemetryResult.status === 'fulfilled' && telemetryResult.value.ok) {
        supabaseConnected = true;
        const rows = await telemetryResult.value.json();
        for (const row of rows) {
          const p = row.payload || {};
          const kind = row.kind || p.kind;
          if (kind === 'runtime') telemetry.runtimeErrors.push(p.event);
          if (kind === 'performance') telemetry.performance.push(p.event);
          if (kind === 'network') telemetry.networkSlowCount += 1;
          if (['data','job','test','supabase','dependency'].includes(kind)) telemetry.evidence.push({ kind, event:p.event, createdAt:row.created_at });
        }
      } else telemetry.evidence.push({kind:'supabase',event:{status:'partial',check:'diagnostic telemetry',reason:'Telemetry source unavailable or timed out.'},createdAt:new Date().toISOString()});
      if (jobsResult.status === 'fulfilled' && jobsResult.value.ok) operationalJobs = await jobsResult.value.json();
      else telemetry.evidence.push({kind:'job',event:{status:'partial',reason:'Job source unavailable or timed out.'},createdAt:new Date().toISOString()});
    }
    const nowMs = Date.now();
    const staleJobs = operationalJobs.filter(j => ['RUNNING','PAUSING','STOPPING'].includes(j.status) && j.heartbeat_at && nowMs - Date.parse(j.heartbeat_at) > 120000);
    for (const job of staleJobs) telemetry.evidence.push({ kind:'job', event:{status:'stuck', jobId:job.id, jobType:job.job_type, reason:`Heartbeat terakhir ${Math.round((nowMs-Date.parse(job.heartbeat_at))/1000)} detik lalu.`, impact:'Job aktif tidak mengirim heartbeat dalam batas 2 menit.', solution:'Periksa worker, cancellation, network, checkpoint, dan retry lifecycle.', file:'trace_jobs', line:undefined}, createdAt:job.updated_at });
    const runtimeFindings = telemetry.runtimeErrors.map((e, i) => ({ id: `runtime:${e.file || 'unknown'}:${e.line || 0}:${i}`, severity: 'critical', category: 'runtime_risk', title: 'Runtime error reported', cause: e.message, impact: 'A recorded execution path failed at runtime.', solution: 'Reproduce the error, inspect the exact file/line, fix the root cause, and add a regression test.', evidence: [{ file: e.file || 'runtime', line: e.line, code: e.stack, reason: 'Runtime telemetry.' }], confidence: 1, status: 'confirmed' }));
    const performanceFindings = telemetry.performance.filter(e => Number(e.durationMs) > Number(e.thresholdMs || 1500)).map((e, i) => ({ id: `perf:${e.name || 'runtime'}:${i}`, severity: Number(e.durationMs) > Number(e.thresholdMs || 1500) * 2 ? 'high' : 'medium', category: 'performance', title: `${e.name || 'Resource'} exceeded performance budget`, cause: `Measured ${e.durationMs}ms against ${e.thresholdMs || 1500}ms.`, impact: 'The measured path is slower than the defined budget.', solution: 'Profile the slow path, identify the slow operation, then optimize without weakening correctness.', evidence: [{ file: e.name || 'runtime', reason: 'Performance telemetry.' }], confidence: 1, status: 'confirmed' }));
    const evidenceFindings = telemetry.evidence.flatMap((item, i) => {
      const e = item.event || {};
      if (item.kind === 'data' && (e.status === 'missing' || e.status === 'invalid')) return [{ id:`data:${i}`, severity:e.status==='invalid'?'high':'medium', category:'missing_data', title:`Data ${e.status}: ${e.field || e.label || 'field'}`, cause:e.reason || 'Data evidence reports a missing or invalid field.', impact:e.impact || 'Analisis yang bergantung pada field ini dapat tidak lengkap atau salah.', solution:e.solution || 'Periksa sumber data, lengkapi secara manual atau upload sumber yang benar. Jangan mengisi angka yang tidak diketahui.', evidence:[{file:e.file || 'runtime-data',line:e.line,code:e.code,reason:'Data integrity telemetry.'}], confidence:1, status:'confirmed' }];
      if (item.kind === 'job' && ['failed','stuck','timeout','partial_failure'].includes(e.status)) return [{ id:`job:${i}`, severity:e.status==='failed'?'high':'medium', category:'persistence', title:`Job ${e.status}`, cause:e.reason || 'Job telemetry reports an unhealthy lifecycle state.', impact:e.impact || 'Workflow dapat berhenti, kehilangan checkpoint, atau membutuhkan resume.', solution:e.solution || 'Inspect lifecycle, checkpoint, cancellation, and retry evidence; then add a regression test.', evidence:[{file:e.file || 'job-telemetry',line:e.line,reason:'Job lifecycle telemetry.'}], confidence:1, status:'confirmed' }];
      if (item.kind === 'test' && e.status === 'failed') return [{ id:`test:${i}`, severity:'high', category:'runtime_risk', title:`Test FAILED: ${e.name || 'unknown test'}`, cause:e.reason || 'A real test reported failure.', impact:'The affected behavior is not proven correct.', solution:e.solution || 'Fix the root cause and rerun the failing test. Do not mark it PASS manually.', evidence:[{file:e.file || 'test-runner',line:e.line,code:e.output,reason:'Test result telemetry.'}], confidence:1, status:'confirmed' }];
      if (item.kind === 'supabase' && e.status === 'failed') return [{ id:`supabase:${i}`, severity:'high', category:'security', title:`Supabase check FAILED: ${e.check || 'database check'}`, cause:e.reason || 'Supabase/RLS telemetry reports a failed check.', impact:e.impact || 'Database access or persistence cannot be considered healthy.', solution:e.solution || 'Inspect the exact SQL/RLS check and fix it before release.', evidence:[{file:e.file || 'supabase-telemetry',line:e.line,reason:'Supabase/RLS telemetry.'}], confidence:1, status:'confirmed' }];
      if (item.kind === 'dependency' && e.status === 'missing') return [{ id:`dependency:${i}`, severity:'high', category:'missing_dependency', title:`Dependency missing: ${e.name || 'unknown'}`, cause:e.reason || 'Dependency resolution reports a missing package.', impact:'Build or runtime can fail before the affected feature starts.', solution:e.solution || 'Install/lock the dependency and rerun typecheck/build.', evidence:[{file:e.file || 'package.json',reason:'Dependency telemetry.'}], confidence:1, status:'blocked' }];
      return [];
    });
    const findings = [...runtimeFindings, ...performanceFindings, ...evidenceFindings, ...staticFindings].sort((a, b) => ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 }[b.severity] - ({ critical: 5, high: 4, medium: 3, low: 2, info: 1 }[a.severity])));
    const evidenceCounts = telemetry.evidence.reduce((acc, item) => { acc[item.kind] = (acc[item.kind] || 0) + 1; return acc; }, {});
    const sources = {
      source: { status: manifest.files.length ? 'connected' : 'blocked', evidenceCount: manifest.files.length },
      supabase: { status: supabaseConnected ? 'connected' : 'unavailable', evidenceCount: supabaseConnected ? 1 : 0 },
      data: { status: evidenceCounts.data ? 'connected' : 'partial', evidenceCount: evidenceCounts.data || 0 },
      jobs: { status: operationalJobs.length ? (staleJobs.length ? 'partial' : 'connected') : 'partial', evidenceCount: operationalJobs.length + (evidenceCounts.job || 0) },
      tests: { status: evidenceCounts.test ? 'connected' : 'unavailable', evidenceCount: evidenceCounts.test || 0 },
      dependencies: { status: evidenceCounts.dependency ? 'connected' : 'partial', evidenceCount: evidenceCounts.dependency || 0 },
    };
    return response(200, { readOnly: true, generatedAt: new Date().toISOString(), manifestVersion: manifest.version, fileCount: manifest.files.length, findings, telemetry, sources }, event);
  } catch (error) {
    return response(500, { error: 'Diagnostic run failed', detail: error?.message || String(error) }, event);
  }
};
