# TRACE v43 — Root Cause Audit / Concrete Evidence / Prevention

## Mandatory working rule
For every defect or blocked verification: identify **why it happened**, collect concrete evidence, define the prevention/control, implement the fix where possible, test it, then re-audit. A hypothesis alone is not accepted as root cause.

## Concrete defects found in v42

### A. Intelligence missing values could become zero
**Evidence:** `src/core/intelligence.ts` used `clamp()` on every dimension and `clamp()` mapped non-finite values to `0`. The dimension type also required `number`.
**Why it happened:** the scoring contract was designed around a total numeric vector and did not represent unavailable dimensions explicitly.
**Impact:** an unavailable signal could mathematically participate as zero, which violates TRACE's `missing != zero` rule.
**Fix:** `ScoreDimension.value` now accepts `number | null`; unavailable dimensions have `contribution: null`; available weights are renormalized.
**Prevention:** regression test explicitly asserts a missing dimension does not contribute and does not depress the score.

### B. Marketing invalid cost still contaminated the visible spend denominator
**Evidence:** negative/invalid cost rows were excluded from the sum, effectively replacing invalid values with zero for the summary.
**Why it happened:** the previous hardening tried to avoid arithmetic corruption but still represented the partial denominator as ordinary `spend`.
**Impact:** a user could read spend as a complete total even though one or more cost rows were invalid.
**Fix:** retain valid spend for operational visibility, expose `invalidCostCount`, force ROI/ROAS to `null` when any cost is invalid, and disclose the limitation.
**Prevention:** regression assertions for invalid count and null ROI/ROAS.

### C. Workbook sheets could be summed without proving they represented the same context
**Evidence:** `parseWorkbook()` previously merged numeric fields across sheets whenever a second sheet existed.
**Why it happened:** multi-sheet support assumed sheets were additive, but there was no identity key check.
**Impact:** unrelated periods/outlets/businesses could be silently combined.
**Fix:** merge only when business + outlet + period identity matches. Otherwise stop automatic merge and emit an explicit review warning.
**Prevention:** adapter contract now documents the identity boundary; future UI must allow sheet-level selection rather than guessing.

## Blocked verification root causes

### React/Vite build
**Concrete evidence:** Node `v22.16.0`; root project has no `node_modules`; root project has no lockfile; npm cache contains no React packages.
**Why blocked:** the build requires dependency installation, but the execution environment cannot retrieve/cache the required packages. Without installed dependencies, `vite`, React runtime packages, Radix, Recharts, XLSX, PDF.js, Mammoth and Tesseract cannot be truthfully executed.
**Correct solution:** use a reproducible lockfile generated in a network-enabled environment, pin tested versions, run `npm ci`, then `npm run typecheck:react` and `npm run build:react`. Do not fabricate a PASS locally.

### jsdom browser integration
**Concrete evidence:** the dedicated harness lockfile exists, but an offline `npm ci` failed with `ENOTCACHED` for `xmlchars`; the current Node `v22.16.0` also does not satisfy the locked jsdom/undici engine requirements shown by npm.
**Why blocked:** required transitive package artifacts are not cached, and the runtime Node version is below the locked engine floor.
**Correct solution:** run the harness under a Node version satisfying its lockfile, restore dependencies with network access, then execute browser tests. This is an environment reproducibility problem, not a reason to weaken tests.

### Real Supabase/RLS
**Concrete evidence:** migrations exist locally, but no live project credentials/session identities were available in this execution environment.
**Why blocked:** RLS behavior depends on actual JWT claims, Auth UUIDs, grants, policies and database state. Static SQL inspection cannot prove client isolation.
**Correct solution:** execute a dedicated matrix against a disposable/staging Supabase project using member, leader, non-member and anonymous sessions; record actual allow/deny results.

### Real Netlify deploy/health/rollback
**Concrete evidence:** deployment implementation requires server-side build-hook configuration and production environment variables; no live trigger/health result was executed here.
**Why blocked:** triggering a build is not equivalent to observing the resulting deployment and verifying application health.
**Correct solution:** add status polling + post-deploy smoke tests + rollback gate tied to the deployed version/commit, then execute against staging before production.

## Design principle locked for future phases
`OBSERVE → PROVE → EXPLAIN → FIX → TEST → RE-AUDIT`.
No future phase may turn an unavailable value into zero, infer root cause from a static pattern alone, merge unrelated contexts without an identity key, or call a deployment/test successful without actual execution evidence.

## Additional architecture/design findings

### React UI stack is declared but not yet actually integrated
**Concrete evidence:** `package.json` declares Radix, Recharts, Motion, Three.js and Tailwind, but `src/app/main.tsx` currently imports only React/Lucide and the token stylesheet; there are no Radix/Recharts/Motion/Three imports in the React application source.
**Why it happened:** React was introduced as an additive strangler foundation while the legacy `index.html` remained production. The foundation prioritized routing/module scaffolding before replacing every visual primitive.
**Correct solution:** do not call the React shell the final premium implementation. Introduce a shared UI layer (Button/Input/Dialog/Popover/Table/Card), then migrate modules through a parity gate: behavior → data/evidence → responsive states → accessibility → premium visual QA → regression.
**Prevention:** add a module migration checklist and reject legacy retirement until all required UI states are implemented and tested.

### Floating `latest` dependency versions reduce reproducibility
**Concrete evidence:** root `package.json` uses `latest` for all runtime/dev dependencies and contains no `package-lock.json`.
**Why it happened:** dependencies were added as a migration scaffold without freezing the release graph.
**Impact:** two installs can resolve different dependency trees; a future React/Vite build can change without source changes.
**Correct solution:** in a network-enabled controlled environment, resolve and test exact versions, commit the generated lockfile, and use `npm ci` in CI/release. The current environment cannot truthfully generate that lockfile because required package tarballs are not cached.
**Prevention:** release-check blocks when the lockfile is absent and never performs an implicit network install.
