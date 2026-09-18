# TRACE Consultant OS — Total Audit Final

## Scope audited
- Production entry point and Netlify publish/functions paths
- Acquisition iframe wiring
- Jabodetabek + Bandung explicit coverage keys
- Google Places request contract and coverage matrix
- Overpass request format and provider fallback
- Hybrid provider isolation
- Deduplication and consulting-fit classification
- Syntax of all production Netlify functions

## Critical fixes applied
1. Root `index.html` is the production entry and embeds `features/acquisition_os/index.html`.
2. Explicit area keys are supported end-to-end for Jakarta, Bogor city/regency, Depok, Bekasi city/regency, Tangerang city/regency, South Tangerang, Bandung city/regency, Bandung Barat and Cimahi.
3. Google backend now validates/filter centers for explicit area keys, instead of relying only on legacy Bogor keys.
4. Default Google job ceiling increased to 500 so the default Jabodetabek + Bandung coverage matrix is not silently cut at 120 jobs. Environment variable `GOOGLE_MAX_SEARCHES` can still intentionally lower this.
5. Diagnostics now report whether jobs were truncated.
6. Overpass uses form-encoded `data=<query>` requests and provider fallback.
7. Hybrid uses `Promise.allSettled`, so one provider failing does not cancel the other.

## Deployment requirements
Set these in Netlify before production acquisition testing:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- GOOGLE_MAPS_API_KEY (for Google Places)

Recommended optional controls:
- GOOGLE_MAX_SEARCHES=500
- GOOGLE_CONCURRENCY=4
- GOOGLE_TIMEOUT_MS=7000
- OVERPASS_PROVIDER_TIMEOUT_MS=9000

## Important limitation
“Coverage complete” means every configured coverage job is attempted. Google Places itself can still return a bounded number of results per query/cell. The diagnostics should be checked after a run before claiming a geographic area is fully represented.
