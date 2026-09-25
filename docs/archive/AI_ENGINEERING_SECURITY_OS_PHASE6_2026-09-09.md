# TRACE AI Engineering + Security OS — Phase 6

## Purpose
TRACE AI is a conversational internal software-engineering brain. It prioritizes coding, debugging, architecture, TypeScript/React, Supabase/RLS, Netlify, persistence, performance and testing.

## Conversational AI
- `netlify/functions/ai-chat.js` authenticates the user before forwarding chat to a server-side AI provider.
- AI provider endpoint/model are server-side environment configuration (`TRACE_AI_ENDPOINT`, optional `TRACE_AI_MODEL`).
- No model/API credential is sent from the browser.
- TRACE does not impose an artificial message-count or per-message character truncation. The effective limit is the configured AI provider/model context window and transport/runtime limits.
- System policy requires evidence-first reasoning and forbids invented code/logs/data/evidence.

## Engineering governance
AI may inspect, diagnose, generate proposals and run verification. Write/deployment actions require explicit approval:
- apply patch
- commit
- push
- merge
- Supabase migration
- production deploy

`src/core/aiMaintenance.ts` defines this policy contract. `trace_ai_approvals` records approval scope/hash and is team/leader protected by RLS.

## Security Guard
`src/core/aiSecurity.ts` detects:
- possible embedded secrets
- privileged Supabase credentials in client code
- sensitive localStorage usage
- wildcard CORS
- repeated authentication failures

This is a detection/response layer, not a guarantee that TRACE cannot be breached. Real protection remains dependent on Auth, RLS, least privilege, secrets management, network policy, dependency hygiene, backups and monitoring.

## Security audit storage
Migration `004_trace_ai_security_governance.sql` adds:
- `trace_ai_approvals`
- `trace_security_events`

Security events are append-only from the client policy perspective: no UPDATE/DELETE policies are granted. Anonymous users receive no access.

## Evolution Advisor
`src/core/aiEvolution.ts` converts real usage signals into evidence-backed update recommendations based on failure frequency, workflow completion, missing-data rate and latency. Recommendations require approval.

## Truthful status
- Core TypeScript compile check: PASS in current environment.
- Netlify function syntax checks: PASS.
- Existing finance core test suite: PASS.
- React production build: NOT VERIFIED because project dependencies are not installed in the current environment.
- Supabase production/RLS verification: NOT VERIFIED until the migration is applied to the real project and tested with real Auth identities.
- AI provider integration: NOT ACTIVE until `TRACE_AI_ENDPOINT` is configured.
