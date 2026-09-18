import fs from 'node:fs';
const api=fs.readFileSync(new URL('../netlify/functions/ai-chat.js', import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../src/app/views/AICenterView.tsx', import.meta.url),'utf8');
for(const [name,re] of [
 ['Gemini key',/GEMINI_API_KEY/],['Gemini model',/GEMINI_MODEL/],['Gemini endpoint',/generativelanguage\.googleapis\.com/],['Business Advisor mode',/business_advisor/],['Guardian mode',/guardian/],['Evidence-first business prompt',/Never invent numbers, sources, transactions/],['Universal answer',/answer:String\(answer/],['AI Center UI',/TRACE AI CENTER/],['Advisor context fields',/Evidence\/data/],['No auto deploy in center',/Tidak ada auto-deploy/]
]) if(!re.test(name==='AI Center UI'||name==='Advisor context fields'||name==='No auto deploy in center'?ui:api)) throw new Error(`FAILED: ${name}`);
console.log('PASS: Gemini + Business Advisor + Guardian contract (10/10)');
