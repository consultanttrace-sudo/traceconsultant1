import fs from 'node:fs';
const ui=fs.readFileSync(new URL('../src/app/views/AICenterView.tsx', import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../netlify/functions/ai-chat.js', import.meta.url),'utf8');
const main=fs.readFileSync(new URL('../src/app/main.tsx', import.meta.url),'utf8');
const checks=[
 ['AI Center navigation',main, /\['ai','AI Center',Brain\]/],
 ['Business Advisor mode',ui,/business_advisor/],
 ['Guardian mode',ui,/guardian/],
 ['Engineering mode',ui,/engineering/],
 ['Usage requests counter',ui,/usage\.requests/],
 ['Quota counter',ui,/usage\.quota/],
 ['HTTP 429 tracking',ui,/r\.status===429/],
 ['No raw provider payload',api,()=>!/:raw:data/.test(api)],
 ['Gemini provider',api,/GEMINI_API_KEY/],
 ['Gemini endpoint',api,/generativelanguage\.googleapis\.com/],
 ['Fail closed quota',api,/AI_PROVIDER_QUOTA/],
 ['Server-side key only',ui,()=>!/GEMINI_API_KEY/.test(ui)]
];
for(const [name,target,check] of checks){const pass=check instanceof RegExp?check.test(target):typeof check==='function'?check():check;if(!pass)throw new Error(`FAILED: ${name}`)}
console.log('PASS: AI Center release contract (12/12)');
