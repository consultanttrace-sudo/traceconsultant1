# TRACE Phase 8 — Marketing Intelligence

## Scope
Additive Marketing Intelligence layer over the existing Marketing/Event data model. Existing legacy `marketingEvent` remains untouched for compatibility.

## Mandatory behavior
- Track spend, attributed revenue, funnel signals, channel and evidence.
- ROI = (Attributed Revenue − Cost) / Cost × 100 when cost > 0 and attributed revenue is evidenced.
- ROAS = Attributed Revenue / Cost when both are available.
- Missing attribution is represented as incomplete, never zero.
- Compare current vs previous period with explicit deltas and percentage changes.
- Diagnosis distinguishes confirmed mathematical changes from unknown root causes.
- No automatic attribution of total outlet revenue to a campaign.
- Recommendations require drill-down into campaign/channel evidence.

## Truthful validation
- Marketing core test: PASS.
- Full React/Vite build remains BLOCKED until npm dependencies are installed; no build-pass claim is made.
