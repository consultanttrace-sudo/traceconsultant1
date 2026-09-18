# TRACE v51 — Phase 21–24 Root-Cause Re-Audit

## Locked principle
OBSERVE → PROVE → EXPLAIN → FIX → TEST → RE-AUDIT.

## Concrete defects found and fixed

### 1. Collaboration transition contract mismatch
**Evidence:** the deterministic regression attempted `blocked -> done`, while the SQL guard only permits `blocked -> open|in_progress|cancelled`.
**Why:** the TypeScript contract allowed every status transition; the database contract was stricter.
**Fix:** TypeScript now mirrors the explicit state machine. A blocked task must be reopened/in-progress before completion.
**Prevention:** regression coverage asserts both valid progression and invalid transitions.

### 2. Data Intake derived-field duplication
**Evidence:** `calculateAvailableFinance()` appended derived fields on every invocation.
**Why:** the function was not idempotent; repeated review/manual-completion calls could duplicate derived fields and inflate coverage.
**Fix:** derived fields are removed and recomputed deterministically.
**Prevention:** regression asserts exactly one Gross Profit and one Operating Profit after repeated calculation.

### 3. Governance policy over-restricted team updates
**Evidence:** migration 011 used `WITH CHECK (... created_by=auth.uid())`, which can block legitimate leader/member updates to tasks created by another team member.
**Why:** insert ownership and update authorization were conflated.
**Fix:** additive migration 013 restores team-member update capability while the creator remains immutable through the trigger.
**Prevention:** keep authorization in RLS and immutability in trigger constraints.

### 4. Atomic audit captured an incorrect before-state
**Evidence:** migration 012 built `before_data.status` from `p_status`, which is the requested/new status.
**Why:** the old row state was not copied before UPDATE.
**Fix:** additive migration 013 captures `old_status`, `old_version`, and `old_evidence_ids` before mutation.
**Prevention:** audit regression checks the additive fix.

### 5. Audit append-only helper did not reject duplicates inside one incoming batch
**Evidence:** `assertAppendOnly(existing,[sameId,sameId])` previously checked only existing IDs.
**Why:** newly seen IDs were not added to the set during iteration.
**Fix:** each accepted incoming ID is added to the seen set.
**Prevention:** regression covers duplicate IDs within the same batch.

### 6. Diagnostic loop detector produced a false positive on bounded return loops
**Evidence:** the Acquisition worker uses `while(true)` with an explicit `return` termination path.
**Why:** the static detector only recognized `break`, not a bounded `return`.
**Fix:** detector recognizes `break` or `return` in the inspected block.
**Prevention:** regression proves a bounded return loop is not flagged.

### 7. Browser diagnostic/repair requests had no caller-level cancellation
**Evidence:** `diagnosticRepair` and telemetry used raw browser `fetch`; a stalled browser request could remain pending despite server-side limits.
**Why:** server deadlines do not cancel the browser's underlying request.
**Fix:** added `browserNetwork.fetchWithTimeout()` using AbortController and wired repair (15s) and telemetry (5s).
**Prevention:** regression verifies timeout aborts the underlying fetch.

## Verification
- Core typecheck: PASS
- Core build: PASS
- All deterministic tests except the known lock-integrity gate: PASS
- Browser request cancellation regression: PASS
- Netlify function syntax checks: PASS
- Diagnostic manifest: 119 text files, 0 static checks

## Remaining blockers — NOT PASS
- Runtime policy: current environment Node 22.16.0; required >=22.22.2 <23.
- Dependency lock graph: package-lock has 0 resolved transitive `node_modules/*` entries.
- React/Vite full build: blocked because root Vite dependency is unavailable in the current environment.
- Live Supabase/RLS execution: not available; SQL correctness is source-tested only.
- Live Netlify deployment/health/rollback: not verified.

These are explicitly blocked verification states and are not represented as successful production validation.
