# TRACE v70 — Internal Client Scope Hardening Audit

## Product rule
TRACE Consultant OS is an internal-only application. Clients are data subjects, not application users. TRACE team members analyze, collaborate, prepare recommendations, and execute actions for clients.

## Root cause found
Several React screens previously loaded client-scoped relational resources without a selected client and then filtered records in the browser. This meant a team member could receive multiple clients' finance/sales/task/BI rows in one response. Even when the UI subsequently filtered them, this violated the required fail-closed client-scope rule and increased accidental cross-client exposure risk.

## Fix implemented
- `/api/trace-data` now requires `client_id` for client-scoped resources.
- Server-side filtering is applied before data is returned to the browser.
- Client-scoped keys/resources are explicitly allowlisted.
- Business Health requires a selected client before loading finance/POS/inventory/anomaly/alert data.
- Finance requires a selected client before loading finance rows.
- Sales requires a selected client before loading products/sales.
- Business Diagnosis requires a selected client before loading finance.
- Team/Business Twin task views require a selected client before loading collaboration tasks.
- Client selectors use the production client list instead of free-form IDs for the primary UI scope.
- Business Twin task creation uses an audited RPC rather than direct table insertion.
- The new task RPC requires the actor to be a TRACE team member and the owner to be an active TRACE team member.
- No client user role was introduced.

## Explicitly allowed global data
The internal team may see the client directory and team directory globally. These are selection/administrative metadata, not client financial/operational records. Client-scoped operational data is not returned without a selected scope.

## Verification
- `business health platform: PASS`
- `canonical import: PASS`
- `platform static contract: PASS`
- `internal client scope static: PASS`
- `trace-data client scope: PASS`
- JavaScript syntax check for changed Netlify function: PASS

## Remaining external verification
Real Supabase RLS/tenant isolation must still be tested against the actual production project after migration `026_internal_client_scope_hardening.sql` is applied. This report does not claim production RLS verification without that evidence.
