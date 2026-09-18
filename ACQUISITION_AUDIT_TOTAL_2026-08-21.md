# TRACE Consultant + Acquisition — Total Audit Status

## Fixed in V4.6 audited production build
- Test harness accepts multiple inline scripts and selects the actual large production app block.
- Static JS syntax check now tests the real application block, not the empty external CDN script.
- Legacy Acquisition schema has RLS and authenticated-only grants.
- Server-side Supabase auth requires Netlify environment variables; no hardcoded server fallback credentials.
- SSRF helper resolves DNS and rejects loopback/private/link-local IPv4 and IPv6 targets in addition to hostname checks.
- Python bytecode caches are excluded from the release package.

## Explicitly NOT claimed as passed
- Full jsdom runtime tests require installing tests_real dependencies. `npm ci` timed out in the audit environment, so auth/OPEX/reliability runtime tests are NOT marked passed here.
- Live Netlify/Supabase/OSM/Google integration cannot be certified from static/local inspection; it requires a deployed smoke test.

## Required live smoke test
1. Deploy to the existing TRACE Consultant Netlify site.
2. Log in.
3. Open Growth & Acquisition > Acquisition.
4. Run Find Leads for Bogor Kota / Semua F&B.
5. Confirm real leads are returned and persisted.
6. Test All Leads, Pipeline, Follow-up, Insights.
7. Test social enrichment only after Discovery succeeds.
