# TRACE v47 — Root Cause Audit, Concurrency & Release Hardening

## Governing rule
Every defect follows: **OBSERVE → PROVE → EXPLAIN → FIX → TEST → RE-AUDIT**.
A mitigation is not accepted as the root-cause solution when the failure mechanism remains.

## A. Persistence write reliability
**Observed:** legacy `saveData()` could have multiple callers operating on the same key concurrently. Even with a read guard, two callers could read the same old state and later overwrite each other.

**Concrete cause:** no per-key serialization around the complete verify → write sequence at the browser layer.

**Fix:** `saveData()` now serializes operations per key through an in-memory promise queue. Cloud writes use three bounded attempts with a real AbortController and 15s per-attempt timeout. Recovery files/localStorage are explicitly non-authoritative and return `false` to callers.

**Prevention:** future high-risk persistence paths must either serialize by key or use an atomic server-side compare-and-set/transaction when multiple clients can mutate the same record.

**Remaining production architecture requirement:** multi-device concurrency cannot be proven safe by a browser mutex alone. A future relational persistence path must use server-side optimistic concurrency or transactional mutation for shared records.

## B. Social enrichment latency and intelligence
**Observed:** social enrichment processed up to 40 websites sequentially.

**Concrete cause:** one slow/redirect-heavy website could block the entire batch; there was no bounded worker pool or global deadline.

**Fix:** bounded concurrency, per-request timeout, shared global cancellation, redirect revalidation, HTML-only parsing, response-size bound, deterministic result slots, and explicit timeout/deadline diagnostics.

**Intelligence correction:** the enrichment endpoint only reports an Instagram handle when concrete HTML evidence contains it. Missing/blocked/unreadable evidence is not converted into a positive score.

**Prevention:** every external-source workflow must have source-level and workflow-level budgets and must preserve evidence provenance.

## C. Root dependency reproducibility
**Observed:** root `package.json` previously used floating `latest` dependencies and the root lockfile had only the root package entry.

**Concrete cause:** package resolution was not reproducible and could not be proven offline.

**Fix:** all root dependency declarations are exact semver versions. A lock refresh workflow resolves the complete graph using Node 22.22.2. The release gate rejects a root lockfile that has no resolved `node_modules/*` entries or misses declared dependencies.

**Current audit evidence:** the environment has no npm registry/network access, so the complete transitive lock graph cannot be generated here. This is intentionally **BLOCKED**, not marked PASS.

**Prevention:** CI must run `npm ci` from the committed lockfile; any dependency change must refresh the lock graph and pass the lock-integrity gate before release.

## D. Node runtime reproducibility
**Observed:** audit shell is Node 22.16.0 while TRACE requires 22.22.2.

**Concrete cause:** project metadata cannot mutate an already-running Node process.

**Fix:** `.nvmrc`, `.node-version`, `.tool-versions`, Volta metadata, Netlify environment, GitHub Actions setup-node, and package engines all pin Node 22.22.2 / npm 10.9.2. A bootstrap helper selects the pinned runtime when a supported local manager is available.

**Prevention:** CI and Netlify select the runtime before npm/build starts; release verification fails before build on an unsupported runtime.

## E. Workflow checkpoint concurrency
**Observed:** v46 checkpoint monotonicity checked `MAX(sequence_no)` but concurrent inserts could both observe the same maximum and pass the check.

**Concrete cause:** the check was not serialized per job.

**Fix:** migration 010 replaces the trigger with a transaction-scoped advisory lock per `job_id`, then performs the max-sequence check.

**Prevention:** any ordered append-only workflow must serialize the ordering decision or use a database primitive that guarantees it.

## v47 test truth
PASS: source-level persistence hardening, social enrichment hardening, Netlify function syntax, core deterministic tests where dependencies are available.

BLOCKED: complete root dependency graph, React/Vite installation/build, browser integration, real Supabase RLS, real Netlify deployment/health/rollback.

No blocked item is reported as PASS.
