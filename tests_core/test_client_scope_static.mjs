import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const viewsDir = new URL('../src/app/views/', import.meta.url);
const main = readFileSync(new URL('../src/app/main.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../src/app/scopeStore.ts', import.meta.url), 'utf8');
const scopeCore = readFileSync(new URL('../src/core/scope.ts', import.meta.url), 'utf8');
const clientWrapper = readFileSync(new URL('../src/app/clientScope.ts', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../src/app/portfolio.tsx', import.meta.url), 'utf8');

// the store mirrors the selection in the URL through the pure core (client, outlet, period) and re-renders via useSyncExternalStore
assert.match(store, /writeScope\(location\.search/);
assert.match(store, /useSyncExternalStore/);
assert.match(scopeCore, /put\('client'/);
assert.match(clientWrapper, /dispatchScope\(\{ type: 'client'/, 'client wrapper must go through the reducer so the outlet resets');

// no module may keep a private client selection any more (they would drift from the top-bar chip)
const usesScope = [];
for (const f of readdirSync(viewsDir).filter(n => n.endsWith('.tsx'))) {
  const src = readFileSync(new URL(f, viewsDir), 'utf8');
  assert.ok(!src.includes("const [clientId,setClientId]=useState('')"), `${f} still keeps a private clientId`);
  if (src.includes('useClientScope')) usesScope.push(f.replace('.tsx', ''));
}
assert.ok(usesScope.length >= 18, `expected >=18 modules on the shared scope, got ${usesScope.length}`);

// isolation: modules still fetch with the selected client id only, and the store cannot carry two clients
assert.match(provider, /loadTraceCollections\(\[\], \['finance', 'alerts', 'tasks'\], client\.id\)/, 'per-client scoped load must stay');
assert.doesNotMatch(provider, /trace_read_global|from\('trace_finance/, 'portfolio must only use the scoped API');

// every module that shows the top-bar client chip really reads the shared scope
const chipIds = [...main.match(/const CLIENT_SCOPED = new Set\(\[([^\]]*)\]/)[1].matchAll(/'([a-z]+)'/g)].map(m => m[1]);
const routeToView = Object.fromEntries([...main.matchAll(/active==='([a-z]+)' \? <([A-Za-z]+) \/>/g)].map(m => [m[1], m[2]]));
for (const id of chipIds) {
  const view = routeToView[id];
  assert.ok(view, `chip module "${id}" has no route`);
  const file = readdirSync(viewsDir).find(n => readFileSync(new URL(n, viewsDir), 'utf8').includes(`export function ${view}(`));
  assert.ok(file, `no file exports ${view}`);
  assert.ok(readFileSync(new URL(file, viewsDir), 'utf8').includes('useClientScope'), `${view} shows the client chip but ignores the shared scope`);
}
console.log(`PASS client scope (${usesScope.length} modules share one selection, chip on ${chipIds.length})`);
