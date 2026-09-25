# TRACE Phase 12 — SOP Engine

## Objective
Make repeatable consulting/finance/marketing workflows sequential, controlled, and auditable.

## Controls
- SOP requires identity, purpose, and trigger.
- Step order must be unique.
- Every step has owner, instruction, and preventive control.
- A step cannot be marked done while required evidence is missing.
- Next-step selection follows order and returns the first incomplete step.
- Invalid SOP definitions fail closed.

## Validation
- Core build: PASS.
- SOP regression: PASS.
- Production UI/persistence wiring remains a later gate and is not claimed complete here.
