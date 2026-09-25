# TRACE Consultant Acquisition V4.6 — Audit + Production Fix

- Fixed the real Netlify function naming mismatch that could cause production 404s.
- Added authenticated server-side guards to Acquisition endpoints.
- Hardened embedded UI chrome suppression.
- Kept OSM-first discovery and optional Google enrichment.
- Preserved TRACE Consultant storage bridge and legacy lead migration.
- Documented the exact Netlify environment variables required.

Honest test status: static release checks 13/13 passed; legacy integration 29/29 passed; JS/Python syntax checks passed; full jsdom browser runtime was **not verified** because dependency installation timed out.
