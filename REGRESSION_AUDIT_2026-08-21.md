# TRACE Consultant OS V17 + Acquisition V4.7 — Regression Audit

## Verified
- Original TRACE V17 core files were compared against this release.
- `index.html` changes are limited to Acquisition navigation/view/bridge plus the existing release-level hardening already present in V17.
- Acquisition endpoints are consistently namespaced as `acq-*` and match frontend calls.
- Netlify function JavaScript passes `node --check`.
- Static release test: 13/13 PASS.
- Acquisition schema has RLS enabled and authenticated policies.
- Server functions require a Supabase Bearer session and use environment variables only.
- SSRF URL validation performs DNS resolution and rejects private/link-local/loopback targets.
- Legacy Acquisition data migration is merge-only and does not overwrite existing TRACE cloud records.
- `node_modules` and `__pycache__` are excluded from the release archive.

## Not claimed as passed
- Browser/runtime tests requiring jsdom were not executed successfully in this audit environment because the dependency was unavailable locally. They must be run in a normal Node environment after `npm install`/CI.
- Real Netlify + Supabase + OSM discovery smoke test has not been executed from this environment.
- Instagram content-level analysis is not claimed unless an authorized/public data source actually returns that content.

## Regression principle
No unrelated TRACE V17 module was rewritten. Changes outside Acquisition are limited to the required navigation/bridge and release/test hardening.
