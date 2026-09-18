# TRACE Phase 5 — Finance Code Health Pass 2 (2026-09-08)

## Scope
This pass continues Phase 5 without replacing the legacy application. Focus: real accounting save paths, revenue provenance, transaction source linking, and regression safety.

## Fixes applied

### 1. Historical selling price is now captured for new outlet-sales records
`outletJual` records created from now on store `unitPrice` at the time the sale is entered.

Revenue calculation uses `record.unitPrice` when present, preventing a later product-price edit from silently rewriting historical revenue.

### 2. Explicit limitation for legacy sales records
Older sales records that do not contain `unitPrice` still use the current product price as a fallback. The UI now labels those rows `Harga historis tidak tersimpan` so the limitation is visible instead of being silently presented as exact historical revenue.

### 3. Transaction ledger now reuses the canonical Revenue engine
The SALES source-linking path uses `outletRevenue()` rather than duplicating `qty × current product price` logic.

### 4. Negative OPEX credits are no longer offered as cash-expense source links
A negative OPEX value is an adjustment/reduction, not a cash expense. The transaction source picker now excludes negative OPEX records from the automatic expense-linking path, preventing a credit adjustment from being converted into a positive expense.

### 5. Finance input intelligence is connected to legacy save paths
OPEX and manual transaction saves now run lightweight input/evidence guardrails before persistence:
- invalid period → blocked;
- invalid/negative nominal → blocked;
- manual input without reference/description → review warning;
- no silent mutation of user-entered accounting values.

This remains an input/evidence guardrail, not a business-fact validator. A correctly formatted number can still be wrong in reality.

## Validation

PASS:
- production inline JavaScript syntax
- release static assertions: 17/17
- Finance core assertions
- Business hierarchy core
- Calculation/Evidence/Intelligence core
- Finance input validation contract
- Acquisition function syntax checks

BLOCKED / NOT VALIDATED:
- browser-level `tests_real/test_opex.js`, `test_auth.js`, `test_reliability.js` could not run because `jsdom` is not installed in the current environment.
- React dependency installation/build remains not validated because the prior npm dependency installation timed out and `node_modules` is unavailable.

No PASS claim is made for those blocked tests.

## Remaining Phase 5 work
1. Add evidence/provenance fields to the actual accounting records rather than only form-level warnings.
2. Connect Finance summaries and comparisons to Calculation Notes/drill-down UI.
3. Audit remaining accounting modules (Cash Flow, Revenue, COGS/HPP, Purchasing, Inventory, Target/Budget, Forecast) for historical-period mutation and source duplication.
4. Add browser regression coverage once test dependencies are available.
5. Continue guided accounting UX migration in the real legacy screens before moving to Business Diagnosis.

## Data Intake OS — 2026-09-09

Added the foundation for client-file intake: source detection, header normalization, alias mapping, amount parsing, explicit Available/Missing/Calculated status, coverage, and calculation of only derivable finance metrics. Missing values are never fabricated. The UI integration is intentionally additive to the React migration and must be connected to the real persistence path only after import-review parity and browser validation.
