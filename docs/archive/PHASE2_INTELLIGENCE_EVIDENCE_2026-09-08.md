# TRACE Phase 2 — Intelligence & Evidence Foundation

Status: implemented incrementally; non-destructive.

## Implemented
- Evidence ledger on Acquisition lead analysis.
- Evidence status: Available / Unavailable.
- Provenance fields: source, source URL, captured timestamp, notes.
- Evidence completeness percentage.
- Confidence score with explicit reason.
- Score breakdown showing dimension value, weight, and contribution.
- "Why This Score?" explanation surface.
- Manual Evidence entry: type, value, period, source, notes.
- Missing evidence is disclosed and limits scope; it does not block analysis.
- Explicit separation between review/rating evidence and profitability claims.
- Existing local heuristic and AI analysis paths preserved.

## Guardrails
- No invented numeric business facts.
- Confidence is not presented as factual certainty.
- Numeric score contributions are traceable to the scoring dimensions.
- Existing lead records remain readable; new evidence fields are additive.
- Existing calculation functions are untouched.

## Next implementation
Apply the same evidence contract to Finance, Marketing, Diagnosis, KPI, Action Plan, Reporting, and Leader Command Center. The shared contract will become the canonical intelligence layer during the relational strangler migration.
