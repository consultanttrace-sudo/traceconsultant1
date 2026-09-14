import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('..', import.meta.url);
const index = fs.readFileSync(new URL('index.html', root), 'utf8');

assert.match(index, /guardAttempts = 3/, 'overwrite verification must retry transient cloud failures with a bounded attempt count');
assert.match(index, /guardTimeoutMs = 5000/, 'overwrite verification must have a bounded request timeout');
assert.match(index, /const controller = new AbortController\(\)/, 'cloud writes must use a real AbortController');
assert.match(index, /\.abortSignal\(controller\.signal\)/, 'Supabase write must receive the abort signal');
assert.match(index, /controller\.abort\(\)/, 'write timeout must abort the underlying request');
assert.match(index, /TRACE_SAVE_TIMEOUT:/, 'timeout must be explicit and diagnosable');
assert.match(index, /return false;\s*\}\s*catch \(e2\)/, 'local recovery must not be reported as authoritative cloud success');
assert.match(index, /a local recovery copy is NOT a successful cloud save/i, 'truthful unsynced-save contract must remain documented');

console.log('test_persistence_safety_v44: PASS');
assert.match(index, /if \(lastGuardError\)/, 'verification failure must be handled as a hard stop after bounded retries');
assert.match(index, /Tidak ada write yang dijalankan/, 'verification failure must notify the user and stop the write');
