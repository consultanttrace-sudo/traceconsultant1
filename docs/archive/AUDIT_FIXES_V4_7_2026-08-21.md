# Audit fixes — V4.7, 2026-08-21 (second pass)

Applied after an independent audit of the V17 + Acquisition V4.7
"REGRESSION_SAFE" package. Every fix below was verified by actually
re-running the affected test, not just re-reading the code.

## Carried over correctly from the previous (V4.5) audit round
Verified still working in this package: multi-inline-script test harness,
real (non-empty) production script syntax check, `trace_kv` RLS, no
hardcoded Supabase fallback credentials in `_auth.js`, DNS-resolution-based
SSRF check in `_url.js`, `leads`/`lead_analysis`/`outreach` RLS in
`schema.sql`, no `__pycache__`/`node_modules` in the archive.

## 1. `test_auth.js` — 2 of 7 assertions failed (same root cause as V4.5,
not carried forward into this package)
`index.html` declares `storageMode`/`storageReadyPromise` with
`let`/`const` at script top level, which never become properties of
`window`. `win.storageMode === 'cloud'` and `await win.storageReadyPromise`
were reading `undefined`, so those two assertions could never reflect
real app state. Fix: assert against the same DOM text the app shows via
`updateSysStatus()` (`sysLabel.textContent`), same fix applied in the V4.5
round. Verified: `node test_auth.js` → 7/7.

## 2. `acq-social-intel.js` — still fetched `lead.website` with no SSRF
guard at all (flagged in the V4.5 audit, not fixed in V4.6/V4.7)
`_url.js`'s `isPublicHttpUrl()` was already fixed and already used in
`acq-social-enrich.js`, but never wired into `acq-social-intel.js`. Fix:
routed `lead.website` through `isPublicHttpUrl()` before fetching, same
pattern as `acq-social-enrich.js`.

## 3. `features/acquisition_os/netlify/functions/` — divergent, weaker
copy of the production functions (new finding, not previously reported)
This package ships two copies of the Acquisition Netlify functions:
`netlify/functions/` (the integrated, production one) and
`features/acquisition_os/netlify/functions/` (the pre-integration
standalone build, which still carries its own `netlify.toml` and
deploy docs, i.e. it is independently deployable, not dead code). A diff
showed the standalone copy had:
- Wide-open CORS (`access-control-allow-origin: '*'`, no origin
  allowlist), vs. the production copy's origin-restricted `cors()`.
- No `isPublicHttpUrl()` SSRF check in its `acq-social-enrich.js` at all
  (the check itself was fixed in the production copy but never
  back-ported here).
- The same missing SSRF check in `acq-social-intel.js` as #2 above.

Fix: replaced every file in `features/acquisition_os/netlify/functions/`
with the corresponding fixed file from `netlify/functions/` (now
byte-identical, confirmed with `diff -rq`), so both copies share the same
CORS restriction, auth wiring, and SSRF protection. If these ever diverge
again, that's worth catching with a CI check (e.g. `diff -rq` between the
two folders) rather than manual review.

## Verified after fixes (all re-run, not just re-read)
```
node tests_real/test_release_static.js   -> 13/13 static assertions passed
node tests_real/test_reliability.js      -> 12/12 assertions passed
node tests_real/test_opex.js             -> 11/11 assertions passed
node tests_real/test_auth.js             -> 7/7 assertions passed
node --check on every non-legacy .js file in the package -> clean
```

## Not changed / still open
- `tests_reimpl_legacy/` (8 files) still reimplement formulas separately
  instead of exercising real `index.html` code — same caveat as before,
  out of scope for this pass.
- Documentation sprawl: `FINAL_CHECKLIST.md` and `TESTING.md` are stale
  (still describe the pre-V4.6 state and never mention `test_auth.js`),
  while `ACQUISITION_AUDIT_TOTAL_2026-08-21.md`, `REGRESSION_AUDIT_2026-08-21.md`,
  and `ACQUISITION_RELEASE_V4_6.md` overlap and partially supersede them.
  Left as-is since consolidating release docs is an editorial decision,
  not a code fix — but worth designating ONE file as the source of truth
  before the next release so status claims don't drift out of sync again
  (which is exactly how issues #1 and #2 above went unnoticed here).
