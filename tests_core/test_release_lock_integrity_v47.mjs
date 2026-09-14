import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url);
const pkg=JSON.parse(fs.readFileSync(new URL('package.json',root),'utf8'));
const lock=JSON.parse(fs.readFileSync(new URL('package-lock.json',root),'utf8'));
const deps={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
for(const name of Object.keys(deps)) assert.ok(lock.packages?.[`node_modules/${name}`],`lock must resolve ${name}`);
console.log('release lock integrity v47: PASS');
