# TRACE Consultant OS — Phase 1 Product Blueprint

**Status:** Implemented as the next upgrade baseline; additive, non-destructive.

## Product North Star
TRACE is an **Internal Consulting Operating System + Business Intelligence** for the consulting team. It connects:

FIND CLIENT → UNDERSTAND → DIAGNOSE → SOLVE → EXECUTE → MEASURE → IMPROVE

## Primary workspaces
1. Executive / Leader Command Center
2. Client & Business Twin — Client → Company → Brand → Outlet
3. Diagnosis — financial, operational, marketing, customer, brand, competitive
4. Action Plan — Problem → Root Cause → Action → Owner → Deadline → KPI → Result
5. KPI & SOP — workflow-driven monitoring and explanation
6. Acquisition — discovery → evidence → scoring → outreach → pipeline
7. Finance / Accounting — transactions → products → ingredients → suppliers → COGS → labor → OPEX → profit
8. Marketing / Customer Intelligence
9. Reporting — client-ready PDF + analytical Excel
10. Governance — audit trail, permissions, approvals, changes

## Intelligence rule
AI is an embedded intelligence layer, not a standalone generator page.

Every material conclusion must expose:
- evidence status
- source/provenance
- calculation when numeric
- comparison period where applicable
- contributors
- confidence and why
- missing data / limitations

### Numeric chain
NUMBER → COMPARISON → CALCULATION → CHANGE → CONTRIBUTORS → EVIDENCE → CONCLUSION

### Evidence states
- Available
- Unavailable
- Manual / Owner-provided
- Needs Review

Missing data limits the scope of a conclusion; it does not automatically block analysis.

## Premium UX principles
- Calm, premium consulting/BI visual language; not gaming and not template-like.
- Strong typography, spacing and hierarchy.
- Fast navigation with command palette / keyboard access.
- Responsive desktop sidebar + mobile bottom navigation.
- Interactive charts with drill-down.
- Clear loading, empty, error and success states.
- Small `?` explanations for intelligence-heavy labels.
- Destructive operations require stronger governance and explicit confirmation.
- Preserve existing data and functionality during migration.

## Architecture rule
Do not replace the current monolith blindly. Use a strangler migration:
1. keep compatibility with `trace_kv`;
2. introduce relational tables for high-risk workflows;
3. migrate one module at a time;
4. keep rollback/parity checks;
5. enforce security and auditability before production cutover.

## Phase 1 acceptance criteria
- Premium shell is additive and does not remove existing views.
- Desktop and mobile navigation remain functional.
- Ctrl/Cmd+K provides a fast navigation path.
- Reduced-motion users are respected.
- No calculation logic is changed by the visual layer.
- Static release checks remain green.
