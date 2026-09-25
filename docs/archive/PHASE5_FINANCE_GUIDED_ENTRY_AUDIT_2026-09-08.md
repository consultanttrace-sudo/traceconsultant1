# TRACE Phase 5 — Finance Guided Entry & Input Intelligence Audit

## Required behavior
Finance input is presented in a fixed guided sequence so a user can enter accounting data without needing to understand the full accounting model first.

1. Period & outlet
2. Revenue
3. COGS
4. Labor
5. OPEX
6. Evidence/source
7. Review
8. P&L and diagnostics

## Input validation
The finance input contract flags invalid period, missing/invalid category, non-numeric amount, negative amount, and manual evidence without a source note.

The assistant explains:
- what is wrong;
- why it matters;
- what the user should check next.

It does not silently change accounting values.

## Intelligence rule
A valid format does not mean the accounting fact is correct. TRACE separates:
- format/input validation;
- evidence completeness;
- accounting calculation;
- business diagnosis.

Missing data limits the analysis scope and is disclosed instead of being invented.

## Validation results
- Core TypeScript `tsc --noEmit -p tsconfig.json`: PASS
- Finance input validation contract: PASS
- Acquisition `node --check`: PASS
- Existing production static assertions: 13/13 PASS
- React dependency installation/build: NOT VALIDATED in this environment because the prior dependency installation timed out. No PASS claim is made.
