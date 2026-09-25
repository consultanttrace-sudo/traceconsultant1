# TRACE Data Intake OS — Phase 5 extension

## Goal
Allow consultant/accounting users to upload client files and have TRACE identify, map, validate, calculate, and diagnose available financial data without requiring manual row-by-row entry.

## Mandatory behavior
- PDF, Excel/spreadsheets, CSV/TSV are accepted at the intake boundary.
- Column order is not authoritative; semantic aliases map fields to TRACE's canonical schema.
- Missing data is never fabricated.
- Available data is still analyzed even when coverage is incomplete.
- Derived metrics are explicitly marked `Calculated` and carry their formula/note.
- Missing fields are explicitly marked `Missing` and reported after processing.
- Import review occurs before durable commit to operational accounting data.
- Source provenance must be retained for every imported value before production commit.

## Pipeline
UPLOAD → EXTRACT → CLASSIFY → MAP → VALIDATE → COVERAGE → IMPORT REVIEW → COMMIT → CALCULATE → DIAGNOSE

## Current implementation
- `src/core/dataIntake.ts`: source detection, normalization, alias mapping, amount parsing, field status, coverage, and derivable finance calculations.
- `src/app/main.tsx`: additive React Data Intake screen with upload/review UX and explicit missing-data messaging.
- `tests_core/test_data_intake.mjs`: deterministic core contract tests.
- `package.json`: XLSX and PDF processor dependencies reserved for the extraction adapters.

## Important release truth
The core mapping/calculation layer is implemented and tested. The current UI fully parses CSV/TSV in-browser. XLS/XLSX and PDF/OCR are intentionally detected but not yet committed/imported because the extraction adapters still need dependency installation and browser/integration validation. Do not claim full PDF/Excel auto-import until those tests pass.

## Next required work
1. Implement XLS/XLSX workbook adapter, including multiple sheets and merged/header rows.
2. Implement PDF text/table adapter plus OCR path for scanned PDFs.
3. Persist raw file metadata and evidence references in Supabase.
4. Add duplicate/import-idempotency checks.
5. Add mapping template memory per client/outlet.
6. Connect approved imports to the existing Finance Engine and Calculation/Evidence Engine.
7. Run browser integration tests with real sample PDF/XLSX files.
8. Only then enable production commit and automatic diagnosis from file imports.
