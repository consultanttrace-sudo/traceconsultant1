import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/core/financeInput.ts', import.meta.url), 'utf8');
assert.match(source, /INVALID_PERIOD/);
assert.match(source, /NEGATIVE_AMOUNT/);
assert.match(source, /MANUAL_WITHOUT_NOTE/);
assert.match(source, /TRACE tidak akan menganggap data ini valid/);
console.log('Finance input validation contract: PASS');
