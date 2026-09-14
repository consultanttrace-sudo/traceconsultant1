import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root=process.cwd();
const out=path.join(root,'netlify','functions','_diagnostic-manifest.json');
const allowed=new Set(['.ts','.tsx','.js','.jsx','.json','.sql','.css','.html','.toml']);
const blockedDirs=new Set(['node_modules','.git','dist','.next','coverage']);
const blockedNames=new Set(['.env','.env.local','.env.production','.env.development']);
const files=[];
const staticChecks=[];
function sanitize(content){
  return content
    .replace(/(SUPABASE_ANON_KEY\s*=\s*['"]).*?(['"])/g, '$1[REDACTED_PUBLIC_CLIENT_KEY]$2')
    .replace(/(SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]).*?(['"])/g, '$1[REDACTED_SECRET]$2')
    .replace(/(GOOGLE_MAPS_API_KEY\s*=\s*['"]).*?(['"])/g, '$1[REDACTED_SECRET]$2')
    .replace(/(api[_-]?key\s*[:=]\s*['"]).*?(['"])/gi, '$1[REDACTED_SECRET]$2');
}
function walk(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(blockedDirs.has(entry.name)) continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory()){walk(full);continue;}
    if(!allowed.has(path.extname(entry.name).toLowerCase()) || blockedNames.has(entry.name)) continue;
    const rel=path.relative(root,full).replaceAll(path.sep,'/');
    if(rel.startsWith('netlify/functions/_diagnostic-manifest')) continue;
    const content=sanitize(fs.readFileSync(full,'utf8'));
    files.push({path:rel,content});
  }
}
walk(root);
files.sort((a,b)=>a.path.localeCompare(b.path));
const known = new Set(files.map(f => f.path));
for (const file of files) {
  if (!/\.(?:js|jsx|ts|tsx)$/.test(file.path)) continue;
  const importRe = /(?:import\s+(?:[^'\"]+?\s+from\s+)?|export\s+[^'\"]+?\s+from\s+|require\s*\(\s*)['\"](\.[^'\"]+)['\"]/g;
  for (const match of file.content.matchAll(importRe)) {
    const spec = match[1];
    if (!spec) continue;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), spec));
    const extensionless = base.replace(/\.(?:js|jsx|mjs|cjs|ts|tsx)$/, '');
    const candidates = [base, extensionless, `${extensionless}.ts`, `${extensionless}.tsx`, `${extensionless}.js`, `${extensionless}.jsx`, `${extensionless}.mjs`, `${extensionless}.cjs`, `${extensionless}/index.ts`, `${extensionless}/index.tsx`, `${extensionless}/index.js`, `${extensionless}/index.jsx`, `${extensionless}/index.mjs`, `${extensionless}/index.cjs`];
    if (!candidates.some(x => known.has(x))) {
      staticChecks.push({kind:'missing_local_import',file:file.path,code:spec,reason:`Local import ${spec} does not resolve to a manifest file.`});
    }
  }
}
for (const file of files.filter(f => /\.m?js$/.test(f.path))) {
  const check = spawnSync(process.execPath, ['--check', path.join(root, file.path)], {encoding:'utf8'});
  if (check.status !== 0) staticChecks.push({kind:'syntax',file:file.path,reason:'node --check failed.',code:(check.stderr || check.stdout || '').slice(0,1200)});
}
fs.writeFileSync(out,JSON.stringify({version:2,generatedAt:new Date().toISOString(),readOnly:true,files,staticChecks},null,2));
console.log(`Diagnostic manifest: ${files.length} text files, ${staticChecks.length} static checks`);
