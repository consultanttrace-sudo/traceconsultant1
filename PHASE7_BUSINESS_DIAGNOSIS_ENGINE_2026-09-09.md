# TRACE Phase 7 — Business Diagnosis Engine
Date: 2026-09-09

## Objective
Turn trusted finance calculations and evidence into an evidence-first business diagnosis without inventing causes or numbers.

## Implemented
- `src/core/diagnosis.ts` adds a typed diagnosis engine.
- Diagnosis consumes the existing `FinanceComparison` rather than duplicating finance formulas.
- Explicit configurable thresholds for revenue decline, COGS ratio, Labor ratio, OPEX ratio, and Operating Margin deterioration.
- Every material finding carries area, severity, status, problem, cause boundary, impact, recommendation, confidence, and calculation evidence.
- Revenue decline uses current vs previous and the existing change formula.
- Cost diagnosis uses percentage-point movement in cost/revenue ratios.
- Profitability diagnosis detects negative operating profit and operating-margin deterioration.
- Missing comparison data creates a blocked/limited diagnosis instead of a fabricated trend.
- Evidence assessment is retained separately from the calculation result.
- The engine explicitly avoids claiming an operational root cause from P&L alone; recommendations point to the required drill-down evidence.

## Canonical diagnosis chain
NUMBER → COMPARISON → CALCULATION → CHANGE → CONTRIBUTORS → EVIDENCE → CONCLUSION

Phase 7 currently covers the first business-diagnosis layer. Contributor drill-down by outlet/product/vendor/channel and action-plan linkage remain subsequent work in the roadmap.

## Validation
- Core TypeScript compilation: run with `npm run build:core` when TypeScript is available.
- Diagnosis runtime test: `tests_core/test_diagnosis.mjs`.
- Full React/Vite build remains blocked until npm dependencies are installed, consistent with prior phases.
- No production Supabase/RLS claim is made here.

## Additional code-health fix found during Phase 7
The audit exposed a correctness issue in the prior Finance core: a missing category could be represented as numeric zero and therefore make Gross Profit/Operating Profit appear calculable. This was unsafe because unavailable data is not zero.

Fixed:
- Missing Revenue/COGS/Labor/OPEX now remain `null` in `FinanceSummary`.
- Gross Profit is calculated only when Revenue and COGS are available.
- Operating Profit is calculated only when all four required categories are available.
- Period comparison returns `insufficient_data` when either side is unavailable.
- The zero-baseline test was corrected to actually contain a previous-period value of zero; a missing previous record is not a zero baseline.

Validation after this fix:
- `npm run build:core`: PASS
- All `tests_core/*.mjs`: PASS
- Production static assertions: 25/25 PASS
- Relevant Netlify function syntax checks: PASS
- React/Vite full build: still BLOCKED by unavailable npm dependencies.
