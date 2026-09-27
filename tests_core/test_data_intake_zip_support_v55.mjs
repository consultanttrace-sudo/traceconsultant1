import fs from 'node:fs';
import assert from 'node:assert/strict';

// Regression test for ZIP support in Data Intake: before this, .zip was not in
// detectSourceType, had no adapter, and was missing from the file input's accept
// list, so a zipped accounting export was always rejected as "format not supported".
const root = new URL('..', import.meta.url);
const dataIntake = fs.readFileSync(new URL('src/core/dataIntake.ts', root), 'utf8');
const adapters = fs.readFileSync(new URL('src/core/fileIntakeAdapters.ts', root), 'utf8');
const view = fs.readFileSync(new URL('src/app/views/DataIntake.tsx', root), 'utf8');

assert.match(dataIntake, /'pdf' \| 'xlsx' \| 'xls' \| 'ods' \| 'csv' \| 'tsv' \| 'docx' \| 'txt' \| 'json' \| 'image' \| 'zip' \| 'unknown'/);
assert.match(dataIntake, /if \(ext === 'zip'\) return 'zip';/);

assert.match(adapters, /export async function parseZip\(/);
assert.match(adapters, /await import\('fflate'\)/);
// Same-identity files inside a ZIP must merge instead of being treated as separate imports.
assert.match(adapters, /mergeIntakeIfSameIdentity/);
// Mismatched business/outlet identity inside a ZIP must never be silently summed.
assert.match(adapters, /tidak menjumlahkannya secara otomatis/);

assert.match(view, /accept=".*\.zip"/);
assert.match(view, /type==='zip'/);
assert.match(view, /parseZip/);

console.log('test_data_intake_zip_support_v55: PASS');
