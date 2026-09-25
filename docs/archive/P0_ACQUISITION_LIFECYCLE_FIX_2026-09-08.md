# TRACE Acquisition P0 Fix — 2026-09-08

## Root causes confirmed
1. Discovery Stop only flipped an in-memory flag; active `fetch()` calls were not cancelled.
2. Overpass fallback could continue trying providers after Stop/Abort.
3. OSM batch error handling could fall back to stale cache even after an intentional Stop.
4. `runAIAnalysis(..., {skipPersist:true})` still triggered `runAutomaticSocialIntelligence()`, which persisted the entire `LEADS` array per lead. This defeated the batch-save fix and could create thousands of full-array writes.
5. `saveData()` could wait indefinitely for a renewed login session, making Discovery appear to loop forever when auth expired.
6. Cloud writes had no explicit client-side timeout, so a stalled network request could hold the Discovery pipeline indefinitely.
7. `persistLeads()` ignored a false save result, so callers could believe a checkpoint succeeded when it did not.
8. Frontend Google `kabupaten` coverage incorrectly included unrelated Jabodetabek centers instead of the explicit Kabupaten Bogor coverage set.

## Changes implemented
- Added an AbortController for each Discovery job.
- Stop now sets STOPPING state and aborts the active request.
- Propagated AbortSignal through Acquisition fetches, Overpass, Google proxy, and social enrichment.
- Intentional AbortError is no longer treated as a provider failure eligible for fallback.
- Added explicit Discovery checkpoint metadata in localStorage.
- Added checkpoint persistence after raw lead insertion, scoring, and stop/failure paths.
- `persistLeads()` now fails loudly when the storage bridge reports failure.
- Removed per-lead persistence from automatic social intelligence during batch analysis.
- `saveData()` no longer waits forever for login renewal; it returns failure and lets the UI recover instead.
- Added a 15-second cloud-write timeout guard.
- Corrected Kabupaten Bogor Google coverage centers.

## Safety behavior
- Stop never deletes existing leads.
- A failed Discovery does not clear the existing lead set.
- A stopped Discovery preserves the last successful checkpoint.
- If a cloud save fails, the existing backup/fallback logic remains available.

## Validation actually run
- Node syntax checks for all Acquisition Netlify JS functions: PASS.
- `tests_real/test_release_static.js`: PASS — 13/13 assertions.
- Full runtime test suite: BLOCKED because `tests_real` dependencies (`jsdom`) are not installed in the working environment. A prior `release-check.sh` attempt also timed out during dependency installation; therefore no claim is made that the full suite passes.
