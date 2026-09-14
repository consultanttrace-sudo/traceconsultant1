export type DiagnosticSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type DiagnosticCategory = 'syntax' | 'missing_dependency' | 'missing_data' | 'runtime_risk' | 'performance' | 'security' | 'persistence' | 'integration' | 'file_ingestion';

export interface DiagnosticEvidence {
  file: string;
  line?: number;
  code?: string;
  reason: string;
}

export interface DiagnosticFinding {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  title: string;
  cause: string;
  impact: string;
  solution: string;
  evidence: DiagnosticEvidence[];
  confidence: number;
  status: 'confirmed' | 'suspected' | 'blocked';
}

export interface DiagnosticInput {
  files: Array<{ path: string; content: string }>;
  missingFiles?: string[];
  missingDependencies?: string[];
  runtimeErrors?: Array<{ message: string; file?: string; line?: number; stack?: string }>;
  performance?: Array<{ file?: string; metric: string; valueMs: number; thresholdMs: number }>;
}

const severityRank: Record<DiagnosticSeverity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

function lineOf(content: string, index: number): number { return content.slice(0, index).split(/\r?\n/).length; }
function snippet(content: string, index: number): string { return content.slice(Math.max(0, index - 80), Math.min(content.length, index + 180)).replace(/\s+/g, ' ').trim(); }

export function diagnoseApplication(input: DiagnosticInput): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] = [];

  for (const file of input.files) {
    const path = file.path;
    const content = file.content;
    if (/\b(?:TODO|FIXME|XXX)\b|throw new Error\(['"]TODO/i.test(content)) {
      const index = content.search(/\b(?:TODO|FIXME|XXX)\b|throw new Error\(['"]TODO/i);
      findings.push({ id:`todo:${path}:${lineOf(content,index)}`, severity:'medium', category:'runtime_risk', title:'Unfinished error path detected', cause:'The file contains an explicit TODO/FIXME or placeholder error path.', impact:'The affected workflow may fail when this path is reached.', solution:'Implement the missing branch and add a regression test before release.', evidence:[{file:path,line:lineOf(content,index),code:snippet(content,index),reason:'Explicit unfinished marker detected.'}], confidence:0.99,status:'suspected' });
    }
    const infiniteLoop = /while\s*\(\s*true\s*\)/.exec(content);
    if (infiniteLoop && !/(?:break\s*;|return\b)/.test(content.slice(infiniteLoop.index, infiniteLoop.index + 1000))) {
      findings.push({ id:`loop:${path}:${lineOf(content,infiniteLoop.index)}`, severity:'high', category:'runtime_risk', title:'Potential non-terminating loop', cause:'A while(true) loop has no nearby break or return in the inspected block.', impact:'The request/job can hang, consume CPU, or prevent the UI from completing.', solution:'Add an explicit termination condition, cancellation signal, and bounded retry/deadline.', evidence:[{file:path,line:lineOf(content,infiniteLoop.index),code:snippet(content,infiniteLoop.index),reason:'Unbounded loop pattern.'}], confidence:0.9,status:'suspected' });
    }
    const fetches = [...content.matchAll(/fetch\s*\(/g)];
    if (fetches.length >= 5 && !/AbortController|AbortSignal/.test(content)) {
      const idx = fetches[0].index ?? 0;
      findings.push({ id:`fetch-timeout:${path}`, severity:'medium', category:'performance', title:'Network calls without visible cancellation', cause:`The file contains ${fetches.length} fetch calls but no AbortController/AbortSignal reference.`, impact:'Slow or stalled providers can hold the workflow open longer than intended.', solution:'Use bounded request deadlines and propagate AbortSignal through provider calls.', evidence:[{file:path,line:lineOf(content,idx),code:snippet(content,idx),reason:'Multiple network calls without cancellation primitive.'}], confidence:0.86,status:'suspected' });
    }
    if (/\.map\([^\n]+=>[^\n]+fetch\s*\(/.test(content)) {
      const idx = content.search(/\.map\([^\n]+=>[^\n]+fetch\s*\(/);
      findings.push({ id:`parallel-map-fetch:${path}:${lineOf(content,idx)}`, severity:'medium', category:'performance', title:'Potential unbounded request fan-out', cause:'fetch appears inside a map callback, which can launch one request per item.', impact:'Large datasets can create bursts, rate limiting, memory pressure, or slowdowns.', solution:'Replace with a bounded concurrency pool and global deadline.', evidence:[{file:path,line:lineOf(content,idx),code:snippet(content,idx),reason:'fetch inside map pattern.'}], confidence:0.82,status:'suspected' });
    }
    if (/localStorage\.(setItem|removeItem)\([^\n]*(JSON\.stringify\([^\n]*\*|LEADS|acquisitionLeads)/.test(content)) {
      const idx = content.search(/localStorage\.(setItem|removeItem)/);
      findings.push({ id:`storage:${path}:${lineOf(content,idx)}`, severity:'medium', category:'persistence', title:'Large client-side persistence path detected', cause:'Operational data appears to be serialized into localStorage.', impact:'Large writes can block the main thread and are not a durable transactional database workflow.', solution:'Use relational Supabase persistence with batch checkpoints and retain localStorage only as a bounded compatibility fallback.', evidence:[{file:path,line:lineOf(content,idx),code:snippet(content,idx),reason:'Client-side operational persistence pattern.'}], confidence:0.88,status:'suspected' });
    }
  }

  for (const path of input.missingFiles ?? []) findings.push({ id:`missing-file:${path}`, severity:'high', category:'integration', title:'Referenced file is missing', cause:`The expected file ${path} is unavailable.`, impact:'Imports, routes, builds, or runtime workflows depending on it may fail.', solution:'Restore the file or update the reference to the canonical existing file, then run the relevant regression test.', evidence:[{file:path,reason:'Declared missing file.'}], confidence:1,status:'confirmed' });
  for (const dep of input.missingDependencies ?? []) findings.push({ id:`missing-dep:${dep}`, severity:'high', category:'missing_dependency', title:'Required dependency is unavailable', cause:`Dependency ${dep} is not installed or cannot be resolved.`, impact:'Build/typecheck/runtime may fail before the affected feature can start.', solution:`Install and lock ${dep}, then rerun typecheck/build and runtime tests. Do not claim PASS while dependency resolution is blocked.`, evidence:[{file:'package.json',reason:`Dependency resolution reported missing: ${dep}`}], confidence:1,status:'blocked' });
  for (const error of input.runtimeErrors ?? []) findings.push({ id:`runtime:${error.file ?? 'unknown'}:${error.line ?? 0}:${error.message}`, severity:'critical', category:'runtime_risk', title:'Runtime error reported', cause:error.message, impact:'The reported execution path failed at runtime.', solution:'Inspect the referenced file/line, reproduce the failure, fix the root cause, and add a regression test. Do not suppress the error.', evidence:[{file:error.file ?? 'runtime',line:error.line,code:error.stack,reason:'Runtime error telemetry.'}], confidence:1,status:'confirmed' });
  for (const p of input.performance ?? []) if (p.valueMs > p.thresholdMs) findings.push({ id:`perf:${p.file ?? 'runtime'}:${p.metric}`, severity:p.valueMs > p.thresholdMs * 2 ? 'high' : 'medium', category:'performance', title:`${p.metric} exceeded performance budget`, cause:`Measured ${p.valueMs}ms against a ${p.thresholdMs}ms budget.`, impact:'The workflow is slower than the defined performance target.', solution:'Profile the measured path, identify the slow operation, then optimize or move work off the critical UI/request path while preserving correctness.', evidence:[{file:p.file ?? 'runtime',reason:'Measured performance telemetry.'}], confidence:1,status:'confirmed' });

  return findings.sort((a,b)=>severityRank[b.severity]-severityRank[a.severity] || a.id.localeCompare(b.id));
}

export function summarizeDiagnostics(findings: DiagnosticFinding[]) {
  const counts = findings.reduce<Record<DiagnosticSeverity,number>>((acc,f)=>{ acc[f.severity]++; return acc; }, {critical:0,high:0,medium:0,low:0,info:0});
  return { total: findings.length, counts, releaseBlocked: findings.some(f=>f.status === 'confirmed' && (f.severity === 'critical' || f.severity === 'high')) };
}
