import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('..',import.meta.url);
const sql=fs.readFileSync(new URL('supabase/migrations/010_trace_checkpoint_concurrency_guard.sql',root),'utf8');
assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\(new\.job_id::text, 0\)\)/);
assert.match(sql,/select max\(sequence_no\)/i);
assert.match(sql,/TRACE_CHECKPOINT_SEQUENCE_NOT_MONOTONIC/);
console.log('operational SQL concurrency guard v47: PASS');
