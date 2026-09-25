import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/app/main.tsx', import.meta.url), 'utf8');
const navBlock = src.slice(src.indexOf('const nav = ['), src.indexOf('] as const;'));
const navIds = [...navBlock.matchAll(/\['([a-z]+)','/g)].map(m => m[1]);
assert.ok(navIds.length >= 30, `expected ~31 nav ids, got ${navIds.length}`);

const groupBlock = src.slice(src.indexOf('const groups: NavGroup[]'), src.indexOf('function useSessionEmail'));
const grouped = [...groupBlock.matchAll(/items: \[([^\]]*)\]/g)].flatMap(m => [...m[1].matchAll(/'([a-z]+)'/g)].map(x => x[1]));

for (const id of navIds) assert.equal(grouped.filter(g => g === id).length, 1, `nav id "${id}" must be in exactly one rail group`);
for (const id of grouped) assert.ok(navIds.includes(id), `rail group references unknown nav id "${id}"`);
assert.match(src, /<OverviewLive onNavigate=\{choose\}/, 'Overview must be routed with navigation');
assert.match(src, /PortfolioProvider enabled=\{overviewVisited\}/, 'portfolio loads lazily, only after Overview is opened');
// setiap informasi di Overview yang bisa diklik harus mengarah ke modul yang benar-benar ada
import { WORKSTREAMS } from '../dist/core/workstreams.js';
for (const w of WORKSTREAMS) assert.ok(navIds.includes(w.module), `jalur "${w.key}" mengarah ke modul "${w.module}" yang tidak ada di nav`);
const dash = readFileSync(new URL('../src/app/components/OverviewDashboard.tsx', import.meta.url), 'utf8');
const driverBlock = dash.slice(dash.indexOf('const DRIVER_MODULE'), dash.indexOf('const DRIVER_ICON'));
const driverModules = [...driverBlock.matchAll(/module: '([a-z]+)'/g)].map(m => m[1]);
assert.ok(driverModules.length >= 7, 'setiap jenis temuan punya modul tujuan');
for (const id of driverModules) assert.ok(navIds.includes(id), `temuan mengarah ke modul "${id}" yang tidak ada di nav`);
assert.match(dash, /onOpenFor\('health', model\.selectedClientId\)/, 'kartu ringkasan membuka Business Health dengan konteks klien');

console.log(`PASS shell navigation (${navIds.length} modules, ${grouped.length} grouped)`);
