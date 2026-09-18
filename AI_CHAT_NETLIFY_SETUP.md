# TRACE AI Chat — Netlify configuration

The `/api/ai-chat` function is server-side and requires a real AI provider configuration. It intentionally returns `503` with `AI_NOT_CONFIGURED` when configuration is missing; it never fakes an AI response.

## Option A — OpenAI

Set these Netlify Environment Variables for the deployed site/functions:

- `OPENAI_API_KEY` — secret API key; server-side only.
- `OPENAI_MODEL` — the chat-completions model you have access to.

The function automatically uses `https://api.openai.com/v1/chat/completions` when `OPENAI_API_KEY` is present.

## Option B — OpenAI-compatible/custom provider

Set:

- `TRACE_AI_ENDPOINT` — full chat-completions endpoint.
- `TRACE_AI_MODEL` — model identifier required by that endpoint.
- `TRACE_AI_API_KEY` — optional Bearer credential when the provider requires one.
- `TRACE_AI_PROVIDER` — optional label such as `custom`.

Do not put any of these secrets in the React/browser code.

## Optional

- `TRACE_AI_TIMEOUT_MS` — request timeout, bounded by the server to 5–60 seconds; default 30 seconds.

## Verification

After changing Netlify environment variables, trigger a new deploy so the function runtime receives the new values. The authenticated `GET /api/ai-chat` endpoint reports `configured`, provider, model and a non-secret configuration error when incomplete.

A configured response does **not** mean the provider is reachable; the first real POST still verifies provider authentication and availability. Provider error bodies are not returned to the browser.
