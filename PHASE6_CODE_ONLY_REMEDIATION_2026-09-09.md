# TRACE Phase 6 — Code-only remediation (2026-09-09)

## User requirement
- Fix remaining code-level weaknesses before moving to Supabase verification.
- AI Diagnostic must be silent during normal application use.
- Long error notifications must not interrupt the user; details are available only inside Settings → AI Diagnostic Center.
- Do not claim external/Supabase verification until it is actually executed.

## Changes in this pass
1. Diagnostic UI error state is compact; full diagnostic failure detail is behind a `<details>` disclosure.
2. Diagnostic findings are collapsed by default; users open a finding in Settings to inspect cause, impact, solution and evidence.
3. Static TODO/FIXME/localStorage patterns are `suspected`, not automatically `confirmed`.
4. Diagnostic server reads telemetry and job data with `Promise.allSettled` so one unavailable source does not abort the whole scan.
5. Telemetry/job source timeouts are reported as partial evidence rather than turning the entire diagnostic into a false failure.
6. Build-time diagnostic manifest now records JS syntax failures and unresolved local imports.
7. Local import resolution understands TypeScript ESM `.js` specifiers mapping to `.ts/.tsx` source files.
8. Static syntax findings remain `confirmed` only when `node --check` actually fails.
9. Static local-import findings remain `suspected` because duplicate/archival files can be intentionally outside the production path.
10. Browser telemetry remains passive: collection does not create a toast/alert; diagnostic review is initiated from Settings.

## Verification
- Core TypeScript: PASS
- Diagnostic core: PASS
- Diagnostic Center contract: PASS
- Diagnostic redaction: PASS
- Diagnostic hardening: PASS
- Silent-notification contract: PASS
- Diagnostic manifest generation: PASS (151 text files scanned)
- Netlify diagnostic functions syntax: PASS
- Production static assertions: 25/25 PASS

## Still intentionally blocked / not claimed fixed
- React production dependency installation/build: environment package installation timed out; no false PASS.
- Browser/jsdom integration suite: dependency unavailable.
- Real Supabase migration/RLS verification: intentionally deferred to the next infrastructure phase.
- Real Acquisition crash/reload/resume test against Supabase: intentionally deferred to infrastructure verification.
- Cursor direct integration: unavailable until a real IDE bridge is connected.
- Full relational migration away from `trace_kv`: intentionally deferred by strangler-migration plan.

## Safety rule
The diagnostic engine is read-only. It reports evidence and recommended remediation; it does not mutate source code, production data, Supabase policies, or deployment configuration.
