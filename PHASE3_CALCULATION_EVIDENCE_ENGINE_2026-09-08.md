# TRACE Phase 3 — Calculation & Evidence Engine

Status: foundation implemented incrementally; non-destructive.

## Canonical contract
NUMBER → COMPARISON → CALCULATION → CHANGE → CONTRIBUTORS → EVIDENCE → CONCLUSION

## Implemented foundation
- TypeScript calculation contract for current vs previous period.
- Explicit insufficient-data and zero-baseline states.
- Formula text retained with each calculation result.
- Evidence contract shared with intelligence layer.
- Available / Unavailable / Manual evidence states.
- Evidence completeness and missing-evidence list.
- Explainable weighted score contributions.
- Confidence reason tied to evidence completeness and observable dimensions.
- No numeric business facts are fabricated by the engine.

## Architecture direction
The existing monolithic frontend remains operational while the typed core is introduced as the canonical business-logic layer. Future React screens will consume these contracts instead of duplicating formulas inside components.

## Required React stack for UI migration
React + TypeScript + Vite; Tailwind CSS; shadcn/ui + Radix UI; Lucide Icons; Recharts; Motion/Framer Motion; Three.js/React Three Fiber only where justified; Supabase Auth/Database/RLS.

## Premium layout rule
Every migrated module must use the same premium design system: consistent spacing, typography, surfaces, navigation, responsive behavior, tables, charts, states, dialogs, tooltips, command palette, and micro-interactions. Premium treatment applies to the entire application, not only the dashboard.

## Next
Apply the calculation/evidence contract to Finance first, then Marketing and Diagnosis, with drill-down provenance and Calculation Notes. Preserve the strangler migration and rollback path.
