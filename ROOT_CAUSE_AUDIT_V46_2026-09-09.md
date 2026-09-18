# TRACE v46 — Root Cause Audit & Hardening

## 1. Persistence anti-overwrite guard
**Observed problem:** v44 correctly intended fail-closed behavior, but the safety design only described the symptom (cancel the write) rather than removing the transient failure cause.

**Concrete cause addressed:** the verification read had no bounded request cancellation/retry policy. A transient Supabase/network failure could make the guard unable to prove current cloud state.

**Fix:** bounded 3-attempt verification, 5s per-attempt cancellation, short backoff, malformed-cloud-value rejection, explicit telemetry, and a hard write gate. A write is allowed only after a successful verification result.

**Prevention:** no future persistence change may treat an unverified read as a successful safety check.

## 2. Social Acquisition slowness
**Observed problem:** website/social enrichment could process sources sequentially. A lead with multiple public sources could therefore wait on each network operation in series.

**Concrete cause addressed:** there was no bounded global deadline/concurrency model in the social intelligence path. The timeout was missing as a safety boundary, but timeout alone would only hide the deeper orchestration problem.

**Fix:** bounded concurrency (max 2), URL deduplication, per-request timeout, shared global deadline/AbortController, bounded redirects, and evidence-derived scoring.

**Intelligence correction:** hard-coded positive scores that were not tied to observed evidence were replaced by scores derived from reachable sources and observed signals. Missing evidence reduces coverage instead of becoming an invented positive.

**Prevention:** every external source must be bounded individually and at workflow level; scoring must reference concrete evidence.

## 3. Root dependency reproducibility
**Observed problem:** root dependencies were floating at `latest`, and no complete root lock graph existed.

**Concrete cause:** deployment could resolve different package versions at different times, producing non-deterministic builds and hidden breaking changes.

**Fix:** all root dependency declarations are now exact versions; root package-lock is present; release gate explicitly rejects a lockfile scaffold without resolved `node_modules/*` entries. A GitHub workflow is included to resolve and commit the complete lockfile in a network-enabled repository environment using Node 22.22.2.

**Important truth:** this environment cannot resolve the transitive npm graph because registry DNS/network access is unavailable. Therefore the lockfile is intentionally not falsely marked complete here.

## 4. Node runtime
**Observed problem:** project metadata required Node 22.22.2 but the current audit environment was Node 22.16.0.

**Concrete cause:** `.nvmrc` alone does not change an already-running shell/runtime.

**Fix:** Node 22.22.2 is declared in `.nvmrc`, `.node-version`, Volta metadata, Netlify build/preview/branch environments, GitHub Actions setup-node, and release verification.

**Prevention:** deployment environments select the pinned runtime automatically; local tool managers can auto-switch; release verification fails before build when the runtime is below the supported floor.
