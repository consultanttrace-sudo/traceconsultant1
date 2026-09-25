# TRACE V57 — React Production Wiring Root-Cause Audit

Date: 2026-09-09

## Objective
Move the React foundation one step toward production truthfulness by connecting read-only production data from Supabase without inventing business state.

## Concrete finding
V56 React screens were truthful about missing data, but Command Center, Overview, and Team had no production data source at all. The screens therefore could not distinguish "no records" from "data source unavailable" and could not display actual counts.

## Root cause
The React application had no production data adapter. Its data model existed in `src/core`, while the legacy application stored collections in `public.trace_kv` using the `trace_os::` prefix. React was not connected to that storage path.

## Why this matters
Retiring legacy UI before wiring this gap would create a silent data regression: the new UI could render successfully while showing no real team/client/business data.

## Fix
- Added authenticated `netlify/functions/trace-data.js`.
- Endpoint only allows an explicit allowlist of TRACE collection keys.
- Endpoint forwards the authenticated user's bearer token to Supabase REST, so `trace_kv` RLS remains authoritative; service-role access is not used.
- Added bounded request timeout and JSON/provenance-safe handling for missing/invalid values.
- Added React Supabase client initialization using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Added `loadTraceCollections()` and `useTraceCollections()`.
- Overview now displays actual production collection counts when available, otherwise an explicit unavailable state.
- Command Center now reads actual client/company/brand/outlet counts. Health/priority remains unavailable until finance/diagnosis/action evidence is mapped to client snapshots.
- Team now reads the existing team collection; collaboration task KPIs remain unavailable until the relational task source is connected.
- No dummy zeros or fabricated health statuses were introduced.

## Verification
PASS: core TypeScript build (`npm run build:core`)
PASS: React production wiring guard (`npm run test:react-production-wiring`)
PASS: React truthfulness guard
PASS: Action Plan/KPI/SOP regression
PASS: Finance core regression
PASS: Internal Diagnosis regression
PASS: Phase 13–15 regression
PASS: Reporting regression

## Still not verified
- Full React/Vite build: dependency installation is not available in the current environment.
- Real Supabase/RLS execution against production database.
- Browser rendering and authenticated session flow.
- Full production parity with every legacy workflow.

## Prevention control
Before any legacy workflow is retired, the replacement React workflow must have: real data source, authenticated access, behavior parity, data/evidence parity, unavailable/error states, deterministic regression coverage, and browser verification.
