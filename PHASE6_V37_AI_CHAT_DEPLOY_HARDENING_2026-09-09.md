# TRACE v37 — AI Chat & Deployment Hardening

Date: 2026-09-09

## Changes

1. Removed TRACE-specific artificial AI chat limits.
   - No fixed 30-message truncation.
   - No fixed 12,000-character truncation per message.
   - The provider/model context window remains the natural technical limit.
2. Preserved server-owned system prompt.
   - Client messages are restricted to user/assistant roles.
   - Client cannot inject a system role.
3. Hardened deployment intent detection.
   - Informational questions about deployment do not create approval requests.
   - Explicit deploy/release/publish-to-production intent does create the approval request.
4. Explicit production approval remains mandatory.
   - AI requests confirmation.
   - User must explicitly confirm before the deploy endpoint can trigger the Netlify build hook.

## Validation

- `node --check netlify/functions/ai-chat.js`: PASS
- `node --check netlify/functions/ai-deploy.js`: PASS
- `tests_core/test_ai_chat_contract.mjs`: PASS
- `tests_core/test_ai_deploy_intent.mjs`: PASS

## Not claimed

- Live provider chat has not been tested because the real AI endpoint is environment-configured.
- Live Netlify deployment has not been tested because production credentials/build hook are environment-configured.
- React/Vite dependency installation and full production build remain unverified until dependencies are available.
