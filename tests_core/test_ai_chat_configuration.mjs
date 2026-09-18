import fs from 'node:fs';
const src=fs.readFileSync(new URL('../netlify/functions/ai-chat.js', import.meta.url),'utf8');
const checks=[
  ['OpenAI key fallback endpoint', /https:\/\/api\.openai\.com\/v1\/chat\/completions/],
  ['TRACE custom endpoint', /TRACE_AI_ENDPOINT/],
  ['model is required', /TRACE_AI_MODEL.*OPENAI_MODEL/],
  ['custom API key support', /TRACE_AI_API_KEY/],
  ['explicit unconfigured code', /AI_NOT_CONFIGURED/],
  ['GET configuration status', /httpMethod==='GET'/],
  ['server system prompt', /role:'system'/],
  ['client role allowlist', /\['user','assistant'\]/],
  ['bounded timeout', /Math\.min\(60000/],
  ['provider auth error is sanitized', /AI_PROVIDER_AUTH_FAILED/],
];
for(const [name,re] of checks){if(!re.test(src))throw new Error(`FAILED: ${name}`)}
if(src.includes("detail:text.slice(0,500)"))throw new Error('FAILED: provider response body is exposed to client');
console.log(`PASS: AI chat configuration contract (${checks.length}/${checks.length})`);
