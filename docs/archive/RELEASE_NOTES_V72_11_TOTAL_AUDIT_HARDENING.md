# TRACE v72.11 — Total Audit Hardening

See `TOTAL_AUDIT_V72_11.md` for the complete one-by-one audit and honest release gate.

Changes:
- synchronized package/lock metadata and removed unused `exceljs` dependency;
- active Acquisition AI now uses authenticated `/api/ai-chat` server proxy;
- active React root now requires Supabase authentication before production data access;
- Target & Capacity reads Finance/Sales production evidence as a baseline;
- Inventory item edit/update and movement-derived stock evidence are active;
- added total-audit regression contract;
- preserved all previous Data Intake, Finance, Accounting, AR/AP, Assets, Period Lock, Sales, Inventory, Target, Acquisition, Diagnostic, Security, persistence, and client-scope work.
