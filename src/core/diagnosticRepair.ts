import { fetchWithTimeout } from './browserNetwork.js';
import type { DiagnosticFinding } from './aiDiagnostic.js';

export type RepairSafety = 'safe' | 'review_required' | 'blocked';
export type RepairAction = 'patch' | 'dependency' | 'config' | 'test' | 'manual';

export interface RepairStep {
  action: RepairAction;
  title: string;
  detail: string;
  file?: string;
  line?: number;
}

export interface DiagnosticRepairPlan {
  id: string;
  findingId: string;
  title: string;
  safety: RepairSafety;
  canApplyAutomatically: boolean;
  reason: string;
  steps: RepairStep[];
  verification: string[];
}

function base(f: DiagnosticFinding): DiagnosticRepairPlan {
  const first = f.evidence[0];
  return {
    id: `repair:${f.id}`,
    findingId: f.id,
    title: `Repair plan — ${f.title}`,
    safety: 'review_required',
    canApplyAutomatically: false,
    reason: 'Perubahan source code harus diverifikasi terhadap evidence dan tidak boleh diterapkan diam-diam.',
    steps: [{ action: 'manual', title: 'Review evidence', detail: f.solution, file: first?.file, line: first?.line }],
    verification: ['Rerun the relevant test.', 'Run typecheck/build before release.'],
  };
}

export function buildRepairPlan(f: DiagnosticFinding): DiagnosticRepairPlan {
  const plan = base(f);
  const file = f.evidence[0]?.file;
  const line = f.evidence[0]?.line;
  if (f.category === 'performance' && /cancellation|fetch|network/i.test(f.title + f.cause)) {
    plan.safety = 'safe';
    plan.canApplyAutomatically = false;
    plan.reason = 'Pattern is diagnosable, but the exact request boundary must be reviewed before changing control flow.';
    plan.steps = [
      { action: 'patch', title: 'Add bounded request cancellation', detail: 'Introduce AbortController/AbortSignal at the request owner and propagate the signal to the provider call.', file, line },
      { action: 'test', title: 'Add timeout regression', detail: 'Verify a stalled provider aborts within the configured deadline and does not poison the next job.', file, line },
    ];
  } else if (f.category === 'persistence') {
    plan.safety = 'review_required';
    plan.steps = [
      { action: 'patch', title: 'Replace unsafe operational persistence', detail: 'Move the operational write to the durable repository/checkpoint path while keeping compatibility fallback bounded.', file, line },
      { action: 'test', title: 'Verify crash/reload recovery', detail: 'Stop or interrupt the workflow, reload, and confirm the checkpoint can resume without data loss.', file, line },
    ];
  } else if (f.category === 'missing_dependency') {
    plan.safety = 'blocked';
    plan.steps = [{ action: 'dependency', title: 'Restore dependency resolution', detail: f.solution, file: 'package.json' }];
    plan.verification = ['Install dependencies successfully.', 'Run React typecheck.', 'Run production build.'];
  } else if (f.category === 'syntax') {
    plan.safety = 'review_required';
    plan.steps = [{ action: 'patch', title: 'Correct syntax at evidence location', detail: 'Apply the smallest source change that makes the reported syntax check pass. Preserve behavior outside the failing statement.', file, line }, { action: 'test', title: 'Re-run syntax/build checks', detail: 'Run node --check where applicable and then the production build.', file, line }];
  } else if (f.category === 'missing_data' || f.category === 'file_ingestion') {
    plan.safety = 'review_required';
    plan.steps = [{ action: 'manual', title: 'Do not invent missing values', detail: 'Fix the source mapping/parser or request the missing evidence. Never synthesize a business number.', file, line }, { action: 'test', title: 'Re-run intake regression', detail: 'Verify the same source file maps to the expected fields and preserves provenance.', file, line }];
  } else if (f.category === 'runtime_risk') {
    plan.safety = 'review_required';
    plan.steps = [{ action: 'patch', title: 'Fix the reported execution path', detail: f.solution, file, line }, { action: 'test', title: 'Add a regression test', detail: 'Reproduce the failure first, then verify the exact failing path and its adjacent error handling.', file, line }];
  }
  return plan;
}

export function buildRepairPlans(findings: DiagnosticFinding[]): DiagnosticRepairPlan[] {
  return findings.map(buildRepairPlan);
}

export interface RepairApplyRequest {
  findingId: string;
  plan: DiagnosticRepairPlan;
  approved: boolean;
  workspaceId?: string;
}

export async function requestRepairApply(request: RepairApplyRequest, endpoint='/api/diagnostic-repair', token?:string) {
  if (!request.approved) return { applied:false, status:'approval_required' as const };
  if (!request.plan.canApplyAutomatically) return { applied:false, status:'review_required' as const };
  if (typeof fetch === 'undefined' || !token) return { applied:false, status:'bridge_unavailable' as const };
  try {
    const response = await fetchWithTimeout(endpoint, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body:JSON.stringify(request) }, 15000);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { applied:false, status:'failed' as const, reason:payload.error || `http_${response.status}` };
    return { applied:Boolean(payload.applied), status:payload.status || 'unknown', payload };
  } catch (error) {
    return { applied:false, status:'bridge_unavailable' as const, reason:error instanceof Error ? error.message : 'repair_bridge_unavailable' };
  }
}
