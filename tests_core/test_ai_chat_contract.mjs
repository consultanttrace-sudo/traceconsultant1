import fs from 'node:fs';
const src=fs.readFileSync(new URL('../netlify/functions/ai-chat.js', import.meta.url),'utf8');
if(src.includes('MAX_MESSAGES')) throw new Error('FAILED: artificial MAX_MESSAGES cap remains');
if(src.includes('MAX_CHARS')) throw new Error('FAILED: artificial MAX_CHARS cap remains');
if(!src.includes("['user','assistant']")) throw new Error('FAILED: client role allowlist missing');
if(!src.includes("{role:'system',content:system}")) throw new Error('FAILED: server system prompt missing');
console.log('PASS: AI chat has no TRACE message/character truncation and client cannot inject system role.');
