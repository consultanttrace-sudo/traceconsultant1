# TRACE v48 — Root Cause Audit: Phases 10–12

## 1. Action Plan OS
**Observed gap:** diagnosis could produce recommendations, but there was no canonical execution object enforcing owner, measure, baseline, target, evidence, and completion controls.

**Concrete cause:** action semantics existed only as prose inside diagnosis output; there was no validated execution contract.

**Fix:** added `src/core/actionPlan.ts` with fail-closed validation, measurable action items, evidence requirements, dependencies, and derived execution summaries.

**Prevention:** no action can be considered completed without evidence; invalid plans are rejected before execution.

## 2. KPI Engine
**Observed gap:** KPI calculation existed in finance/diagnosis modules but lacked one small canonical result contract for current, previous, change, formula, target gap, status, and evidence.

**Concrete cause:** KPI semantics were distributed across module-specific calculations.

**Fix:** added `src/core/kpi.ts` with explicit unavailable/manual/available states, comparison math, zero-denominator protection, formula disclosure, and evidence retention.

**Prevention:** missing values never become zero; no percentage change is emitted when comparison is unavailable or previous value is zero.

## 3. SOP Engine
**Observed gap:** repeatable workflows had no canonical step-control object enforcing evidence and preventive controls.

**Concrete cause:** SOP was represented as workflow intention rather than validated operational data.

**Fix:** added `src/core/sop.ts` with ordered steps, owners, required evidence, controls, completion guard, and next-step selection.

**Prevention:** completed steps without required evidence are rejected.

## 4. Release environment
The root lockfile remains a real blocker because this audit environment has no resolved npm package graph. No fake lock entries were generated. Node 22.22.2 remains pinned in project and CI/Netlify configuration, but the currently running audit process is still Node 22.16.0 and therefore cannot truthfully be marked runtime PASS.
