# TRACE AI Diagnostic Center — Phase 6 — 2026-09-09

## Objective
Move AI diagnosis into **Settings → AI Diagnostic Center** as TRACE's internal, evidence-first system doctor.

## Implemented
- Settings navigation replaces the standalone System Health navigation item.
- AI Diagnostic Center UI with full-scan control, source health matrix, findings, telemetry snapshot, and read-only safety mode.
- Diagnostic source model for:
  - source code
  - dependencies
  - Supabase/RLS
  - network/API
  - runtime errors
  - performance
  - data integrity
  - jobs/persistence
  - tests/build
  - Cursor/IDE bridge
- Browser runtime and slow-resource telemetry collector.
- Server-side `diagnostic-snapshot` endpoint protected by authenticated session + leader check.
- Build-time diagnostic manifest scans repository text/code files while excluding `.git`, `node_modules`, build output, and environment-secret files.
- Manifest is read-only and returned only to an authenticated TRACE leader through the server endpoint.
- Cursor/IDE is explicitly reported as unavailable unless a future IDE bridge supplies evidence; no fake access is claimed.
- Existing AI diagnostic core remains the finding engine and is not given write authority.

## Safety boundary
The Diagnostic Center can inspect evidence but cannot automatically modify source code, production data, Supabase schema, or settings. Any future remediation workflow must be a separate approved/audited operation.

## Evidence rules
- Static code patterns are `suspected` unless confirmed by runtime evidence/tests.
- Missing/unavailable sources are not treated as healthy.
- Exact file/line is shown only when evidence provides it.
- No invented logs, code, root causes, test results, or data.

## Deployment note
Netlify runs `node scripts/build-diagnostic-manifest.mjs` before publishing/functions. The manifest contains text/code files only and intentionally excludes environment-secret files and binary assets.

## Validation
- Core TypeScript: PASS
- Diagnostic Center contract: PASS
- AI diagnostic core: PASS
- Finance core: PASS
- Data Intake core: PASS
- Business hierarchy core: PASS
- Intelligence core: PASS
- Release static assertions: PASS (17/17)
- Netlify diagnostic function syntax: PASS
- React typecheck: BLOCKED — `vite/client` type definition is unavailable because npm dependencies are not installed in this environment.
- React production build: NOT RUN / BLOCKED for the same dependency condition.
