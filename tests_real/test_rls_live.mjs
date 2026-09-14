// test_rls_live.mjs — RLS probe against a REAL Supabase project.
//
// WHY THIS FILE EXISTS: everything under tests_real/ that ran before this file used a mocked
// Supabase client (see make-supa-mock.js). A mock can never prove Postgres RLS policies actually
// block cross-client access — RLS only exists inside a real Postgres instance. This script is the
// first attempt at a real check, and it CANNOT be run from this sandbox: my network here is
// allowlisted to package registries only (no *.supabase.co), and I have no credentials for your
// project. You (or your CI, from a machine with real network access) must run this yourself.
//
// SETUP REQUIRED BEFORE RUNNING (all external to this codebase):
//   1. A staging Supabase project (do NOT point this at production data).
//   2. Two real authenticated users created in that project's auth.users, one added as a team
//      member scoped to client "test-client-a", the other with no scope / a different client.
//   3. Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_A_EMAIL, TEST_USER_A_PASSWORD,
//      TEST_USER_B_EMAIL, TEST_USER_B_PASSWORD.
//   4. Run: `node tests_real/test_rls_live.mjs`
//
// This does not "fix" RLS — it only tells you, against your real database, whether the policies
// already written in supabase/migrations/*.sql behave as intended. If it fails, the bug is in the
// SQL migrations, not in this script.
import { createClient } from '@supabase/supabase-js';

const need = ['SUPABASE_URL','SUPABASE_ANON_KEY','TEST_USER_A_EMAIL','TEST_USER_A_PASSWORD','TEST_USER_B_EMAIL','TEST_USER_B_PASSWORD'];
const missing = need.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('This script refuses to run partially — see the setup comment at the top of the file.');
  process.exit(1);
}

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('PASS:', msg); } else { fail++; console.error('FAIL:', msg); } }

async function signIn(email, password) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Login failed for ${email}: ${error.message}`);
  return client;
}

async function run() {
  const clientA = await signIn(process.env.TEST_USER_A_EMAIL, process.env.TEST_USER_A_PASSWORD);
  const clientB = await signIn(process.env.TEST_USER_B_EMAIL, process.env.TEST_USER_B_PASSWORD);

  // 1) User A seeds accounts for their own scoped client — must succeed.
  const seedA = await clientA.rpc('trace_seed_default_chart', { p_client_id: 'test-client-a' });
  assert(!seedA.error, `user A can seed chart of accounts for their own client scope (${seedA.error?.message ?? 'ok'})`);

  // 2) User A reads their own client's accounting dataset — must succeed and be non-empty.
  const readA = await clientA.rpc('trace_read_client_dataset', { p_client_id: 'test-client-a' });
  assert(!readA.error && Array.isArray(readA.data?.accounts) && readA.data.accounts.length > 0,
    `user A can read their own client's accounts (${readA.error?.message ?? readA.data?.accounts?.length + ' accounts'})`);

  // 3) User B (different/no scope) tries to read client A's dataset — MUST be rejected, not just
  //    return an empty array. An empty array with no error is a silent RLS failure, not a pass.
  const readB = await clientB.rpc('trace_read_client_dataset', { p_client_id: 'test-client-a' });
  assert(!!readB.error, `user B is REJECTED (not silently emptied) when reading client A's data (got: ${readB.error ? readB.error.message : JSON.stringify(readB.data).slice(0,120)})`);

  // 4) User B tries to post a journal entry into client A's scope — must be rejected.
  const postB = await clientB.rpc('trace_post_balanced_journal', {
    p_client_id: 'test-client-a', p_entry_date: new Date().toISOString().slice(0,10),
    p_reference_type: null, p_reference_id: null, p_memo: 'rls-probe-should-fail', p_source: 'manual',
    p_lines: [{ account_id: readA.data?.accounts?.[0]?.id, debit: 1, credit: 0 }, { account_id: readA.data?.accounts?.[0]?.id, debit: 0, credit: 1 }],
  });
  assert(!!postB.error, `user B is rejected when posting a journal entry into client A's scope (got: ${postB.error ? postB.error.message : 'no error — POLICY GAP'})`);

  // 5) Direct table select (bypassing RPC) must also be blocked by RLS for an out-of-scope user.
  const directB = await clientB.from('trace_accounts').select('*').eq('client_id', 'test-client-a');
  assert(!directB.error && Array.isArray(directB.data) && directB.data.length === 0,
    `user B's direct table read of client A's accounts returns zero rows under RLS (got ${directB.data?.length ?? 'error: ' + directB.error?.message} rows)`);

  console.log(`\n${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

run().catch(e => { console.error('Script error:', e.message); process.exit(1); });
