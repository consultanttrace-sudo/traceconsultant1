# TRACE v72.7 — Finance + Full Integrity Repair

## Scope
This release continues from TRACE v72.4 and addresses the remaining concrete gaps found during source audit, with special focus on Finance/COGS/OPEX and the Acquisition/Diagnostic persistence paths.

## Major fixes

### Finance
- Data Intake APPROVED payload can now create durable monthly finance records through `trace_commit_intake_finance`.
- Imported finance records carry `source_import_hash` and `source_import_id` provenance.
- Monthly Revenue / COGS / Labor / OPEX are preserved independently; missing monthly metrics remain `null`, never silently become zero.
- Finance page now exposes a client-scoped Finance Intelligence dashboard with monthly P&L, Gross Profit, Prime Cost, Operating Profit, margins, evidence coverage, completeness, and duplicate-risk indicators.
- COGS Recipe Check reads product recipes + inventory unit cost and marks missing cost data as insufficient instead of zero.
- Finance records respect period locks through a database trigger.
- Imported/manual finance provenance is enforced server-side.
- Finance exports use the selected client name rather than the internal client ID.

### Data Intake
- Multi-month detection remains first-class: period start/end/count and monthly breakdown.
- Monthly finance aggregation preserves missingness.
- Approval automatically synchronizes monthly finance into the finance ledger; canonical POS commit remains separate.

### Acquisition
- Legacy `index.html` Acquisition bridge no longer writes `trace_jobs` or `trace_job_checkpoints` directly. It uses the authenticated RPC boundary.

### Diagnostic / Security
- Diagnostic and security server functions prefer the server-only Supabase service-role credential for internal telemetry/job reads, falling back to anon only when service-role is unavailable.
- Diagnostic manifest is regenerated and explicitly included in Netlify function packaging.

## Verification performed in supplied environment
- Core TypeScript build: PASS (`tsc -p tsconfig.json`).
- Finance intelligence regression: PASS.
- Finance core regression: PASS.
- Finance statement regression: PASS.
- Data Intake 6-month aggregation against the supplied 3,680-row sample: PASS; 6 periods detected from 2026-03 through 2026-08 and totals preserved.
- TS/TSX syntax parse: PASS.
- All Netlify Function JavaScript syntax checks: PASS.
- Secret-pattern scan of repository working tree: no obvious hard-coded API-key patterns found.
- Direct browser writes to `trace_jobs` / `trace_job_checkpoints`: none found in source after repair.

## External verification still required
- Full `npm ci` / React typecheck / Vite production build in an environment with the committed dependency tree. The supplied environment has no installed dependency tree and `npm ci` exceeded the available execution window.
- Apply migration `038_finance_intake_and_integrity_v72.sql` to the real Supabase project.
- Deploy to Netlify and test authenticated browser flows.
- Verify real provider credentials for AI and Google Places.
- Verify real Supabase RLS and period-lock behavior against production data.

## Truthfulness
This release is not labelled production-verified until the external deployment and real Supabase/Netlify tests above are completed.
