# TRACE v72 — Execution Report

Date: 2026-09-14

## Actually executed

1. `npm run build:core` — PASS.
2. `npm run test:deterministic` — PASS.
3. Every file matching `tests_core/*.mjs` and `tests_core/*.test.mjs` was executed individually — 47 test files, 0 failures.
4. `node --check` over every `netlify/functions/*.js` — PASS.
5. `npm run test:react-production-wiring` — PASS.
6. `npm run test:internal-scope` — PASS.
7. `npm run verify:dependencies` — PASS; lockfile v3, 258 resolved package entries, no missing resolutions.
8. `npm run diagnostic:manifest` — PASS; 148 text files, 0 static checks.
9. `./release-check.sh` — core/static stages PASS; environment gate correctly returned BLOCKED.

## Environment verification actually attempted

- Node detected: `v22.16.0`.
- Project requirement: `>=22.22.2 <23`.
- `npm ci --offline --ignore-scripts` was attempted and failed because `zlibjs@0.3.1` was not cached.
- A normal `npm ci --ignore-scripts` attempt exceeded the available execution timeout and left no usable dependency tree.
- React typecheck/build therefore cannot be represented as PASS.
- Browser/jsdom runtime tests cannot be represented as PASS because `jsdom` is not installed.

## Final release-check evidence

- Non-legacy JS syntax stage: PASS.
- Core TypeScript + deterministic tests: PASS.
- Diagnostic manifest: PASS.
- Static release assertions: **25/25 PASS**.
- Environment verification: **not satisfied**.
- Browser runtime tests: **skipped by release gate because environment is not satisfied**.

## Not executed / unverified

- Full React/Vite production build in a correctly provisioned Node 22.22.2 environment.
- Real Supabase migration application.
- Real Supabase RLS adversarial two-client verification.
- Real Netlify deployment.
- Production browser E2E against deployed services.

No result in this report is inferred from source inspection when the protocol required actual execution.
