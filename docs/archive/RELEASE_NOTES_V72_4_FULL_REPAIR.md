# TRACE Consultant OS v72.4 — Full Repair

Scope: repair of the issues reported from Settings / Data Intake / Acquisition / Finance.

## Fixed
- Data Intake: client selector, server-side client scope, multi-period metadata, monthly breakdown persistence, canonical batching.
- Data Intake: PDF scanned-document automatic OCR fallback.
- Acquisition: durable job/checkpoint writes now use authenticated Supabase RPCs instead of direct browser table writes.
- Acquisition: global KV read allowlist now includes `trace_os::acquisitionLeads`.
- Finance: explicit client-scoped financial health summary showing Revenue, COGS, Gross Profit, Labor, OPEX, Operating Profit and margins.
- Accounting: trace-data resource allowlist includes AR/AP/fixed assets/period locks returned by the v72.3 client dataset RPC.
- AI Engineer Chat: authentication token retrieval now uses the actual React Supabase client instead of an undefined `window.supabase` bridge.
- AI Chat backend: GET connection-status endpoint and OpenAI-compatible environment-variable support.
- Security Guard: real server-side static security scan against the diagnostic manifest instead of scanning an empty browser-local array.
- AI Diagnostic repair: explicit repair approval button/ledger path added; source mutation remains blocked in Netlify by design.
- Diagnostic manifest is regenerated during React build and included in the function package.

## Important runtime configuration
AI requires server-side configuration in Netlify. Use `TRACE_AI_ENDPOINT` + `TRACE_AI_MODEL`, or `OPENAI_API_KEY` + `OPENAI_MODEL`. Never put provider API keys in React/browser code.

## Verification
- Core TypeScript compilation: PASS.
- All Netlify function JavaScript syntax checks: PASS.
- Data Intake tests: PASS.
- Data Intake P0 hardening tests: PASS.
- Diagnostic repair tests: PASS.
- Diagnostic Center tests: PASS.
- Acquisition phase tests: PASS.
- v72 scope/global-KV tests: PASS.
- React production wiring/truthfulness static tests: PASS.
- New v72.4 full repair static contract: PASS.
- Full React dependency installation/build could not be executed in this environment because `npm ci` timed out twice; this is an environment/network limitation, not a reported source compile failure.
