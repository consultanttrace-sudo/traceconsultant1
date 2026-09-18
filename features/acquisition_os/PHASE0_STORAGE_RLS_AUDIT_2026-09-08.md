# TRACE Consultant OS — Phase 0 Storage & RLS Hardening
Date: 2026-09-08
Status: IMPLEMENTED CHECKPOINT — NOT FINAL RELEASE

## 1. Scope
This pass follows the agreed Phase 0 audit and the P0 Acquisition lifecycle fix. It hardens the existing Supabase storage boundary without deleting or rebuilding existing TRACE data.

## 2. Critical findings

### P0/P1 — Existing RLS trusted any authenticated user
The previous policy on `trace_kv` was effectively:
- role: `authenticated`
- `using (true)`
- `with check (true)`

That blocks anonymous access but does not distinguish a TRACE team member from any other authenticated account.

### P1 — No first-class membership/role boundary
The application had a team list stored as ordinary application data, but that list was not an authorization source. Therefore changing the UI team list could not securely grant/revoke database access.

### P1 — Monolithic key/value storage remains a scalability limitation
Most application data is serialized into separate `trace_kv` keys. This is useful for preserving the existing system but is not the final architecture for durable job state, auditability, row-level ownership, concurrent writes, or large Acquisition datasets.

### P1 — Audit log existed conceptually, but not as a secure database boundary
A durable audit table is needed for the agreed leader governance model. This pass creates the table but deliberately does not give browser clients arbitrary write access; a server-side audit path should own future writes.

## 3. Implementation

### New
`supabase/migrations/001_trace_security_storage.sql`

Adds:
- `trace_team_members`
- `trace_is_team_member()` security-definer membership check
- team-member-only RLS on `trace_kv`
- `trace_audit_log`
- `trace_kv.updated_at` trigger
- explicit anon/authenticated grants
- non-destructive bootstrap instructions using Auth user UUIDs

### Updated
`SUPABASE_AUTH_RLS.sql`
`features/acquisition_os/SUPABASE_AUTH_RLS.sql`

Both now use the same team-membership policy so the two copies do not drift.

### Preserved
- existing `trace_kv` rows
- existing authentication flow
- existing application keys
- existing Acquisition P0 lifecycle fix
- existing client/company/brand/outlet structure
- existing financial calculation modules

## 4. Important deployment rule
The migration intentionally does NOT guess which Supabase accounts belong to TRACE.

After migration, add only the intended TRACE Auth user UUIDs to `trace_team_members`:
- Irwan → `leader`
- Ruspandi → `member`
- Firmansyah → `member`

Do not paste passwords, service-role keys, or other secrets into the SQL file.

Until those membership rows exist, the browser app should be treated as intentionally blocked by RLS. This is safer than accidentally granting every authenticated account access.

## 5. Validation actually performed

- Production inline JavaScript static release test: **13/13 PASS**.
- Netlify function Node syntax checks: **PASS** for `_auth.js`, `_url.js`, `acq-overpass.js`, `acq-google-places.js`, `acq-social-enrich.js`, `acq-social-intel.js`.
- Static search found no remaining `using (true)` / `with check (true)` policy in the new TRACE RLS entrypoints.
- Root and Acquisition copies of the RLS entrypoint have identical SHA-256.

## 6. Not yet proven

This checkpoint is source-level hardening, not proof of production security. Still required:

1. Apply migration to the real Supabase project.
2. Bootstrap the three intended team Auth UUIDs.
3. Test authenticated TRACE member SELECT/INSERT/UPDATE/DELETE.
4. Test a non-member authenticated account is denied.
5. Test anonymous access is denied.
6. Test existing `trace_kv` data remains intact.
7. Test Realtime behavior after the policy change.
8. Test concurrent writes and recovery.
9. Build durable Acquisition job/checkpoint tables instead of relying on one large JSON value.
10. Add server-side audit event writing and leader governance controls.

## 7. Decision
Do NOT call this final. This is the next Phase 0 checkpoint.

Next work remains inside the agreed timeline:
**Storage/RLS → data model/migration audit → Calculation & Evidence → remaining Phase 0 gap analysis → Product Blueprint → Design System → Intelligence Layer ...**
