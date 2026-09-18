# TRACE AI Diagnostic OS — Phase 5

## Purpose
Provide an evidence-first diagnostic layer that identifies application failures, missing dependencies/files, runtime errors, persistence risks, and measured performance regressions.

## Output contract
Every finding contains:
- severity
- category
- title
- root cause
- impact
- proposed solution
- file evidence and optional line/code snippet
- confidence
- status: confirmed / suspected / blocked

## Hard rules
1. The diagnostic engine does not invent a root cause. Pattern-based findings are marked `suspected` unless confirmed by telemetry/tests.
2. A missing dependency or unavailable test environment is `blocked`, never PASS.
3. A runtime error from telemetry is `confirmed` but still requires reproduction/fix before release.
4. A proposed solution must preserve existing good data and existing working workflows.
5. Fixes must follow KEEP -> FIX -> IMPROVE -> REFACTOR -> TEST.
6. Diagnostic output must never silently modify application data or source code.

## Intended UI
System Health / AI Diagnostic should show:
- overall health
- release blocked status
- critical/high findings first
- exact file and line when available
- evidence/snippet
- why it failed
- impact
- recommended fix
- test needed to prove the fix
- historical occurrences

## Future telemetry integration
Connect browser error boundaries, server logs, import pipeline errors, job lifecycle telemetry, performance marks, dependency/build reports, and file-ingestion failures into this core. The AI explanation layer should only summarize evidence already collected; it must not fabricate logs or code facts.
