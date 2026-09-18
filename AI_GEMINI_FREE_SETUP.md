# TRACE AI — Gemini Free Tier Setup

TRACE v72.14 now supports Gemini as the default AI provider for the in-app AI Center.

## 1. Create the API key

Create/manage a Gemini API key in Google AI Studio:

https://aistudio.google.com/apikey

The key must stay server-side. Do **not** paste it into React source, GitHub, browser localStorage, or the public HTML.

## 2. Netlify Environment Variables

Set these variables for the deployed site/function environment:

```text
TRACE_AI_PROVIDER=gemini
GEMINI_API_KEY=<your Gemini API key>
GEMINI_MODEL=gemini-2.5-flash-lite
TRACE_AI_TIMEOUT_MS=30000
```

`gemini-2.5-flash-lite` is used as the default when `GEMINI_MODEL` is omitted. The model is selected because Google's current Gemini pricing documentation lists a Free Tier for Gemini 2.5 Flash-Lite.

## 3. What becomes available in TRACE

Open **AI Center** from the main navigation.

### Business Advisor

- business/client name
- analysis period
- evidence/data from TRACE
- main business question
- conversational follow-up
- evidence-first reasoning
- missing-data identification
- percentage calculations only when source values are supplied

### TRACE Guardian

- incident/root-cause analysis using supplied evidence
- confirmed vs suspected vs blocked distinction
- safe next steps
- link to the existing Diagnostic Center, telemetry, security scan and repair approval workflow

### AI Engineer

The existing engineering chat remains available through the same provider layer.

## 4. Free-tier safety

A free API key is not the same thing as unlimited API access. Gemini Free Tier has usage/rate limits. TRACE therefore returns a truthful quota error instead of inventing an answer when the provider returns HTTP 429.

The free tier also has different data-use terms from paid tier. Review Google's current Gemini API pricing and data-use terms before sending sensitive client information.

## 5. Security rule

Never commit `GEMINI_API_KEY` to GitHub.

The browser calls `/api/ai-chat`; the Netlify Function reads `GEMINI_API_KEY` from the server environment and calls Gemini. The API key is not sent to the React client.
