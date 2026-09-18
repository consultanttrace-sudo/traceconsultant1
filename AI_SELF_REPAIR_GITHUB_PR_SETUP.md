# TRACE AI Self-Repair — GitHub Pull Request Setup

## Runtime configuration

Set these Netlify environment variables for the production site:

- `TRACE_GITHUB_TOKEN` — GitHub fine-grained token with repository Contents write + Pull requests write permissions.
- `TRACE_GITHUB_OWNER` — GitHub repository owner/org.
- `TRACE_GITHUB_REPO` — GitHub repository name.
- `TRACE_GITHUB_BASE_BRANCH` — base branch, default `main`.
- `TRACE_AI_REPAIR_APPROVAL_TTL_MS` — optional approval TTL, default 15 minutes.

Existing required TRACE variables remain required, including `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for the server-side approval ledger.

## Flow

1. Diagnostic produces a repair plan.
2. A plan is executable only when it contains `patch.files[]` with concrete file content (or `content: null` for deletion).
3. Leader explicitly approves the exact plan.
4. Server stores a scoped `apply_patch` / `workspace` approval with an expiry.
5. Leader clicks **Create GitHub PR**.
6. Server verifies the approval, expiry, actor, and exact plan SHA-256 scope.
7. Server creates a new `trace-ai/repair-*` branch, Git blobs/tree/commit, then a Pull Request.
8. The approval is consumed after successful PR creation.
9. Production is not deployed by this flow; human review and merge remain required.

## Safety boundaries

- GitHub credentials never enter browser code.
- No direct production source mutation is performed by the Netlify function.
- Plans without an executable patch return `patch_required` and make no source change.
- Absolute paths, `..` traversal, `.git` paths, duplicate paths, oversized files, and oversized patches are rejected.
- A different plan cannot reuse an approval because the exact plan hash is checked server-side.
- Expired, revoked, already-consumed, or differently-scoped approvals are rejected.

## Verification limitation

The repository package requires Node `>=22.22.2 <23`. The available verification runtime for this build is Node `22.16.0`, so the full dependency install/build cannot honestly be marked PASS here. The GitHub Self-Repair contract test and mocked end-to-end API flow are independently verified in `tests_core/test_diagnostic_repair_github_pr.mjs` and `tests_core/test_diagnostic_repair_github_pr_runtime.mjs`.
