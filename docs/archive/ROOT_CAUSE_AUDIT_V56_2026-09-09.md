# TRACE V56 — React Truthfulness Hardening

Date: 2026-09-09

## Concrete finding
The React foundation contained demo/fabricated state in production-facing screen components: a synthetic audit diff, empty collaboration data rendered as zero KPIs, a fabricated zero-valued business diagnosis input, and a demo finance record. These values could be mistaken for real business/system state if the React shell becomes active before production data wiring is complete.

## Why it happened
The React screens were built as UI/domain foundations before the Supabase/legacy strangler integration was completed. Demo scaffolding remained inside the actual screen components instead of being isolated as test fixtures.

## Correct solution
Remove fabricated business/system values from the screen components. Where production data is not connected, render an explicit unavailable/blocked state. Finance entry now starts empty rather than with a fake amount/period.

## Prevention
Added `tests_core/react-truthfulness.mjs` to prevent the known demo patterns from returning to `src/app/main.tsx`. Production data must enter through a real integration layer before KPIs, audit events, or diagnosis findings are displayed.

## Verification
- `npm run typecheck:core` → PASS
- `npm run build:core` → PASS
- `node tests_real/test_release_static.js` → PASS (25/25)
- `node tests_core/react-truthfulness.mjs` → PASS

## Remaining blockers
- Browser/jsdom runtime remains environment-blocked.
- Real Supabase/RLS execution remains unverified.
- React/Vite production build remains unverified until dependencies are restored.
- Legacy-to-React production data parity remains the next major integration task.

## Principle
OBSERVE → PROVE → EXPLAIN → FIX → TEST → RE-AUDIT
