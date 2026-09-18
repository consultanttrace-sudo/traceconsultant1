# TRACE Consultant OS — Feature Freeze

V17 is the stabilization/feature-freeze release.

## Frozen architecture
- TRACE OS is internal to TRACE Consultant; clients receive deliverables, not the OS.
- Full TRACE keeps access to all modules.
- JOBDESK is a focus/workspace layer, not a permission layer.
- My Work provides contextual shortcuts.
- Transactions is the central money-entry layer for TRACE Consultant and clients.
- Existing data is selected/reused when available; manual entry is used only when needed.
- Existing modules remain intact; no business module is duplicated for JOBDESK.

## Post-freeze changes allowed
Only bug fixes, data-integrity fixes, calculation corrections, UI polish, report/PDF corrections, performance improvements, and security/access fixes.

No new business modules should be added without a separate architecture review.
