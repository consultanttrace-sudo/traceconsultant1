# TRACE Phase 11 — KPI Engine

## Objective
Standardize KPI calculation so every number remains traceable.

## Canonical chain
NUMBER → COMPARISON → CALCULATION → CHANGE → CONTRIBUTORS/EVIDENCE → CONCLUSION.

## Controls
- Missing current data remains unavailable; it never becomes zero.
- Missing comparison produces current-only status rather than fabricated change.
- Previous-period zero produces no percentage change rather than division by zero.
- Formula is returned with every calculated KPI.
- Target gap is explicit and uses current minus target.
- Evidence remains attached to the KPI result.

## Validation
- Core build: PASS.
- KPI regression: PASS.
- Finance production wiring remains subject to the later integration and persistence gates.
