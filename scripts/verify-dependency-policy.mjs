#!/usr/bin/env node
import fs from 'node:fs';
const root = new URL('..', import.meta.url);
const pkg=JSON.parse(fs.readFileSync(new URL('package.json',root),'utf8'));
const lockPath=new URL('package-lock.json',root);
const all={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
const floating=Object.entries(all).filter(([,v])=>/^(latest|next|canary|beta|alpha|dev|\*|[~^]|>=|<=|>|<)/i.test(v));
const invalid=Object.entries(all).filter(([,v])=>!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v));
let lock={packages:{}};
let lockError=null;
try { lock=JSON.parse(fs.readFileSync(lockPath,'utf8')); } catch(e) { lockError=String(e?.message||e); }
const rootLock=lock.packages?.[''];
const lockPackageEntries=Object.keys(lock.packages||{}).filter(k=>k.startsWith('node_modules/'));
const expectedNames=Object.keys(all);
const missingResolved=expectedNames.filter(name=>!lock.packages?.[`node_modules/${name}`]);
const complete=!!rootLock && lockPackageEntries.length>0 && missingResolved.length===0;
const ok=floating.length===0&&invalid.length===0&&!lockError&&complete;
console.log(JSON.stringify({check:'dependency_policy',packageManager:pkg.packageManager,floating,invalid,lockError,lockfileVersion:lock.lockfileVersion||null,resolvedPackageEntries:lockPackageEntries.length,missingResolved,complete,ok}));
if(!ok) process.exit(2);
