# TRACE Acquisition OS — FINAL

Internal sales intelligence OS for TRACE Consultant.

## Final workflow

DISCOVER → ENRICH → ANALYZE → PRIORITIZE → OUTREACH → FOLLOW-UP → PIPELINE → LEARN → CONVERT

### V1 — Discovery
- Automatic F&B discovery for Jabodetabek + Bandung.
- OpenStreetMap/Overpass as free discovery source.
- Google Places as optional enrichment via secure server-side proxy.
- Deduplication and refresh of existing records.
- Source + last_checked + freshness.

### V2 — Intelligence & Outreach
- Lead scoring.
- Business analysis with fact/inference/hypothesis separation.
- Recommended sales angle.
- Personalized first DM.
- Follow-up 1 and 2 drafts.
- Copy/mark-sent actions.
- Sales notes and outreach history.
- Pipeline: New → Analyzed → Contacted → Replied → Meeting → Proposal → Won.

### V3 — Sales Learning & Automation
- Top 10 daily ranking with local learning multiplier from outcomes.
- Follow-up scheduling after Contacted/Proposal.
- Follow-up queue with overdue/today indicators.
- Sales funnel analytics.
- Winning sales-angle signals.
- Recommended category focus.
- Refresh stale data via discovery.
- CSV export and JSON backup/restore.
- Ready-to-convert marker for later integration with TRACE Consultant OS.

## Important data behavior

- No fake production data.
- Missing fields remain Unknown/null.
- AI hypotheses are explicitly labeled.
- The learning engine is a local heuristic, not a claim of autonomous model training.
- Google Places requires your own API key/proxy configuration if you want Google rating/review/website/phone enrichment.

## Running locally on Mac

Use `OPEN_TRACE.command` or `START_TRACE.command`.
Do not open `index.html` directly with `file://` if you want discovery requests to work.

## Netlify

Deploy the folder containing `index.html`, `netlify.toml`, and `netlify/functions/`.
The Google Places proxy is optional and only works when the required environment variable is configured.

## Before integrating with TRACE Consultant OS

Use Settings → Backup & Data → Download Backup JSON.
The final integration can map a Won lead into TRACE Consultant's Client → Company → Brand → Outlet structure without retyping the lead.
