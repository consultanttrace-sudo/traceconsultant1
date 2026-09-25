# TRACE Finance — Simplified Entry Flow

Finance entry is ordered for non-accounting users while preserving accounting detail.

## Guided order
1. **Periode & Outlet** — choose month and business location.
2. **Revenue** — sales/revenue records.
3. **COGS** — purchases/material cost mapped to products where available.
4. **Labor** — wages/benefits.
5. **OPEX** — rent, utilities, marketing expense, admin, and other operating costs.
6. **Evidence** — source, period, document/reference, notes.
7. **Review** — TRACE checks consistency before save.
8. **Result** — P&L, margins, comparison, contributors, evidence completeness.

## Input assistance
TRACE must immediately flag:
- invalid month format;
- missing category;
- invalid/non-numeric amount;
- negative amount;
- manual data without source note;
- incomplete required fields.

Warnings explain **what is wrong, why it matters, and what to do next**. Blocking errors prevent the record from being treated as valid.

## AI / Intelligence behavior
The assistant is embedded in the form. It must not silently correct accounting data. It identifies suspicious or inconsistent input, explains the issue, and asks the user to verify it.

Examples:
- COGS entered as Revenue → block category mismatch.
- `2026-13` → reject invalid period.
- negative purchase amount → warn and require verification.
- manual amount without source → allow only as manual evidence with an audit warning.
- Revenue entered without COGS → allow incomplete analysis but label COGS as unavailable; never invent it.

The intelligence layer must distinguish **input validation** from **business diagnosis**. A validly formatted number is not automatically a correct business number.
