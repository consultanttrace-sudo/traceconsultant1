# TRACE Consultant OS — Phase 0 Data Model & Migration Audit
Date: 2026-09-08
Status: IMPLEMENTED CHECKPOINT — NOT FINAL RELEASE

## Finding
TRACE currently stores most business modules as JSON arrays inside `trace_kv`. This is useful for backward compatibility, but it is not sufficient as the long-term persistence model for:
- durable Acquisition jobs;
- checkpoint/recovery;
- concurrent edits;
- field-level provenance;
- audit history;
- role-aware ownership;
- large datasets and efficient drill-down.

The existing data MUST NOT be wiped or rewritten blindly.

## Decision
Use a **strangler migration**:
1. Keep `trace_kv` as the compatibility layer.
2. Add first-class relational tables for new high-risk workflows.
3. Dual-read/dual-write only where migration requires it.
4. Migrate module-by-module after regression coverage exists.
5. Retain a rollback path until parity is proven.

## Implemented in this checkpoint
`supabase/migrations/002_trace_operational_jobs.sql` adds:
- `trace_jobs`
- `trace_job_checkpoints`
- `trace_is_leader()`
- member/leader RLS boundaries
- append-only checkpoint policy
- job ownership guard
- updated_at trigger

This establishes the database foundation for the Acquisition lifecycle fix already implemented in the frontend/backend checkpoint.

## Why this matters
The previous Acquisition P0 fix prevents hangs and preserves checkpoints in the application flow. The new relational foundation makes those checkpoints durable independently of one giant JSON blob.

Target lifecycle:

QUEUED → RUNNING → STOPPING/PAUSING → STOPPED/PAUSED/RESUMABLE/COMPLETED/PARTIAL_FAILURE

A browser refresh, tab crash, or network interruption must not turn an in-memory discovery run into an unrecoverable operation.

## Next migration candidates
Priority order:
1. Acquisition leads + evidence/provenance
2. Client / Company / Brand / Outlet hierarchy
3. Transactions and accounting ledgers
4. Products / ingredients / suppliers / purchasing / inventory
5. Marketing / customer / campaign evidence
6. Diagnosis / action plans / KPI / SOP
7. Reporting snapshots

## Premium product requirement
The persistence redesign is not separate from the premium upgrade. A premium consulting OS requires:
- fast drill-down;
- reliable live status;
- professional empty/error/loading states;
- evidence/provenance;
- auditability;
- responsive Command Center;
- interactive charts;
- consistent design system;
- role-aware workflows.

The UI redesign will begin in the agreed **Product Blueprint → Design System** phases, after Phase 0 architecture/data risks are closed. It will upgrade the existing application rather than replace it blindly.

## Not yet proven
- Real Supabase migration execution
- RLS tests against three real team accounts + non-member + anonymous
- concurrent checkpoint writes
- crash/recovery integration test
- production-scale query performance
- full relational migration of legacy `trace_kv`

Therefore this checkpoint is NOT production-ready and NOT final.
