# TRACE Consultant Acquisition V4.5 — Safe Upgrade Notes

## Fixed without touching stable TRACE modules
- Native Acquisition tab navigation now works through `postMessage`, including when the parent and iframe are opened locally with `file://`.
- Added `OPEN_TRACE_CONSULTANT.command` to run the complete TRACE project locally while reusing the existing Acquisition discovery API handler.
- `file://` discovery now stops immediately with a clear instruction instead of generating misleading batch failures.
- Discovery environment indicator distinguishes `file://`, local server, and online deployment.
- Cross-source deduplication strengthened using external ID, phone, Instagram handle, website hostname, and name + geographic proximity.
- Lead filters expanded to support the broader Jabodetabek + Bandung coverage (existing data model unchanged).

## Important
- No existing TRACE accounting, client, KPI, OPEX, profitability, inventory, purchasing, or Supabase data logic was intentionally rewritten.
- Discovery still requires a server endpoint for live OpenStreetMap/Overpass access. Use the included local launcher for a local test, or deploy to Netlify for production.
- Google Places remains optional; when configured it enriches rating, review count, phone, website, hours, and Maps URL.
