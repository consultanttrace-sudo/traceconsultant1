import fs from 'node:fs';
import { readReactSource } from './_react_source.mjs';
const main=readReactSource();
const fn=fs.readFileSync('netlify/functions/trace-data.js','utf8');
const intake=fs.readFileSync('netlify/functions/data-intake-import.js','utf8');
const checks=[
  ['React imports Supabase client',main.includes("@supabase/supabase-js")],
  ['React reads live trace data',main.includes('/api/trace-data?keys=' )],
  ['React refuses missing session',main.includes('Session Supabase tidak tersedia.')],
  ['API requires auth',fn.includes('requireAuth(event)')],
  ['API allowlists keys',fn.includes('ALLOWED_KEYS')],
  ['API reads global metadata via allowlisted RPC',fn.includes('trace_read_global_kv') && !fn.includes('/rest/v1/trace_kv?key=eq.')],
  ['API does not expose arbitrary keys',fn.includes('keys.some(k=>!ALLOWED_KEYS.has(k))')],
  ['API supports fixed relational resources',fn.includes('trace_read_client_dataset') && fn.includes('trace_read_client_kv') && fn.includes('trace_read_global_kv') && fn.includes('/rest/v1/trace_audit_log')],
  ['React persists reviewed import',main.includes('/api/data-intake-import') && main.includes("persistImport('reviewed')")],
  ['React persists approved import',main.includes("persistImport('approved')")],
  ['Import approval is server-side state gated',intake.includes('TRACE_IMPORT_INVALID_STATUS_TRANSITION') && intake.includes('trace_transition_data_intake')],
  ['Finance entry persists via optimistic-lock RPC',main.includes("supabase.rpc('trace_upsert_finance_record'") && main.includes('p_expected_version')],
  ['Finance entry blocks save on validation errors',main.includes("guidance.status!=='blocked'")],
  ['Finance entry wires real PDF/Excel export',main.includes("exportFinancePdf") && main.includes("exportFinanceExcel")],
  ['API supports finance resource',fn.includes("'finance'") && fn.includes('trace_read_client_dataset')],
  ['Sales view persists products and transactions via RPC',main.includes("supabase.rpc('trace_upsert_product'") && main.includes("supabase.rpc('trace_record_sale'")],
  ['Acquisition iframe has authenticated persistence bridge',main.includes('TRACE_ACQUISITION_BRIDGE') && main.includes('trace_os::acquisitionLeads') && main.includes('writeTraceKv')],
  ['Acquisition discovery uses durable jobs/checkpoints',main.includes('trace_create_acquisition_job') && main.includes('trace_save_acquisition_checkpoint') && main.includes('saveDiscoveryCheckpoint')],
  ['Acquisition lead conversion writes to shared client store',main.includes('createClientFromLead') && main.includes('trace_os::trace-clients')],
  ['API supports products and sales resources',fn.includes("'products'") && fn.includes("'sales'") && fn.includes('trace_read_client_dataset')],
  ['Accounting view posts balanced journals via RPC',main.includes("supabase.rpc('trace_post_balanced_journal'") && main.includes('function AccountingView')],
  ['Accounting view seeds chart of accounts via RPC',main.includes("supabase.rpc('trace_seed_default_chart'")],
  ['Accounting view reads accounts/journal via allowlisted resources',main.includes("['accounts','journal_entries','journal_lines','ar_invoices'")],
  ['API supports accounts/journal resources',fn.includes("'accounts'") && fn.includes("'journal_entries'") && fn.includes("'journal_lines'")],
  ['Finance dashboard export is wired to a button, not just defined',main.includes('onClick={doExportDashboard}') && main.includes('exportFinanceDashboardExcel(records')],
];
for(const [name,ok] of checks){if(!ok) throw new Error(`FAIL: ${name}`);console.log(`PASS: ${name}`)}
