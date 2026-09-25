# TRACE v72 — File Change Report

## Final code changes in this completion pass

### Application
- `src/app/main.tsx`
  - Acquisition status copy corrected to reflect its authenticated persistence bridge instead of incorrectly describing it as disconnected/localStorage-only.
  - Sales client scope changed from free-text client ID entry to the production client selector.
  - Acquisition/client conversion continues through authenticated persistence functions.
  - Global legacy KV access was moved behind allowlisted RPC calls.

### API
- `netlify/functions/trace-data.js`
  - Global metadata reads now use `trace_read_global_kv` instead of direct PostgREST access to `trace_kv`.
  - Client-scoped operational reads remain behind `trace_read_client_dataset` / `trace_read_client_kv`.
  - Fail-closed `client_id` requirement remains enforced.

### Database
- `supabase/migrations/027_client_isolation_v72.sql`
  - Client-scoped storage and relational read boundary.
- `supabase/migrations/028_accounting_and_cogs_v72.sql`
  - Accounting/COGS foundation and balanced journal posting.
- `supabase/migrations/029_client_scope_accounting_read_v72.sql`
  - Accounting data included in the client-scoped read boundary.
- `supabase/migrations/030_v72_integrity_and_internal_access.sql`
  - Internal-only access and cross-client consistency/integrity guards.
- `supabase/migrations/031_trace_kv_access_boundary_v72.sql`
  - Removes direct authenticated browser access to legacy `trace_kv` and exposes only allowlisted global KV RPCs.

### Tests
- `tests_core/test_v72_scope_static.mjs`
  - Extended to verify the global KV RPC boundary and removal of direct API `trace_kv` access.
- `tests_core/test_v72_global_kv_boundary.mjs`
  - New static contract for global legacy-KV access.
- `tests_core/react-production-wiring.mjs`
  - Updated to assert the new global metadata RPC boundary.

### Release metadata
- `package.json`
  - Deterministic test command includes the new KV boundary test.
- `netlify/functions/_diagnostic-manifest.json`
  - Regenerated after final source changes.
- `FINAL_RELEASE_REPORT_2026-09-14.md`
  - Rewritten to contain only actually executed evidence and explicit external verification status.
- `FILE_CHANGE_REPORT_2026-09-14.md`
  - This report.
- `EXECUTION_REPORT_2026-09-14.md`
  - Updated execution evidence.

## Removed accidental working artifacts

The following patch/debug artifacts were removed from the release source tree:
- `patch_scope.py`
- `patch_scope2.py`
- root-level duplicate `test_business_health_platform.mjs`

Generated `dist`, `node_modules`, and `.core-test-dist` outputs are excluded from the final source ZIP; they are reproducible build outputs rather than required source files.
