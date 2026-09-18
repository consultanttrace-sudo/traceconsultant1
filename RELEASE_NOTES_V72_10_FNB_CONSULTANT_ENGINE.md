# TRACE v72.10 — F&B Consultant Engine

## Implemented, not placeholder
- Real manual Inventory master CRUD via authenticated RPC.
- Real manual Recipe/BOM component CRUD via authenticated RPC.
- Real manual Inventory movement entry for purchase, consumption, waste, adjustment, return, transfer.
- Target & Capacity UI expanded with dine-in, peak occupancy, parking, takeaway, labor capacity, rent/utilities/marketing/OPEX detail.
- Target engine calculates break-even, profit target, daily revenue, transaction requirement, effective turns, required occupancy, capacity utilization, labor ratio, cost breakdown, and conservative/base/stretch scenarios.
- Existing Data Intake upload + manual hybrid flow retained.
- Existing Finance Intelligence, Accounting, AR/AP, Fixed Assets, Period Lock, Acquisition, Diagnosis, AI, security and audit work retained.

## Verification
- Core TypeScript compile: PASS.
- Finance intelligence regression: PASS.
- Finance core regression: PASS.
- Finance statement regression: PASS.
- F&B target planning regression: PASS.
- AR/AP/Assets/Period Lock static regression: PASS.
- React dependency install could not be completed in the isolated environment before timeout; production Vite build is therefore not claimed PASS.
