# TRACE v72 — Consolidated Final Hardening Audit

## Scope
TRACE is an internal consultant OS. Clients are data subjects only; they never log in and never receive application access.

## Consolidated work
- Client selection is mandatory for operational client screens.
- Netlify operational reads are fail-closed without `client_id`.
- Browser operational reads use `trace_read_client_dataset(client_id)` rather than broad PostgREST table reads.
- Legacy multi-client operational KV is contained behind `trace_client_kv`; old `trace_kv` remains only for explicitly global metadata/legacy compatibility.
- Direct authenticated SELECT was removed from operational client tables; browser reads use controlled RPCs.
- Historical intake records gain explicit `client_id` scope and canonical import commit requires an approved, matching client scope.
- Cross-table client consistency guards prevent a child row from referencing a parent belonging to another client.
- TRACE organization helper is team-wide because all TRACE team members work across all clients; this is internal authorization, not client tenancy.
- Accounting foundation added: chart of accounts, journal headers/lines, balanced journal posting, trial-balance core, default COA seeding, and recipe-based COGS calculation.
- Repeated anomaly/alert persistence is idempotent for the same client/finding window.
- Existing premium React/Vite UI and business-intelligence modules remain intact; no working feature was removed to pass tests.

## Verification performed in this workspace
- `node --check netlify/functions/trace-data.js` — PASS
- `npm run build:core` — PASS
- business-health platform suite — PASS
- client-scope runtime test — PASS
- v72 scope static test — PASS
- accounting core test — PASS
- deterministic suite is required before release packaging.

## External blockers (not fabricated)
- Environment Node is 22.16.0 while release policy requires >=22.22.2 <23.
- React/Vite dependencies are not installed in this environment; therefore full React typecheck/build cannot honestly be reported as passed.
- Real Supabase project migration/RLS verification and Netlify production deployment remain external verification steps.

## Release rule
v72 is a consolidated release candidate, not a false production-ready claim. Apply migrations 027–030 to the real Supabase project, then run the external gates above before declaring production deployment complete.
