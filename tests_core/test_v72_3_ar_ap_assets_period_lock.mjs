import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readReactSource } from './_react_source.mjs';

const main=readReactSource();
const sql032 = fs.readFileSync('supabase/migrations/032_ar_ap_fixed_assets_period_close_v72.sql', 'utf8');
const sql033 = fs.readFileSync('supabase/migrations/033_client_scope_ar_ap_assets_read_v72.sql', 'utf8');

// --- Tabel dan RLS fail-closed di migration 032 ---
for (const table of [
  'trace_ar_invoices', 'trace_ar_payments', 'trace_ap_bills',
  'trace_ap_payments', 'trace_fixed_assets', 'trace_period_locks',
]) {
  assert.match(sql032, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(sql032, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(sql032, /revoke all on\s+public\.trace_ar_invoices, public\.trace_ar_payments,\s+public\.trace_ap_bills, public\.trace_ap_payments,\s+public\.trace_fixed_assets, public\.trace_period_locks\s+from anon, authenticated/);

// --- RPC tulis wajib ada, dan wajib mengecek trace_is_team_member() ---
for (const fn of [
  'trace_create_ar_invoice', 'trace_record_ar_payment', 'trace_create_ap_bill',
  'trace_record_ap_payment', 'trace_create_fixed_asset', 'trace_lock_period',
]) {
  assert.match(sql032, new RegExp(`create or replace function public\\.${fn}`));
}
assert.match(sql032, /TRACE_AR_ACTOR_FORBIDDEN/);
assert.match(sql032, /TRACE_AP_ACTOR_FORBIDDEN/);
assert.match(sql032, /TRACE_FIXED_ASSET_ACTOR_FORBIDDEN/);
assert.match(sql032, /TRACE_PERIOD_LOCK_ACTOR_FORBIDDEN/);

// --- Period lock benar-benar menutup celah lama di trace_post_balanced_journal ---
assert.match(sql032, /create or replace function public\.trace_post_balanced_journal/);
assert.match(sql032, /TRACE_JOURNAL_PERIOD_LOCKED/);
assert.match(sql032, /from public\.trace_period_locks pl/);

// --- Tidak ada RPC untuk membuka kunci periode (satu arah, sesuai periodClose.ts) ---
assert.doesNotMatch(sql032, /trace_unlock_period/);

// --- trace_read_client_dataset (033) benar-benar mengembalikan 6 dataset baru ---
for (const key of ['ar_invoices', 'ar_payments', 'ap_bills', 'ap_payments', 'fixed_assets', 'period_locks']) {
  assert.match(sql033, new RegExp(`'${key}',`));
}
assert.match(sql033, /revoke select on\s+public\.trace_ar_invoices, public\.trace_ar_payments,\s+public\.trace_ap_bills, public\.trace_ap_payments,\s+public\.trace_fixed_assets, public\.trace_period_locks\s+from authenticated/);

// --- UI React: AccountingView benar-benar fetch dan panggil RPC-nya, bukan cuma logic .ts yang tidak dipakai ---
assert.match(main, /import \{ buildArAging, type ArInvoice, type ArPayment \} from '\.\.(?:\/\.\.)?\/core\/accountsReceivable'/);
assert.match(main, /import \{ buildApAging, type ApBill, type ApPayment \} from '\.\.(?:\/\.\.)?\/core\/accountsPayable'/);
assert.match(main, /import \{ buildDepreciationSchedule, totalMonthlyDepreciation, type FixedAsset \} from '\.\.(?:\/\.\.)?\/core\/fixedAssets'/);
assert.match(main, /import \{ isPeriodLocked, type PeriodLock \} from '\.\.(?:\/\.\.)?\/core\/periodClose'/);
assert.match(main, /import \{ buildBalanceSheet, type BalanceSheetGroup \} from '\.\.(?:\/\.\.)?\/core\/balanceSheet'/);
assert.match(main, /import \{ withInferredSubTypes \} from '\.\.(?:\/\.\.)?\/core\/accountSubTypeInference'/);

assert.match(main, /'ar_invoices','ar_payments','ap_bills','ap_payments','fixed_assets','period_locks'/);
for (const rpc of [
  'trace_create_ar_invoice', 'trace_record_ar_payment', 'trace_create_ap_bill',
  'trace_record_ap_payment', 'trace_create_fixed_asset', 'trace_lock_period',
]) {
  assert.match(main, new RegExp(`supabase\\.rpc\\('${rpc}'`));
}
assert.match(main, /buildBalanceSheet\(withInferredSubTypes\(ledgerAccounts\)/);

// --- Tutup buku: tidak boleh ada tombol "buka kunci" di UI ---
assert.doesNotMatch(main, /buka kunci/i);
assert.doesNotMatch(main, /unlock/i);

console.log('v72.3 AR/AP/fixed assets/period lock/Neraca wiring: PASS');
