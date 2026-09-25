# TRACE V58 — Production Evidence & Workflow Hardening

Date: 2026-09-09

## OBSERVE
V57 connected React read-only data to legacy `trace_kv`, but governance and collaboration screens still stopped at a truthful unavailable state. Data Intake approval was UI-only, while the server endpoint accepted status changes without enforcing the intended Draft → Reviewed → Approved sequence.

## PROVE
- `src/app/main.tsx` had no durable call from Review/Approve to the Data Intake ledger.
- `netlify/functions/data-intake-import.js` accepted `approved` directly through the authenticated endpoint.
- `trace_audit_log` and `trace_collaboration_tasks` already had RLS/grants for team reads, but React had no read adapter for those relational tables.

## ROOT CAUSE
The migration was being performed in layers: UI truthfulness preceded production evidence wiring. The missing piece was a bounded, allowlisted read adapter for relational evidence and a server-side state-transition guard for imports.

## FIX
1. Extended `/api/trace-data` with fixed relational resources only:
   - `tasks` → `trace_collaboration_tasks`
   - `audit` → `trace_audit_log`
   - `imports` → `trace_data_intake_imports`
2. Kept authentication and Supabase RLS authoritative; no service-role key is used.
3. Added bounded resource limits and no arbitrary table names.
4. Team view now shows real collaboration task counts/list when available.
5. Governance view now reads real audit events with before/after/reason when available.
6. Data Intake computes SHA-256 source hash in the browser and persists Reviewed/Approved state to the durable import ledger.
7. Added server-side import transition enforcement so `approved` requires a previously `reviewed` record and invalid backward/skip transitions return 409.
8. Corrected the release metadata drift discovered during re-audit: package.json, package-lock root metadata, and TRACE_RELEASE_VERSION.txt now identify v58. The lockfile still lacks resolved dependency entries and therefore remains an environment/release blocker.
9. Corrected Data Intake workflow sequencing: upload/parse now persists a durable `draft` ledger record before the user can mark it `reviewed` or `approved`. This matches the server-side transition guard and prevents a normal first review from being rejected as `none → reviewed`.

## TEST
PASS:
- `npm run build:core`
- `npm run test:deterministic`
- `node tests_core/react-production-wiring.mjs`
- `node tests_real/test_release_static.js` (25/25)
- `node --check` for all Netlify function JavaScript files

BLOCKED / NOT VERIFIED:
- `npm run verify:runtime` — current runner is Node v22.16.0; required >=22.22.2 <23.
- `npm run verify:dependencies` — package-lock has zero resolved package entries.
- React/Vite production build — dependencies are unavailable in the runner.
- Browser/jsdom execution.
- Real Supabase/RLS execution against the production project.
- Real Netlify deployment, smoke test, rollback.

## V58 RE-AUDIT CORRECTION
A concrete workflow defect was found in the previous v58 implementation: the server correctly required `none → draft → reviewed → approved`, but the React upload flow only attempted `reviewed` after parsing. That made the intended first review fail with HTTP 409. The root cause was a mismatch between client workflow sequencing and the server state machine. The fix persists `draft` immediately after a successful parse, then requires explicit Review and Approval actions.

## RE-AUDIT RESULT
The new changes preserve the truthfulness rule: missing relational data remains unavailable rather than becoming zero or demo state. Approval is no longer a client-only visual transition; the server enforces the sequence.

## Remaining major work
1. Complete real dependency/runtime verification.
2. Verify Supabase migration + RLS matrix with leader/member/non-member/anonymous accounts.
3. Complete React behavior/data/evidence parity module-by-module before legacy retirement.
4. Wire Finance → Diagnosis → KPI/Action evidence into the React production path.
5. Add authenticated browser regression and real production smoke/rollback evidence.
