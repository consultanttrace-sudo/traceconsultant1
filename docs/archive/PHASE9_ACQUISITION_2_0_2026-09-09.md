# TRACE Phase 9 — Acquisition 2.0

## Scope
Formalize Acquisition as a measurable consulting pipeline without replacing the existing Discovery OS.

## Canonical pipeline
Discovery → Raw Leads → Normalization → Deduplication → Enrichment → Business Analysis → Fit Score → Problem Hypothesis → Priority → Personalized Outreach → Response → Meeting → Proposal → Client.

## Implementation
- Added `src/core/acquisition.ts` as a pure, dependency-free acquisition contract.
- Normalization preserves unknown values as missing; it does not invent facts.
- Deduplication uses external id, normalized phone, website, Instagram, then normalized business name + city.
- Fit qualification is evidence-aware and produces P1–P4 priority.
- Problem hypotheses are explicitly hypotheses and require validation before being treated as facts.
- Pipeline metrics distinguish qualified/prioritized/contactable and do not treat missing values as zero evidence.
- Existing Acquisition Discovery, storage bridge, and legacy status pipeline remain in place for compatibility.
- Existing lead records are backfilled with compatibility fields at load time without deleting or rewriting their underlying facts.

## Code-health correction
The legacy Acquisition score was the only field representing both generic lead score and consulting fit. Phase 9 makes that distinction explicit with `fit_score`, `fit_status`, `priority`, `acquisition_stage`, and `problem_hypotheses` while retaining `lead_score` for compatibility.

## Truthful validation
- Acquisition Phase 9 core runtime test: PASS.
- Core TypeScript typecheck: must be rerun in an environment with TypeScript available.
- Full React/Vite build: still BLOCKED if npm dependencies are unavailable.
- Real Supabase lifecycle/resume tests: not claimed until executed against the actual project.
