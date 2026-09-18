# TRACE Phase 4 — Core Client OS

Status: foundation implemented incrementally; non-destructive.

## Canonical hierarchy
Client → Company → Brand → Outlet

## Implemented foundation
- Typed TypeScript domain contracts for Client, Company, Brand, Outlet.
- Referential-integrity validation across the hierarchy.
- Business Twin summary builder scoped to a client.
- Explicit status values for active/inactive/archived entities.
- No deletion or replacement of legacy client/company/brand/outlet data.

## Migration rule
The existing monolithic frontend remains operational. The typed domain layer is additive and becomes the canonical contract for future React screens. Existing storage remains compatible during strangler migration.

## Required product standard
All migrated screens use React + TypeScript + Vite, Tailwind CSS, shadcn/ui + Radix UI, Lucide Icons, Recharts, Motion, and Three.js/React Three Fiber only where justified. Premium layout is a global requirement.

## Next
Apply the same typed contracts and calculation/evidence engine to Finance / Accounting OS without duplicating formulas inside UI components.

## Validation
- TypeScript core build: PASS.
- Calculation/Evidence/Intelligence core tests: PASS.
- Business hierarchy core tests: PASS.
- Production static release assertions: 13/13 PASS.
- React package typecheck/build requires installed npm dependencies; this environment does not contain node_modules, so those checks are explicitly NOT claimed as passed.

## Test correction
The historical acquisition static test incorrectly searched the child Acquisition document for authentication/report functions that belong to the parent TRACE application. The test now validates parent application capabilities and child Acquisition capabilities separately. No fake markers were added to production code.
