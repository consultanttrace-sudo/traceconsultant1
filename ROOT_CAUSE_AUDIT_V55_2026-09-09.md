# TRACE V55 — Root Cause Re-audit

Date: 2026-09-09

## Concrete finding
The legacy reliability regression `tests_real/test_reliability.js` contained an assertion that expected `saveData()` to return `true` when cloud persistence failed but localStorage recovery succeeded.

That expectation contradicted the production code contract introduced during persistence hardening: a local recovery copy is explicitly **not** an authoritative team/cloud commit, so `saveData()` returns `false` to prevent callers from advancing workflows as if the database accepted the write.

## Evidence
Production `index.html` `saveDataUnlocked()`:
- cloud write failure enters recovery path;
- localStorage receives a recovery copy;
- the function explicitly returns `false` after the recovery copy is created.

The regression test itself contained the contradictory expectation `ok === true`.

## Correct solution
The test was corrected to assert `ok === false`, while retaining checks that:
- the local recovery copy exists;
- the user receives the explicit unsynced warning.

The duplicated Acquisition harness copy was corrected as well so the two harnesses cannot drift on this contract.

## OPEX
No production OPEX code was changed without executable evidence. Static release assertions pass and the OPEX implementation was inspected directly. Full jsdom execution remains blocked by the environment because the required jsdom dependency cannot be restored offline and npm online installation exits abnormally; Node is also below the pinned jsdom engine requirement.

Therefore OPEX runtime status remains **BLOCKED / NOT VERIFIED**, not PASS and not an invented failure.

## Verification executed
- `node tests_real/test_release_static.js` → PASS (25/25)
- `npm run typecheck:core` → PASS
- `npm run build:core` → PASS
- `npm ci --offline --ignore-scripts` for browser harness → BLOCKED (`ENOTCACHED: xmlchars`)
- `npm ci --ignore-scripts` browser harness → BLOCKED (npm `Exit handler never called!`)

## Remaining blockers
1. Browser/jsdom runtime tests require a compatible Node/dependency environment.
2. Real Supabase/RLS execution remains unverified.
3. React/Vite production build remains unverified until root dependencies are restored.
4. Legacy-to-React production parity remains an integration task.

## Principle
OBSERVE → PROVE → EXPLAIN → FIX → TEST → RE-AUDIT
