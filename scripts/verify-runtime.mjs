#!/usr/bin/env node
const requiredNode = '22.22.2';
const [major,minor,patch] = process.versions.node.split('.').map(Number);
const [rMajor,rMinor,rPatch] = requiredNode.split('.').map(Number);
const ok = major === rMajor && (minor > rMinor || (minor === rMinor && patch >= rPatch));
console.log(JSON.stringify({check:'node_runtime',required:`>=${requiredNode} <23`,actual:process.version,ok}));
if(!ok) {
  console.error(`NODE_RUNTIME_BLOCKED: TRACE requires Node >=${requiredNode} <23. Use .nvmrc/.node-version or Netlify NODE_VERSION=${requiredNode}.`);
  process.exit(2);
}
