# TRACE v63 — Finalization Status

## What changed
- Simplified primary navigation labels without changing existing `data-view` contracts.
- Added a decision-first 5-step workflow on the main dashboard: Klien → Data → Keuangan → Diagnosis → Eksekusi & Ukur.
- Added Accounting/Finance Guided vs Advanced mode. Guided mode reduces visible cognitive load; Advanced mode exposes the complete existing feature set. No accounting/COGS feature was deleted.
- Added a Finance workflow map for COGS/Resep, Pembelian, Stok, Food Cost, Profitability, Target, Marketing ROI, and Executive.
- Added Acquisition workflow shortcuts: Cari → Validasi → Prioritaskan → Tindak lanjut. Existing pages and discovery lifecycle remain intact.
- Restored/package-added atomic Data Intake migration `014_trace_data_intake_atomic_transition.sql` to match the already-present server RPC call.
- Added deterministic UX hardening test.
- Bumped package version to v63.

## Verification
PASS: `npm run build:core`
PASS: `npm run typecheck:core`
PASS: `node tests_core/test_data_intake.mjs`
PASS: `node tests_core/ux-simplification.mjs` (6/6)
PASS: `node tests_core/react-truthfulness.mjs`
PASS: `node tests_core/react-production-wiring.mjs`
PASS: `node tests_real/test_release_static.js` (25/25)

BLOCKED: `npm run typecheck:react` because the current sandbox has no installed `vite/client` type package (`TS2688`). This is an environment/dependency-installation gate, not reported as PASS.

NOT YET VERIFIED: real Supabase/RLS behavior, Netlify production deployment, and browser visual QA. These require the actual project/deployment environment.

## Finalization order
1. Install dependencies from the committed lockfile in CI/local release environment.
2. Run React typecheck/build and browser smoke tests.
3. Apply/verify Supabase migrations 001–014 and independently test RLS with an ordinary authenticated user.
4. Run Netlify preview smoke test for legacy production entry + Acquisition iframe + React build output.
5. Only after those gates pass: production deploy, post-deploy health check, and rollback readiness.
