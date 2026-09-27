import fs from 'node:fs';
import assert from 'node:assert/strict';

// Regression test for the "data hilang saat ganti akun" bug: trace_data_intake_imports
// and trace_commit_canonical_pos_import used to scope their lookups by actor_user_id
// (the uploading team member), so a teammate logging in under a different account could
// never see or continue an import that was still in draft/reviewed status. See migration
// 055 for the full write-up.
const root = new URL('..', import.meta.url);
const migration = fs.readFileSync(new URL('supabase/migrations/055_data_intake_team_visibility_fix.sql', root), 'utf8');

// RLS: any active team member can see the shared ledger, not just the uploader/a leader.
assert.match(migration, /create policy trace_data_intake_imports_member[\s\S]*?using \(public\.trace_is_team_member\(\)\)/);

// trace_transition_data_intake: once a client is attached, lookup is by (client_id, source_hash),
// so any team member finds the same shared row instead of only their own actor_user_id rows.
assert.match(migration, /where client_id=v_client and source_hash=lower\(p_source_hash\) for update/);
// A still-unscoped draft (no client chosen yet) keeps falling back to the personal lookup.
assert.match(migration, /where actor_user_id=v_actor and source_hash=lower\(p_source_hash\) and client_id is null for update/);

// trace_commit_canonical_pos_import: approval check and the trailing client_id backfill no
// longer require actor_user_id=actor, so whoever approved the import doesn't have to be the
// same person committing the canonical POS rows.
const canonicalFn = migration.slice(migration.indexOf('trace_commit_canonical_pos_import'));
assert.match(canonicalFn, /where source_hash=lower\(p_source_hash\) and status='approved' and client_id=p_organization_id\)/);
assert.doesNotMatch(canonicalFn.split('\n').filter(l => l.includes('TRACE_CANONICAL_IMPORT_NOT_APPROVED_OR_SCOPED') || l.includes("status='approved';")).join('\n'), /actor_user_id=actor/);

console.log('test_data_intake_team_visibility_v55: PASS');
