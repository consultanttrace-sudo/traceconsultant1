# TRACE Acquisition — Netlify deployment

Deploy the complete folder containing `index.html`, `netlify.toml`, and `netlify/functions/`. Do not deploy only HTML.

## Required Netlify Environment Variables
- `SUPABASE_URL` — TRACE Supabase project URL.
- `SUPABASE_ANON_KEY` — same public anon key used by TRACE Consultant.

## Optional
- `GOOGLE_MAPS_API_KEY` — Google Places enrichment.
- `GOOGLE_MAX_SEARCHES` — Google coverage cap (default 50).

Acquisition serverless functions verify the logged-in TRACE Supabase session.

Production endpoints:
- `/.netlify/functions/acq-overpass`
- `/.netlify/functions/acq-social-intel`
- `/.netlify/functions/acq-social-enrich`
- `/.netlify/functions/acq-google-places` (optional)

OpenStreetMap/Overpass does not need a Google key. Instagram is not bypassed or scraped behind login.
