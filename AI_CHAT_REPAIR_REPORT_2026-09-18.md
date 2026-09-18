# AI Chat Repair Report — 2026-09-18

## Scope
Repair `netlify/functions/ai-chat.js` so TRACE AI Chat has an explicit, safe provider configuration path instead of a vague deployment-only dependency.

## Implemented
- OpenAI fallback endpoint is automatically selected when `OPENAI_API_KEY` exists.
- `OPENAI_MODEL` / `TRACE_AI_MODEL` is explicitly required.
- Custom OpenAI-compatible endpoints use `TRACE_AI_ENDPOINT` + `TRACE_AI_MODEL`.
- Optional `TRACE_AI_API_KEY` supports custom providers without exposing secrets to browser code.
- `TRACE_AI_TIMEOUT_MS` is bounded to 5–60 seconds; default 30 seconds.
- Authenticated GET `/api/ai-chat` now reports non-secret configuration status.
- Missing configuration returns `503` with stable code `AI_NOT_CONFIGURED`.
- Provider error response bodies are no longer returned to the browser (avoids leaking provider details).
- Existing server-side system prompt and user/assistant role allowlist remain intact.
- Added deterministic configuration contract test and npm script.
- Added `AI_CHAT_NETLIFY_SETUP.md` with exact Netlify variables.

## Verification
PASS — `node --check netlify/functions/ai-chat.js`

PASS — `node tests_core/test_ai_chat_contract.mjs`

PASS — `node tests_core/test_ai_chat_configuration.mjs` (10/10)

NOT CLAIMED — live OpenAI/provider request, because this workspace does not contain the user's production API credentials.

NOT CLAIMED — full project build/typecheck, because the available runtime is Node 22.16.0 while this project requires Node >=22.22.2 <23, and the environment cannot perform a complete dependency install from its available cache.

## Important
This code cannot manufacture an OpenAI API key. After uploading the ZIP, the operator must set the required secret/model in Netlify Environment Variables and redeploy. Until then, `503 AI_NOT_CONFIGURED` is the correct fail-closed behavior.
