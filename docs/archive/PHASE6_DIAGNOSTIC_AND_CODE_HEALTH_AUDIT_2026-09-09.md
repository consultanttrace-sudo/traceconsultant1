# TRACE Phase 6 — Diagnostic Center + Code Health Audit
Date: 2026-09-09

## P0/P1 issues found and fixed in this pass

### P0 — React build entry was structurally wrong
**Finding:** Vite used `root: react-app` while the HTML imported `/src/app/main.tsx`, which lives outside `react-app`.
**Impact:** React production build would fail to resolve the application source even after dependencies were installed.
**Fix:** Vite now uses `react-app/index.html` as Rollup input from the project root.
**Verification:** configuration/static contract PASS. Full Vite build remains BLOCKED because dependencies are not installed in this environment.

### P0 — Data Intake adapters were missing from v30 package
**Finding:** `src/core/fileIntakeAdapters.ts` was absent even though the UI/package documentation claimed PDF/Excel/Word/OCR support.
**Impact:** XLSX/PDF/DOCX/OCR could not actually be imported by the React Data Intake screen.
**Fix:** restored the adapters and wired the React screen to XLSX/XLS/ODS, DOCX, PDF text layer, TXT/JSON, and image OCR adapters. Added `mammoth` and `tesseract.js` dependencies.
**Verification:** source/package/static contracts PASS. Browser runtime is BLOCKED until npm dependencies are installed.

### P0 — Overpass had no hard global deadline
**Finding:** provider timeout existed, but the request launched all providers and had no hard job deadline.
**Impact:** slow provider groups could hold a discovery request too long and create unnecessary fan-out.
**Fix:** bounded provider concurrency (default 3), shared AbortSignal, hard global deadline (default 12s), and explicit `global_timeout` response diagnostics.

### P0 — Google Places could run too many jobs without a global deadline
**Finding:** up to 200 searches with per-request timeout could exceed a serverless execution budget.
**Impact:** long discovery runs could be killed before a useful partial result was returned.
**Fix:** bounded max jobs (80 default), request concurrency, shared cancellation, hard global deadline (20s default), and partial-result diagnostics.

### P1 — Acquisition durable job/checkpoint tables existed but frontend bridge did not use them
**Finding:** migration 002 created `trace_jobs`/`trace_job_checkpoints`, but Acquisition checkpoint persistence was still primarily `trace_kv`/localStorage compatibility.
**Impact:** the claimed durable recovery architecture was not fully connected.
**Fix:** Acquisition bridge now creates/updates durable discovery jobs and appends relational checkpoints when Supabase is available. Local compatibility persistence remains as fallback.
**Remaining:** actual production migration + RLS + crash/recovery integration must still be executed against the real Supabase project.

### P1 — Diagnostic Center was only local/browser telemetry
**Finding:** v30 UI did not call the server-side source scanner and did not persist telemetry.
**Impact:** it could not inspect the repository or retain runtime evidence across sessions.
**Fix:** added authenticated `diagnostic-run` and `diagnostic-telemetry` endpoints plus append-only `trace_diagnostic_events` migration. Full scan now combines repository static evidence with stored runtime/performance/network evidence.

### P1 — Diagnostic snapshot endpoint exposed source contents
**Finding:** the original endpoint returned the entire manifest contents to the browser.
**Impact:** unnecessary source disclosure and oversized response surface.
**Fix:** endpoint now returns only file metadata. Source content remains server-side for diagnostic execution.

### P1 — Browser telemetry listeners accumulated on every scan
**Finding:** each scan installed new `error`/`unhandledrejection` listeners and `disposeBrowserTelemetry()` did not actually remove them.
**Impact:** duplicate events and memory growth during repeated scans.
**Fix:** singleton telemetry collector with retained cleanup, bounded event buffers, and PerformanceObserver support.

### P1 — Data Intake format detection was incomplete
**Finding:** the core detector only recognized PDF/XLSX/XLS/CSV/TSV while the UI advertised DOCX/ODS/TXT/JSON/images.
**Fix:** detector now recognizes all advertised formats.

## What is still NOT proven

1. **React typecheck:** BLOCKED. `vite/client` cannot be resolved because npm dependencies are absent.
2. **React production build:** BLOCKED. `vite` executable is unavailable for the same reason.
3. **Full browser/jsdom regression suite:** BLOCKED until `tests_real` dependencies (`jsdom`) are installed.
4. **Real Supabase migration execution:** NOT VERIFIED in the production project.
5. **RLS adversarial verification:** NOT VERIFIED with leader/member/non-member/anonymous accounts against the real database.
6. **Acquisition crash/reload/resume integration:** core/bridge code exists, but a real deployed crash/recovery test is still required.
7. **Google/Overpass live provider behavior:** code has bounded deadlines, but external provider availability/quotas must be tested in the deployed environment.
8. **Real Cursor integration:** NOT AVAILABLE. The Diagnostic Center does not claim direct Cursor access. An explicit IDE bridge is required.
9. **AI natural-language explanation provider:** current diagnosis is deterministic/evidence-first. A future model layer can summarize evidence, but it must never invent evidence or root cause.
10. **Relational migration of legacy `trace_kv`:** intentionally not complete; strangler migration remains the safe path.
11. **Data Intake draft/review/approve persistence:** parsing and manual completion exist, but production approval/persistence workflow still needs to be connected.

## Validation executed in this environment

- Core TypeScript: PASS
- AI Diagnostic core: PASS
- Diagnostic Center contract: PASS
- Diagnostic live bridge/redaction contract: PASS
- Finance core: PASS
- Finance input validation: PASS
- Business hierarchy core: PASS
- Intelligence core: PASS
- Data Intake core + extended formats: PASS
- Release static assertions: **25/25 PASS**
- Legacy reimplementation suites: PASS (111, 65, 65, 55, 29, 52, 48, 40 assertions respectively)
- Netlify function syntax: PASS for auth, Overpass, Google Places, diagnostic snapshot, diagnostic run, diagnostic telemetry
- React typecheck: BLOCKED (`vite/client` unavailable)
- React production build: BLOCKED (`vite` unavailable)
- jsdom browser suites: BLOCKED because `jsdom` is not installed

## Timeline position

Phase 6 (AI Diagnostic Center / system health foundation) is materially stronger after this pass, but the project is not declared production-ready. The next mandatory work is:

**Phase 6 continuation → real telemetry wiring in modules → Data Intake approval persistence → Supabase/RLS real verification → React dependency install/build → browser regression → Acquisition crash/resume verification → performance hardening.**
