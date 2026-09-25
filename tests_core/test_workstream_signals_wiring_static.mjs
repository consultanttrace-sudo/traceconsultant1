import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIGNAL_RESOURCES } from '../dist/core/workstreamSignals.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const portfolio = read('src/app/portfolio.tsx');
const shared = read('src/app/views/_shared.tsx');
const netlify = read('netlify/functions/trace-data.js');
const sql = read('supabase/migrations/033_client_scope_ar_ap_assets_read_v72.sql');

// Setiap resource sinyal harus ada di tiga tempat, kalau tidak, sinyalnya diam-diam kosong/ditolak 400 di produksi.
const union = shared.match(/export type TraceResource = ([^;]+);/)[1];
const allowed = netlify.match(/const RESOURCES = new Set\(\[([\s\S]*?)\]\);/)[1];
for (const r of SIGNAL_RESOURCES) {
  assert.ok(union.includes(`'${r}'`), `TraceResource (_shared.tsx) tidak memuat '${r}'`);
  assert.ok(allowed.includes(`'${r}'`), `RESOURCES di trace-data.js tidak memuat '${r}'`);
  assert.ok(sql.includes(`'${r}',`), `trace_read_client_dataset (migration 033) tidak mengembalikan '${r}'`);
}

// portfolio.tsx: sinyal dimuat per klien terpilih, tidak untuk semua klien.
assert.match(portfolio, /loadTraceCollections\(\[\], SIGNAL_RESOURCES, clientId\)/, 'sinyal dimuat dengan client_id klien terpilih');
assert.match(portfolio, /if \(phase !== 'ready' \|\| !clientId\) \{ setSignalRaw\(null\); return; \}/, 'tanpa klien terpilih, tidak ada fetch sinyal');
assert.match(portfolio, /diagnoseClient\(allRows\[i\], c\.records, c\.id === clientId \? signals : undefined\)/, 'sinyal hanya diberikan ke klien terpilih');
assert.match(portfolio, /signalRaw\.clientId !== clientId\) return undefined/, 'respons klien lama tidak dipakai setelah ganti klien');
assert.match(portfolio, /failedSignals\(signalRaw\.error\)/, 'gagal muat → jalur manual dengan alasan, bukan diam');
assert.doesNotMatch(portfolio, /loadOne\([^)]*\)[\s\S]{0,400}SIGNAL_RESOURCES/, 'loadOne (semua klien) tidak boleh memuat resource sinyal');
console.log('PASS workstream signals wiring (resource terdaftar di UI/API/SQL; per-klien; anti-stale)');
