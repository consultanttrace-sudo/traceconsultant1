# TRACE FINAL BUSINESS DEVELOPMENT AUDIT & FIXES

## What was fixed
- Google Places now executes explicit coverage-center × query jobs instead of silently ignoring frontend query arrays.
- Kabupaten Bogor now uses an explicit Bogor Regency center list; it no longer means “all Jabodetabek except Kota Bogor”.
- Google returns coverage diagnostics: planned, successful, failed jobs and unique places.
- Hybrid discovery isolates providers: OSM failure does not prevent Google results and vice versa.
- Overpass POST uses application/x-www-form-urlencoded with `data=<query>` and JSON accept header to avoid the previous text/plain 406 pattern.
- Consulting-fit classification is added: major chains are excluded as leads but records can still remain useful as market intelligence.
- Production frontend endpoints use `/api/...` redirects consistently.

## Important limits
- Google Places has provider/API result and billing limits; this improves coverage but cannot guarantee every business in a region.
- Instagram enrichment remains website-link enrichment, not a full Instagram/TikTok/Facebook scraper.
- Before production deployment, verify Netlify environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, GOOGLE_MAPS_API_KEY, and optional ACQ_ALLOWED_ORIGINS.
